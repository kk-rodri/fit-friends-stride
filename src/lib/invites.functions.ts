import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const codeSchema = z.string().regex(/^[A-Za-z0-9_-]{12,32}$/);

/** 12 random URL-safe characters (72 bits): unguessable, unlike usernames. */
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertOwnsChallenge(userId: string, challengeId: string) {
  const db = await admin();
  const { data } = await db
    .from("challenges")
    .select("owner_id")
    .eq("id", challengeId)
    .maybeSingle();
  if (data?.owner_id !== userId) throw new Error("Only the Stride's creator can share its invite");
}

async function createInvite(userId: string, challengeId: string | null) {
  const db = await admin();
  const code = newCode();
  const { error } = await db
    .from("invites")
    .insert({ code, user_id: userId, challenge_id: challengeId });
  if (error) throw new Error(error.message);
  return code;
}

const scopeSchema = z.object({ challengeId: z.string().uuid().optional() });

/** My invite code (for friends, or for one of my Strides), created on first use. */
export const getMyInvite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => scopeSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.challengeId) await assertOwnsChallenge(userId, data.challengeId);

    let query = supabase.from("invites").select("code").eq("user_id", userId);
    query = data.challengeId
      ? query.eq("challenge_id", data.challengeId)
      : query.is("challenge_id", null);
    const { data: existing } = await query.maybeSingle();
    return { code: existing?.code ?? (await createInvite(userId, data.challengeId ?? null)) };
  });

/** Replace my code so links already shared stop working. */
export const resetMyInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => scopeSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.challengeId) await assertOwnsChallenge(userId, data.challengeId);

    let query = supabase.from("invites").delete().eq("user_id", userId);
    query = data.challengeId
      ? query.eq("challenge_id", data.challengeId)
      : query.is("challenge_id", null);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { code: await createInvite(userId, data.challengeId ?? null) };
  });

/** What the join page shows before sign-in: names only, never ids or emails. */
export const getInvitePreview = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ code: z.string().max(64) }).parse(data))
  .handler(async ({ data }) => {
    if (!codeSchema.safeParse(data.code).success) return { valid: false as const };
    const db = await admin();
    const { data: invite } = await db
      .from("invites")
      .select("user_id, challenge_id")
      .eq("code", data.code)
      .maybeSingle();
    if (!invite) return { valid: false as const };

    const [{ data: inviter }, { data: stride }] = await Promise.all([
      db.from("profiles").select("username, display_name").eq("id", invite.user_id).maybeSingle(),
      invite.challenge_id
        ? db.from("challenges").select("name").eq("id", invite.challenge_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      valid: true as const,
      inviterName: inviter?.display_name || inviter?.username || "A friend",
      strideName: stride?.name ?? null,
    };
  });

/** Use an invite: become friends with its owner right away, and join their Stride if it's a Stride invite. */
export const redeemInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ code: codeSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const db = await admin();

    const { data: invite } = await db
      .from("invites")
      .select("user_id, challenge_id")
      .eq("code", data.code)
      .maybeSingle();
    if (!invite) throw new Error("This invite link doesn't work anymore");
    if (invite.user_id === userId) return { self: true as const, redirect: "/board" };

    // Friendship in either direction becomes accepted; otherwise create one.
    const { data: existing } = await db
      .from("friendships")
      .select("id, status")
      .or(
        `and(user_id.eq.${userId},friend_id.eq.${invite.user_id}),and(user_id.eq.${invite.user_id},friend_id.eq.${userId})`,
      );
    if (existing?.length) {
      const pending = existing.filter((f) => f.status !== "accepted").map((f) => f.id);
      if (pending.length) {
        const { error } = await db
          .from("friendships")
          .update({ status: "accepted" })
          .in("id", pending);
        if (error) throw new Error(error.message);
      }
    } else {
      const { error } = await db
        .from("friendships")
        .insert({ user_id: invite.user_id, friend_id: userId, status: "accepted" });
      if (error && error.code !== "23505") throw new Error(error.message);
    }

    if (invite.challenge_id) {
      const { error } = await db
        .from("challenge_members")
        .upsert(
          { challenge_id: invite.challenge_id, user_id: userId, status: "joined" },
          { onConflict: "challenge_id,user_id" },
        );
      if (error) throw new Error(error.message);
      return { self: false as const, redirect: `/strides/${invite.challenge_id}` };
    }
    return { self: false as const, redirect: "/board" };
  });
