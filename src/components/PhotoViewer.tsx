import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Heart, MessageCircle, X } from "lucide-react";
import { addComment, deleteComment, getPhotoDetails, toggleLike } from "@/lib/photos.functions";
import { deleteWorkout } from "@/lib/board.functions";
import { TrashIcon } from "@/components/TrashIcon";
import { formatDay } from "@/lib/format";

const AVATAR_BG = [
  "bg-avatar-1",
  "bg-avatar-2",
  "bg-avatar-3",
  "bg-avatar-4",
  "bg-avatar-5",
  "bg-avatar-6",
] as const;

function avatarClass(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
}

export type ViewerPhoto = {
  id: string;
  url: string | null;
  name: string;
  note: string | null;
  createdAt?: string;
  mine: boolean;
};

/** Every query that shows workouts or photos, refreshed after a like, comment or delete. */
const PHOTO_QUERIES = [["photos"], ["board"], ["history"], ["strides"], ["stride"]];

/** Square photo tile for the 2-column grids; counts show when the caller has them. */
export function PhotoTile({
  photo,
  likeCount,
  commentCount,
  onOpen,
}: {
  photo: ViewerPhoto;
  likeCount?: number;
  commentCount?: number;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="relative block aspect-square w-full overflow-hidden rounded-2xl text-left ring-1 ring-border transition hover:ring-volt/50"
    >
      {photo.url ? (
        <img
          src={photo.url}
          alt={`Workout proof by ${photo.name}`}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-steel">
          <span className="font-display text-2xl text-mist">✓</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-ink/60 px-2.5 py-2 backdrop-blur-sm">
        <span className="min-w-0 flex-1 truncate text-xs text-frost">{photo.name}</span>
        {likeCount !== undefined && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-frost/80">
            <Heart className="size-3.5" aria-hidden="true" />
            {likeCount}
          </span>
        )}
        {commentCount !== undefined && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-frost/80">
            <MessageCircle className="size-3.5" aria-hidden="true" />
            {commentCount}
          </span>
        )}
      </div>
    </button>
  );
}

/** Full-size photo with likes and comments. */
export function PhotoViewer({ photo, onClose }: { photo: ViewerPhoto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fetchDetails = useServerFn(getPhotoDetails);
  const like = useServerFn(toggleLike);
  const comment = useServerFn(addComment);
  const removeComment = useServerFn(deleteComment);
  const removeWorkout = useServerFn(deleteWorkout);

  const detailsKey = ["photo", photo.id];
  const { data } = useQuery({
    queryKey: detailsKey,
    queryFn: () => fetchDetails({ data: { workoutId: photo.id } }),
  });

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: detailsKey });
    for (const key of PHOTO_QUERIES) queryClient.invalidateQueries({ queryKey: key });
  }

  async function handleLike() {
    if (!data) return;
    // Optimistic: flip the heart right away, then reconcile with the server.
    queryClient.setQueryData(detailsKey, {
      ...data,
      likedByMe: !data.likedByMe,
      likeCount: data.likeCount + (data.likedByMe ? -1 : 1),
    });
    try {
      await like({ data: { workoutId: photo.id } });
    } catch {
      // Stride photos can come from members you aren't friends with.
      setError("You can like and comment on your friends' photos.");
    } finally {
      refresh();
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError(null);
    setBusy(true);
    try {
      await comment({ data: { workoutId: photo.id, body } });
      setDraft("");
      refresh();
    } catch (err) {
      setError(
        err instanceof Error && /row-level security/i.test(err.message)
          ? "You can like and comment on your friends' photos."
          : err instanceof Error
            ? err.message
            : "Couldn't post that comment",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteComment(id: string) {
    await removeComment({ data: { id } });
    refresh();
  }

  async function handleDeletePhoto() {
    if (!window.confirm("Delete this workout? This can't be undone.")) return;
    await removeWorkout({ data: { id: photo.id } });
    refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-ink/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Photo by ${photo.name}`}
        className="glass-card w-full max-w-lg rounded-3xl bg-steel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-display font-semibold text-frost">{photo.name}</div>
            <div className="truncate text-xs text-mist">
              {[photo.note, photo.createdAt && formatDay(photo.createdAt)]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          {photo.mine && (
            <button
              onClick={handleDeletePhoto}
              aria-label="Delete workout"
              title="Delete workout"
              className="grid size-9 place-items-center rounded-full text-frost/70 transition hover:bg-destructive hover:text-frost"
            >
              <TrashIcon className="size-4" />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-frost/70 transition hover:bg-frost/10 hover:text-frost"
          >
            <X className="size-5" />
          </button>
        </div>

        {photo.url ? (
          <img
            src={photo.url}
            alt={`Workout proof by ${photo.name}`}
            className="max-h-[65vh] w-full rounded-2xl bg-ink object-contain"
          />
        ) : (
          <div className="grid aspect-square w-full place-items-center rounded-2xl bg-ink">
            <span className="font-display text-4xl text-mist">✓</span>
          </div>
        )}

        <div className="mt-3 flex items-center gap-4">
          <button
            onClick={handleLike}
            disabled={!data}
            aria-pressed={data?.likedByMe ?? false}
            className="flex items-center gap-1.5 text-sm text-frost transition hover:text-volt"
          >
            <Heart
              className={`size-5 ${data?.likedByMe ? "fill-volt text-volt" : ""}`}
              aria-hidden="true"
            />
            {data?.likeCount ?? 0}
            <span className="sr-only">{data?.likedByMe ? "Unlike" : "Like"}</span>
          </button>
          <span className="flex items-center gap-1.5 text-sm text-frost">
            <MessageCircle className="size-5" aria-hidden="true" />
            {data?.comments.length ?? 0}
          </span>
        </div>

        <div className="mt-3 max-h-48 space-y-2.5 overflow-y-auto">
          {data?.comments.length === 0 && (
            <p className="text-sm text-mist">No comments yet. Say something nice.</p>
          )}
          {data?.comments.map((c) => (
            <div key={c.id} className="group flex items-start gap-2.5">
              <div
                className={`grid size-7 shrink-0 place-items-center rounded-full font-display text-[10px] font-semibold text-frost ${avatarClass(c.userId)}`}
              >
                {c.initials}
              </div>
              <p className="min-w-0 flex-1 break-words text-sm text-frost">
                <span className="font-semibold">{c.name}</span> {c.body}
              </p>
              {c.canDelete && (
                <button
                  onClick={() => handleDeleteComment(c.id)}
                  aria-label="Delete comment"
                  title="Delete comment"
                  className="grid size-6 shrink-0 place-items-center rounded-full text-mist transition hover:text-destructive"
                >
                  <TrashIcon className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleComment} className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment"
            maxLength={280}
            className="min-w-0 flex-1 rounded-full bg-muted px-4 py-2.5 text-sm text-frost placeholder:text-mist/70 ring-1 ring-border focus:outline-none focus:ring-volt"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="rounded-full bg-volt px-4 font-display text-sm font-bold text-ink transition hover:brightness-105 disabled:opacity-50"
          >
            Post
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
