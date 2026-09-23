import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function weekStartUtc(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export const getBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: me } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", userId)
      .single();

    const { data: friendships } = await supabase
      .from("friendships")
      .select("id, user_id, friend_id, status");

    const accepted = (friendships ?? []).filter((f) => f.status === "accepted");
    const incoming = (friendships ?? []).filter(
      (f) => f.status === "pending" && f.friend_id === userId,
    );

    const friendIds = accepted.map((f) => (f.user_id === userId ? f.friend_id : f.user_id));
    const peopleIds = [userId, ...friendIds];
    // Pending requesters aren't friends yet, but we still need their names.
    const profileIds = [...new Set([...peopleIds, ...incoming.map((f) => f.user_id)])];

    const { data: people } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", profileIds);

    const since = weekStartUtc().toISOString();
    const { data: workouts } = await supabase
      .from("workouts")
      .select("id, user_id, photo_path, note, created_at")
      .in("user_id", peopleIds)
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    const { data: allTime } = await supabase
      .from("workouts")
      .select("user_id")
      .in("user_id", peopleIds);

    const nameOf = (id: string) => {
      const p = (people ?? []).find((x) => x.id === id);
      return p?.display_name || p?.username || "Athlete";
    };

    const weeklyCount = new Map<string, number>();
    for (const w of workouts ?? []) {
      weeklyCount.set(w.user_id, (weeklyCount.get(w.user_id) ?? 0) + 1);
    }
    const totalCount = new Map<string, number>();
    for (const w of allTime ?? []) {
      totalCount.set(w.user_id, (totalCount.get(w.user_id) ?? 0) + 1);
    }

    const friends = friendIds
      .map((id) => ({
        userId: id,
        name: nameOf(id),
        initials: initials(nameOf(id)),
        weekly: weeklyCount.get(id) ?? 0,
        total: totalCount.get(id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const proofs = [] as {
      id: string;
      url: string | null;
      name: string;
      note: string | null;
      createdAt: string;
      mine: boolean;
    }[];
    for (const w of (workouts ?? []).slice(0, 12)) {
      let url: string | null = null;
      if (w.photo_path) {
        const { data: signed } = await supabase.storage
          .from("proofs")
          .createSignedUrl(w.photo_path, 3600);
        url = signed?.signedUrl ?? null;
      }
      proofs.push({
        id: w.id,
        url,
        name: nameOf(w.user_id),
        note: w.note,
        createdAt: w.created_at,
        mine: w.user_id === userId,
      });
    }

    const incomingProfiles = incoming.map((f) => {
      const other = f.user_id;
      const p = (people ?? []).find((x) => x.id === other);
      return {
        id: f.id,
        name: nameOf(other),
        username: p?.username ?? "",
        initials: initials(nameOf(other)),
      };
    });

    return {
      me: {
        id: userId,
        name: me?.display_name || me?.username || "Athlete",
        username: me?.username ?? "",
      },
      friendCount: friendIds.length,
      myWeekly: weeklyCount.get(userId) ?? 0,
      myTotal: totalCount.get(userId) ?? 0,
      proofs,
      friends,
      incoming: incomingProfiles,
    };
  });

export const searchUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ query: z.string().min(1).max(50) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Escape LIKE wildcards so only an exact (case-insensitive) match hits.
    const term = data.query.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
    if (!term) return [];
    const { data: rows } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      // Exact match on username or display name (case-insensitive).
      .or(`username.ilike.${term},display_name.ilike.${term}`)
      .neq("id", userId)
      .limit(8);

    const { data: friendships } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status");

    const linked = new Map<string, string>();
    for (const f of friendships ?? []) {
      const other = f.user_id === userId ? f.friend_id : f.user_id;
      if (other !== userId) linked.set(other, f.status);
    }

    return (rows ?? []).map((p) => ({
      id: p.id,
      username: p.username,
      name: p.display_name || p.username,
      initials: initials(p.display_name || p.username),
      status: linked.get(p.id) ?? null,
    }));
  });

export const addFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ friendId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // If they already sent me a request, accept it instead of duplicating.
    const { data: reverse } = await supabase
      .from("friendships")
      .select("id, status")
      .eq("user_id", data.friendId)
      .eq("friend_id", userId)
      .maybeSingle();

    if (reverse) {
      if (reverse.status === "pending") {
        await supabase
          .from("friendships")
          .update({ status: "accepted" })
          .eq("id", reverse.id);
      }
      return { ok: true };
    }

    const { error } = await supabase
      .from("friendships")
      .insert({ user_id: userId, friend_id: data.friendId, status: "pending" });
    if (error && error.code !== "23505") throw new Error(error.message);
    return { ok: true };
  });

export const respondToRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ friendshipId: z.string().uuid(), accept: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.accept) {
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", data.friendshipId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", data.friendshipId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const logWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ photoPath: z.string().max(300).optional(), note: z.string().max(80).optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("workouts").insert({
      user_id: userId,
      photo_path: data.photoPath ?? null,
      note: data.note?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkNameAvailable = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ name: z.string().trim().min(1).max(30) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const name = data.name;
    const { data: rows } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .or(`username.ilike.${name},display_name.ilike.${name}`)
      .limit(1);
    return { available: !rows || rows.length === 0 };
  });

export const deleteWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: workout, error: fetchErr } = await supabase
      .from("workouts")
      .select("id, photo_path")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (fetchErr || !workout) throw new Error("Workout not found");
    const { error } = await supabase.from("workouts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (workout.photo_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("proofs").remove([workout.photo_path]);
    }
    return { ok: true };
  });

/** The signed-in user's own name, for the header chip shown on every page. */
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", userId)
      .maybeSingle();
    const name = me?.display_name || me?.username || "Athlete";
    return {
      id: userId,
      name,
      username: me?.username ?? "",
      initials: initials(name),
    };
  });
