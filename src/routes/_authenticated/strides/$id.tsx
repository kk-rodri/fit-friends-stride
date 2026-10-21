import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getChallenge, inviteToChallenge } from "@/lib/challenges.functions";
import { PhotoTile, PhotoViewer, type ViewerPhoto } from "@/components/PhotoViewer";
import { AccountChip } from "@/components/AccountChip";
import { InviteSheet } from "@/components/InviteSheet";
import { LogWorkoutButton } from "@/components/LogWorkout";
import { StrideFund } from "@/components/StrideFund";
import { QrCode } from "lucide-react";
import { formatDay } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/strides/$id")({
  head: () => ({
    meta: [
      { title: "Stride challenge — Stride" },
      {
        name: "description",
        content: "Weekly leaderboard, past weeks and proof photos for your Stride challenge.",
      },
    ],
  }),
  component: StrideDetail,
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

/** Shared places show the same number (the Tie badge marks them); a dash until someone has logged anything. */
function rankLabel(rank: number, active: boolean) {
  return active ? `${rank}` : "–";
}

function TieBadge() {
  return (
    <span className="shrink-0 rounded-full bg-frost/15 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-frost">
      Tie
    </span>
  );
}

function StrideDetail() {
  const { id } = Route.useParams();
  const fetchChallenge = useServerFn(getChallenge);
  const { data, error } = useQuery({
    queryKey: ["stride", id],
    queryFn: () => fetchChallenge({ data: { id } }),
    retry: false,
  });

  const [tab, setTab] = useState<"photos" | "weekly" | "fund">("photos");
  // Current week first, then earlier weeks newest to oldest, upcoming weeks last.
  const weeksInOrder = [...(data?.weeksData ?? [])].sort(
    (a, b) =>
      Number(b.isCurrent) - Number(a.isCurrent) ||
      Number(b.started) - Number(a.started) ||
      (a.started ? b.index - a.index : a.index - b.index),
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [openPhoto, setOpenPhoto] = useState<ViewerPhoto | null>(null);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-body text-foreground">
      <div className="absolute inset-0 bg-scene" />
      <div className="absolute inset-0 bg-scene-streak" />

      <div className="relative mx-auto max-w-[46rem] px-5 py-10 pb-20">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/board"
            className="text-xs font-medium text-mist transition-colors hover:text-volt"
          >
            ‹ Back to board
          </Link>
          <AccountChip />
        </div>

        {error ? (
          <p className="mt-8 text-sm text-mist">This Stride isn't available to you.</p>
        ) : !data ? (
          <p className="mt-8 text-sm text-mist">Loading…</p>
        ) : (
          <>
            <header className="mt-5 animate-rise">
              <h1 className="text-balance font-display text-[2rem] font-semibold leading-tight text-frost">
                {data.name}
              </h1>
              <p className="mt-2 text-sm text-mist">
                {data.notStarted
                  ? `Starts ${formatDay(data.startDate)}`
                  : data.over
                    ? `Finished ${formatDay(data.endDate)}`
                    : `Week ${data.currentWeek} of ${data.weeks} · ends ${formatDay(data.endDate)}`}
              </p>
            </header>

            {/* Stride leaderboard (whole challenge) */}
            <section className="mt-8 animate-rise" style={{ animationDelay: ".04s" }}>
              <div className="mb-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-volt">
                Stride leaderboard
              </div>
              <div className="overflow-hidden rounded-[18px] bg-frost/[0.05] ring-1 ring-white/[0.07]">
                <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 text-[10px] uppercase tracking-widest text-mist">
                  <span className="w-6 shrink-0">#</span>
                  <span className="flex-1">Athlete</span>
                  <span className="w-12 shrink-0 text-right">Weeks</span>
                  <span className="w-12 shrink-0 text-right">Total</span>
                  <span className="w-12 shrink-0 text-right">Best</span>
                </div>
                {data.standings.length === 0 ? (
                  <p className="p-5 text-center text-sm text-mist">
                    Standings appear once members join and start logging.
                  </p>
                ) : (
                  data.standings.map((s, i) => (
                    <div
                      key={s.userId}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        i > 0 ? "border-t border-white/[0.06]" : ""
                      } ${s.isMe ? "bg-volt/[0.06]" : ""}`}
                    >
                      <span
                        className={`w-6 shrink-0 font-display text-sm font-bold ${
                          s.rank === 1 && s.total > 0 ? "text-volt" : "text-frost/45"
                        }`}
                      >
                        {rankLabel(s.rank, s.total > 0 || s.weeksWon > 0)}
                      </span>
                      <div
                        className={`grid size-8 shrink-0 place-items-center rounded-full font-display text-[10px] font-semibold text-frost ${avatarClass(s.userId)}`}
                      >
                        {s.initials}
                      </div>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate text-sm text-frost">{s.name}</span>
                        {s.tied && s.total > 0 && <TieBadge />}
                      </span>
                      <span className="w-12 shrink-0 text-right font-display text-sm font-bold text-volt">
                        {s.weeksWon}
                      </span>
                      <span className="w-12 shrink-0 text-right font-display text-sm font-bold text-frost">
                        {s.total}
                      </span>
                      <span className="w-12 shrink-0 text-right text-xs text-mist">
                        {s.bestStreak}d
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Photos / weekly leaderboard */}
            <section className="mt-8 animate-rise" style={{ animationDelay: ".06s" }}>
              <div
                role="tablist"
                aria-label="Stride details"
                className="mb-4 flex rounded-full bg-frost/[0.05] p-1 ring-1 ring-white/[0.07]"
              >
                {(
                  [
                    ["photos", "Photos"],
                    ["weekly", "Weekly"],
                    ["fund", "Fund"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={`flex-1 rounded-full py-2 font-display text-sm font-semibold transition ${
                      tab === key
                        ? "bg-frost/[0.12] text-frost ring-1 ring-white/10"
                        : "text-mist hover:text-frost"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "fund" ? (
                <StrideFund
                  challengeId={data.id}
                  strideName={data.name}
                  isOwner={data.isOwner}
                  fund={data.fund}
                />
              ) : tab === "photos" ? (
                data.proofs.length === 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1].map((i) => (
                      <div
                        key={i}
                        className="grid aspect-square place-items-center rounded-2xl border border-dashed border-white/10 bg-frost/[0.03]"
                      >
                        <span className="px-2 text-center text-[11px] leading-tight text-mist/70">
                          Proof photo
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {data.proofs.map((p) => (
                        <PhotoTile
                          key={p.id}
                          photo={p}
                          likeCount={p.likeCount}
                          commentCount={p.commentCount}
                          onOpen={() => setOpenPhoto(p)}
                        />
                      ))}
                    </div>
                    <p className="mt-3 text-center text-xs text-mist">
                      All photos from this Stride, newest first
                    </p>
                  </>
                )
              ) : (
                <div className="space-y-3">
                  {weeksInOrder.map((w) => (
                    <div
                      key={w.index}
                      className={`rounded-[18px] p-4 ring-1 ${
                        w.isCurrent
                          ? "bg-volt/[0.06] ring-volt/25"
                          : "bg-frost/[0.05] ring-white/[0.07]"
                      } ${w.started ? "" : "opacity-60"}`}
                    >
                      <div className="mb-2 flex items-center gap-3">
                        <span className="font-display text-sm font-semibold text-frost">
                          Week {w.index}
                        </span>
                        {w.isCurrent && (
                          <span className="rounded-full bg-volt px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-ink">
                            Now
                          </span>
                        )}
                        {!w.started && (
                          <span className="text-[10px] uppercase tracking-widest text-mist">
                            Upcoming
                          </span>
                        )}
                        <span className="ml-auto text-xs text-mist">{w.label}</span>
                      </div>
                      <div className="space-y-1.5">
                        {w.rows.map((r) => (
                          <div key={r.userId} className="flex items-center gap-3 text-sm">
                            <span className="w-6 shrink-0 font-display text-xs text-frost/50">
                              {rankLabel(r.rank, r.workouts > 0)}
                            </span>
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="truncate text-frost">{r.name}</span>
                              {r.tied && r.workouts > 0 && <TieBadge />}
                            </span>
                            <span className="shrink-0 text-xs text-mist">{r.streak}d streak</span>
                            <span className="w-6 shrink-0 text-right font-display font-bold text-frost">
                              {r.workouts}
                            </span>
                          </div>
                        ))}
                        {w.rows.length === 0 && (
                          <p className="text-xs text-mist">No members yet.</p>
                        )}
                        {w.result && (
                          <p className="pt-1 text-xs text-mist">
                            {w.result.kind === "tied" ? "Tied: " : "Won by "}
                            <span className="font-semibold text-frost">
                              {w.result.names.join(" & ")}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Weeks won */}
            <section className="mt-8 animate-rise" style={{ animationDelay: ".1s" }}>
              <div className="mb-3 flex items-center gap-3">
                <span className="font-display text-xs font-bold uppercase tracking-[0.16em] text-volt">
                  Weeks won
                </span>
                {data.isOwner && (
                  <button
                    onClick={() => setShareOpen(true)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-volt px-3 py-1.5 text-xs font-bold text-ink transition hover:brightness-105"
                  >
                    <QrCode className="size-3.5" aria-hidden="true" />
                    Invite link
                  </button>
                )}
                {data.isOwner && (
                  <button
                    onClick={() => setInviteOpen(true)}
                    className="inline-flex items-center gap-1 px-2 py-2 text-xs font-medium text-frost/70 transition-colors hover:text-volt"
                  >
                    <span className="grid size-5 place-items-center rounded-full text-sm leading-none ring-1 ring-frost/25">
                      +
                    </span>
                    Add friends
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {data.members.map((m) => (
                  <div
                    key={m.userId}
                    className="flex items-center gap-2 rounded-full bg-frost/[0.05] py-2 pl-2 pr-4 ring-1 ring-white/[0.07]"
                  >
                    <div
                      className={`grid size-7 shrink-0 place-items-center rounded-full font-display text-[10px] font-semibold text-frost ${avatarClass(m.userId)}`}
                    >
                      {m.initials}
                    </div>
                    <span className="text-sm text-frost">{m.name}</span>
                    <span className="font-display text-sm font-bold text-volt">{m.weeksWon}</span>
                    {m.weeksTied > 0 && (
                      <span className="text-xs text-mist">· {m.weeksTied} tied</span>
                    )}
                  </div>
                ))}
              </div>
              {data.pending.length > 0 && (
                <p className="mt-3 text-xs text-mist">
                  Waiting on {data.pending.map((p) => p.name).join(", ")} to join.
                </p>
              )}
            </section>


            {shareOpen && (
              <InviteSheet
                challengeId={data.id}
                strideName={data.name}
                onClose={() => setShareOpen(false)}
              />
            )}

            {/* Members can log from here while the Stride is running. */}
            {data.standings.some((s) => s.isMe) && !data.notStarted && !data.over && (
              <LogWorkoutButton />
            )}

            {openPhoto && <PhotoViewer photo={openPhoto} onClose={() => setOpenPhoto(null)} />}

            {inviteOpen && (
              <InviteFriendsModal
                challengeId={data.id}
                friends={data.invitableFriends}
                onClose={() => setInviteOpen(false)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function InviteFriendsModal({
  challengeId,
  friends,
  onClose,
}: {
  challengeId: string;
  friends: { userId: string; name: string; initials: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteToChallenge);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await invite({ data: { challengeId, friendIds: [...picked] } });
      await queryClient.invalidateQueries({ queryKey: ["stride"] });
      queryClient.invalidateQueries({ queryKey: ["strides"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invites");
    } finally {
      setBusy(false);
    }
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
        <h2 className="font-display text-xl font-bold text-frost">Add friends</h2>
        <p className="mt-1 text-sm text-mist">
          They get an invite and join from their board. Their count starts from the week they join.
        </p>

        <div className="mt-5 max-h-64 space-y-1 overflow-y-auto">
          {friends.length === 0 ? (
            <p className="py-3 text-center text-sm text-mist">
              Everyone you're friends with is already in this Stride.
            </p>
          ) : (
            friends.map((f) => {
              const on = picked.has(f.userId);
              return (
                <button
                  key={f.userId}
                  onClick={() => toggle(f.userId)}
                  className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 transition ${
                    on ? "bg-volt/[0.1] ring-volt/40" : "bg-frost/[0.04] ring-white/[0.06]"
                  }`}
                >
                  <div
                    className={`grid size-9 shrink-0 place-items-center rounded-full font-display text-xs font-semibold text-frost ${avatarClass(f.userId)}`}
                  >
                    {f.initials}
                  </div>
                  <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-frost">
                    {f.name}
                  </span>
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold leading-none ${
                      on ? "bg-volt text-ink" : "text-transparent ring-1 ring-frost/25"
                    }`}
                  >
                    ✓
                  </span>
                </button>
              );
            })
          )}
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-full py-3 font-display text-sm font-bold text-mist ring-1 ring-border transition hover:text-frost"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || picked.size === 0}
            className="flex-1 rounded-full bg-volt py-3 font-display text-sm font-bold text-ink transition hover:brightness-105 disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send invites"}
          </button>
        </div>
      </div>
    </div>
  );
}
