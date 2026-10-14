import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getBoard,
  searchUsers,
  addFriend,
  respondToRequest,
} from "@/lib/board.functions";
import { PhotoTile, PhotoViewer, type ViewerPhoto } from "@/components/PhotoViewer";
import { listPhotos } from "@/lib/photos.functions";
import { AccountChip } from "@/components/AccountChip";
import { LogWorkoutButton } from "@/components/LogWorkout";
import { listMyChallenges, respondToInvite } from "@/lib/challenges.functions";
import { formatDayShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/board")({
  head: () => ({
    meta: [
      { title: "Your board — Stride" },
      { name: "description", content: "This week's workout leaderboard, proof photos, and friends on Stride." },
    ],
  }),
  component: Board,
});

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

function weekLabel() {
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7;
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day),
  );
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return `${formatDayShort(start)} – ${formatDayShort(end)}`;
}

function Board() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchBoard = useServerFn(getBoard);
  const { data } = useQuery({ queryKey: ["board"], queryFn: () => fetchBoard() });

  const [addOpen, setAddOpen] = useState(false);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const board = data;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-body text-foreground">
      <div className="absolute inset-0 bg-scene" />
      <div className="absolute inset-0 bg-scene-streak" />

      <div className="relative mx-auto max-w-[46rem] px-5 py-10 pb-28">
        <header className="mb-10 flex items-end justify-between animate-rise">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-[5px] bg-volt font-display text-[11px] font-extrabold leading-none text-ink">
                ✓
              </span>
              <span className="font-display text-sm font-bold tracking-tight text-frost/90">
                STRIDE
              </span>
            </div>
            <h1 className="text-balance font-display text-[2rem] font-semibold leading-tight text-frost">
              Weekly board
            </h1>
            <p className="mt-2 max-w-[34ch] text-pretty text-sm text-mist">
              Log a set, drop a photo. Rankings live inside the Strides you run with friends.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <AccountChip className="mb-3" />
            <div className="text-[10px] uppercase tracking-[0.18em] text-mist">This week</div>
            <div className="font-display text-lg font-semibold text-frost">{weekLabel()}</div>
            <div className="mt-2 flex items-center justify-end gap-3">
              <Link
                to="/history"
                className="text-xs font-medium text-frost/70 transition-colors hover:text-volt"
              >
                Your history
              </Link>
              <button
                onClick={handleSignOut}
                className="text-xs font-medium text-mist transition-colors hover:text-volt"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Your week */}
        <section className="mb-8 animate-rise" style={{ animationDelay: ".06s" }}>
          <div className="glass-card relative overflow-hidden rounded-[22px] p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-volt">
                Your week
              </span>
              <span className="ml-auto text-xs text-mist">
                {board ? `${board.friendCount} friend${board.friendCount === 1 ? "" : "s"}` : "…"}
              </span>
            </div>
            <div className="flex items-end gap-5">
              <div>
                <div className="font-display text-5xl font-extrabold leading-none text-frost">
                  {board?.myWeekly ?? "–"}
                </div>
                <div className="mt-1.5 text-[10px] uppercase tracking-widest text-mist">
                  times this week
                </div>
              </div>
              <div className="mb-1">
                <div className="font-display text-2xl font-bold leading-none text-frost/70">
                  {board?.myTotal ?? "–"}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-mist">
                  all time
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Strides */}
        <StridesSection />

        <PhotosSection />

        {/* Friends */}
        <section className="mb-10 animate-rise" style={{ animationDelay: ".18s" }}>
          <div className="mb-3 flex items-center gap-3">
            <span className="font-display text-xs font-bold uppercase tracking-[0.16em] text-volt">
              Friends
            </span>
            <button
              onClick={() => setAddOpen(true)}
              className="ml-auto inline-flex items-center gap-1 px-2 py-2 text-xs font-medium text-frost/70 transition-colors hover:text-volt"
            >
              <span className="grid size-5 place-items-center rounded-full text-sm leading-none ring-1 ring-frost/25">
                +
              </span>
              Add friend
            </button>
          </div>

          {board && board.incoming.length > 0 && (
            <div className="mb-3 rounded-[18px] bg-volt/[0.07] ring-1 ring-volt/25">
              {board.incoming.map((req) => (
                <div key={req.id} className="flex items-center gap-3 p-3.5">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-steel font-display text-xs font-semibold text-frost">
                    {req.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display font-semibold leading-tight text-frost">
                      {req.name}
                    </div>
                    <div className="truncate text-xs text-mist">
                      {req.username ? `@${req.username} · ` : ""}Wants to be your friend
                    </div>
                  </div>
                  <RequestButtons friendshipId={req.id} />
                </div>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-[18px] bg-frost/[0.05] ring-1 ring-white/[0.07]">
            {!board ? null : board.friends.length === 0 ? (
              <p className="p-5 text-center text-sm text-mist">
                No friends yet — add someone by their username to start competing.
              </p>
            ) : (
              board.friends.map((f, i) => (
                <div key={f.userId}>
                  {i > 0 && <div className="h-px bg-white/[0.06]" />}
                  <div className="flex items-center gap-3 p-3.5">
                    <div
                      className={`grid size-10 shrink-0 place-items-center rounded-full font-display text-xs font-semibold text-frost ${avatarClass(f.userId)}`}
                    >
                      {f.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display font-semibold leading-tight text-frost">
                        {f.name}
                      </div>
                      <div className="text-xs text-mist">
                        {f.weekly} time{f.weekly === 1 ? "" : "s"} this week
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <LogWorkoutButton />
      {addOpen && <AddFriendModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function RequestButtons({ friendshipId }: { friendshipId: string }) {
  const queryClient = useQueryClient();
  const respond = useServerFn(respondToRequest);
  async function act(accept: boolean) {
    await respond({ data: { friendshipId, accept } });
    queryClient.invalidateQueries({ queryKey: ["board"] });
  }
  return (
    <div className="flex shrink-0 gap-2">
      <button
        onClick={() => act(true)}
        className="rounded-full bg-volt px-3 py-2 font-display text-xs font-bold text-ink transition hover:brightness-105"
      >
        Accept
      </button>
      <button
        onClick={() => act(false)}
        className="rounded-full px-3 py-2 text-xs font-medium text-mist ring-1 ring-border transition hover:text-frost"
      >
        Decline
      </button>
    </div>
  );
}

function AddFriendModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const search = useServerFn(searchUsers);
  const add = useServerFn(addFriend);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; username: string; name: string; initials: string; status: string | null }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  async function runSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const rows = await search({ data: { query: q.trim() } });
      setResults(rows);
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest(id: string) {
    await add({ data: { friendId: id } });
    setSentTo((s) => new Set(s).add(id));
    queryClient.invalidateQueries({ queryKey: ["board"] });
  }

  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-ink/70 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-sm rounded-3xl bg-steel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-bold text-frost">Add a friend</h2>
        <p className="mt-1 text-sm text-mist">Search by their Stride username.</p>

        <input
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Username"
          autoFocus
          className="mt-5 w-full rounded-xl bg-muted px-4 py-3 text-sm text-frost ring-1 ring-border placeholder:text-mist/70 focus:outline-none focus:ring-volt"
        />

        <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
          {busy && <p className="py-3 text-center text-sm text-mist">Searching…</p>}
          {!busy && query.trim().length >= 2 && results.length === 0 && (
            <p className="py-3 text-center text-sm text-mist">No one found with that username.</p>
          )}
          {results.map((r) => {
            const linked = r.status ?? (sentTo.has(r.id) ? "pending" : null);
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-xl p-2.5">
                <div
                  className={`grid size-9 shrink-0 place-items-center rounded-full font-display text-xs font-semibold text-frost ${avatarClass(r.id)}`}
                >
                  {r.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-sm font-semibold text-frost">
                    {r.name}
                  </div>
                  <div className="text-xs text-mist">@{r.username}</div>
                </div>
                {linked === "accepted" ? (
                  <span className="text-xs font-medium text-mist">Friends</span>
                ) : linked === "pending" ? (
                  <span className="text-xs font-medium text-mist">Requested</span>
                ) : (
                  <button
                    onClick={() => sendRequest(r.id)}
                    className="shrink-0 rounded-full px-3 py-2 pl-2 text-xs font-medium text-volt ring-1 ring-volt/30 transition-colors hover:bg-volt/10"
                  >
                    + Add
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-full py-3 font-display text-sm font-bold text-mist ring-1 ring-border transition hover:text-frost"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/** Every proof photo from you and your friends, all time, two per row. */
function PhotosSection() {
  const fetchPhotos = useServerFn(listPhotos);
  const [open, setOpen] = useState<ViewerPhoto | null>(null);
  const { data, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["photos"],
    queryFn: ({ pageParam }) => fetchPhotos({ data: { before: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const photos = data?.pages.flatMap((p) => p.photos) ?? [];

  return (
    <section className="mb-8 animate-rise" style={{ animationDelay: ".12s" }}>
      <div className="mb-4 flex items-center gap-3">
        <span className="font-display text-xs font-bold uppercase tracking-[0.16em] text-volt">
          Photos
        </span>
        <span className="ml-auto text-xs text-mist">You and your friends · all time</span>
      </div>
      {isPending ? null : photos.length === 0 ? (
        <div className="glass-card rounded-2xl p-6 text-center">
          <p className="text-sm text-mist">
            No workout photos yet. Be the first — post your proof.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p) => (
              <PhotoTile
                key={p.id}
                photo={p}
                likeCount={p.likeCount}
                commentCount={p.commentCount}
                onOpen={() => setOpen(p)}
              />
            ))}
          </div>
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mt-4 w-full rounded-full bg-secondary py-3 font-display text-sm font-bold text-frost ring-1 ring-border transition hover:bg-accent disabled:opacity-50"
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}
      {open && <PhotoViewer photo={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function StridesSection() {
  const queryClient = useQueryClient();
  const fetchChallenges = useServerFn(listMyChallenges);
  const respond = useServerFn(respondToInvite);
  const { data } = useQuery({ queryKey: ["strides"], queryFn: () => fetchChallenges() });

  async function act(challengeId: string, accept: boolean) {
    await respond({ data: { challengeId, accept } });
    queryClient.invalidateQueries({ queryKey: ["strides"] });
  }

  return (
    <section className="mb-8 animate-rise" style={{ animationDelay: ".09s" }}>
      <div className="mb-3 flex items-center gap-3">
        <span className="font-display text-xs font-bold uppercase tracking-[0.16em] text-volt">
          Your Strides
        </span>
        <Link
          to="/strides/new"
          className="ml-auto inline-flex items-center gap-1 px-2 py-2 text-xs font-medium text-frost/70 transition-colors hover:text-volt"
        >
          <span className="grid size-5 place-items-center rounded-full text-sm leading-none ring-1 ring-frost/25">
            +
          </span>
          Start a Stride
        </Link>
      </div>

      {data && data.invites.length > 0 && (
        <div className="mb-3 rounded-[18px] bg-volt/[0.07] ring-1 ring-volt/25">
          {data.invites.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-display font-semibold leading-tight text-frost">
                  {c.name}
                </div>
                <div className="text-xs text-mist">
                  {c.ownerName} invited you · {c.weeks} week{c.weeks === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => act(c.id, true)}
                  className="rounded-full bg-volt px-3 py-2 font-display text-xs font-bold text-ink transition hover:brightness-105"
                >
                  Join
                </button>
                <button
                  onClick={() => act(c.id, false)}
                  className="rounded-full px-3 py-2 text-xs font-medium text-mist ring-1 ring-border transition hover:text-frost"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-[18px] bg-frost/[0.05] ring-1 ring-white/[0.07]">
        {!data ? null : data.active.length === 0 ? (
          <p className="p-5 text-center text-sm text-mist">
            No Strides yet — start one, pick your friends, and the weekly leaderboard begins.
          </p>
        ) : (
          data.active.map((c, i) => (
            <div key={c.id}>
              {i > 0 && <div className="h-px bg-white/[0.06]" />}
              <Link
                to="/strides/$id"
                params={{ id: c.id }}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-frost/[0.04]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display font-semibold leading-tight text-frost">
                    {c.name}
                  </div>
                  <div className="text-xs text-mist">
                    {c.memberCount} in · {c.over ? "Finished" : `Week ${c.currentWeek} of ${c.weeks}`}
                  </div>
                </div>
                <span className="shrink-0 text-lg leading-none text-mist">›</span>
              </Link>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
