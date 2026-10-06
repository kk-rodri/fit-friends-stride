import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAGE_SIZE = 20;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * All-time proof photos from me and my friends, newest first, a page at a time.
 * Runs as the signed-in user, so workouts RLS decides whose photos come back.
 */
export const listPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ before: z.string().datetime({ offset: true }).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    let query = supabase
      .from("workouts")
      .select("id, user_id, photo_path, note, created_at")
      .not("photo_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (data.before) query = query.lt("created_at", data.before);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const page = (rows ?? []).slice(0, PAGE_SIZE);
    const hasMore = (rows ?? []).length > PAGE_SIZE;
    const ids = page.map((w) => w.id);
    const ownerIds = [...new Set(page.map((w) => w.user_id))];

    const [{ data: people }, { data: likes }, { data: comments }, { data: signed }] =
      await Promise.all([
        supabase.from("profiles").select("id, username, display_name").in("id", ownerIds),
        supabase.from("workout_likes").select("workout_id, user_id").in("workout_id", ids),
        supabase.from("workout_comments").select("workout_id").in("workout_id", ids),
        page.length
          ? supabase.storage.from("proofs").createSignedUrls(
              page.map((w) => w.photo_path!),
              3600,
            )
          : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
      ]);

    const nameOf = (id: string) => {
      const p = (people ?? []).find((x) => x.id === id);
      return p?.display_name || p?.username || "Athlete";
    };
    const urlOf = (path: string) => (signed ?? []).find((s) => s.path === path)?.signedUrl ?? null;

    return {
      photos: page.map((w) => {
        const workoutLikes = (likes ?? []).filter((l) => l.workout_id === w.id);
        return {
          id: w.id,
          userId: w.user_id,
          url: urlOf(w.photo_path!),
          name: nameOf(w.user_id),
          initials: initials(nameOf(w.user_id)),
          note: w.note,
          createdAt: w.created_at,
          mine: w.user_id === userId,
          likeCount: workoutLikes.length,
          likedByMe: workoutLikes.some((l) => l.user_id === userId),
          commentCount: (comments ?? []).filter((c) => c.workout_id === w.id).length,
        };
      }),
      nextCursor: hasMore ? page[page.length - 1]!.created_at : null,
    };
  });

/** Likes and comments for one photo, for the full-size viewer. */
export const getPhotoDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ workoutId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: workout }, { data: likes }, { data: rows, error }] = await Promise.all([
      supabase.from("workouts").select("user_id").eq("id", data.workoutId).maybeSingle(),
      supabase.from("workout_likes").select("user_id").eq("workout_id", data.workoutId),
      supabase
        .from("workout_comments")
        .select("id, user_id, body, created_at")
        .eq("workout_id", data.workoutId)
        .order("created_at", { ascending: true }),
    ]);
    if (error) throw new Error(error.message);

    const authorIds = [...new Set((rows ?? []).map((c) => c.user_id))];
    const { data: people } = authorIds.length
      ? await supabase.from("profiles").select("id, username, display_name").in("id", authorIds)
      : { data: [] };
    const nameOf = (id: string) => {
      const p = (people ?? []).find((x) => x.id === id);
      return p?.display_name || p?.username || "Athlete";
    };
    const ownsPhoto = workout?.user_id === userId;

    return {
      likeCount: (likes ?? []).length,
      likedByMe: (likes ?? []).some((l) => l.user_id === userId),
      comments: (rows ?? []).map((c) => ({
        id: c.id,
        userId: c.user_id,
        name: nameOf(c.user_id),
        initials: initials(nameOf(c.user_id)),
        body: c.body,
        createdAt: c.created_at,
        canDelete: c.user_id === userId || ownsPhoto,
      })),
    };
  });

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ workoutId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("workout_likes")
      .select("workout_id")
      .eq("workout_id", data.workoutId)
      .eq("user_id", userId)
      .maybeSingle();

    const { error } = existing
      ? await supabase
          .from("workout_likes")
          .delete()
          .eq("workout_id", data.workoutId)
          .eq("user_id", userId)
      : await supabase
          .from("workout_likes")
          .insert({ workout_id: data.workoutId, user_id: userId });
    if (error) throw new Error(error.message);
    return { liked: !existing };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ workoutId: z.string().uuid(), body: z.string().trim().min(1).max(280) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("workout_comments")
      .insert({ workout_id: data.workoutId, user_id: userId, body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS only lets the author or the photo's owner delete it.
    const { data: deleted, error } = await supabase
      .from("workout_comments")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted?.length) throw new Error("You can't delete that comment");
    return { ok: true };
  });
