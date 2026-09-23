import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyHistory } from "@/lib/challenges.functions";
import { deleteWorkout } from "@/lib/board.functions";
import { TrashIcon } from "@/components/TrashIcon";
import { AccountChip } from "@/components/AccountChip";
import { formatDay } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Your history — Stride" },
      {
        name: "description",
        content: "Every workout you logged and your week-by-week win record across your Strides.",
      },
      { property: "og:title", content: "Your history — Stride" },
      {
        property: "og:description",
        content: "Every workout you logged and your week-by-week win record across your Strides.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: History,
});

const RESULT_STYLE: Record<string, { label: string; cls: string }> = {
  won: { label: "Won", cls: "bg-volt text-ink" },
  lost: { label: "Lost", cls: "bg-frost/10 text-mist" },
  tied: { label: "Tied", cls: "bg-frost/15 text-frost" },
  none: { label: "No logs", cls: "bg-frost/[0.06] text-mist" },
  open: { label: "In progress", cls: "bg-volt/15 text-volt" },
};

function History() {
  const fetchHistory = useServerFn(getMyHistory);
  const removeWorkout = useServerFn(deleteWorkout);
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["history"], queryFn: () => fetchHistory() });

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this workout? This can't be undone.")) return;
    await removeWorkout({ data: { id } });
    queryClient.invalidateQueries({ queryKey: ["history"] });
    queryClient.invalidateQueries({ queryKey: ["board"] });
    queryClient.invalidateQueries({ queryKey: ["strides"] });
    queryClient.invalidateQueries({ queryKey: ["stride"] });
  }

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


        <header className="mt-5 animate-rise">
          <h1 className="text-balance font-display text-[2rem] font-semibold leading-tight text-frost">
            Your history
          </h1>
          <p className="mt-2 text-sm text-mist">
            Every workout you saved, and how each Stride week went.
          </p>
        </header>

        {/* Record */}
        <section className="mt-8 animate-rise" style={{ animationDelay: ".04s" }}>
          <div className="glass-card grid grid-cols-4 gap-3 rounded-[22px] p-5">
            {[
              { label: "Workouts", value: data?.totalWorkouts ?? 0 },
              { label: "Weeks won", value: data?.record.won ?? 0 },
              { label: "Weeks lost", value: data?.record.lost ?? 0 },
              { label: "Tied", value: data?.record.tied ?? 0 },
            ].map((s) => (
              <div key={s.label}>
                <div className="font-display text-3xl font-extrabold leading-none text-frost">
                  {data ? s.value : "–"}
                </div>
                <div className="mt-1.5 text-[10px] uppercase tracking-widest text-mist">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Weekly ranking record */}
        <section className="mt-8 animate-rise" style={{ animationDelay: ".08s" }}>
          <div className="mb-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-volt">
            Week by week
          </div>
          <div className="overflow-hidden rounded-[18px] bg-frost/[0.05] ring-1 ring-white/[0.07]">
            {!data ? (
              <p className="p-5 text-center text-sm text-mist">Loading…</p>
            ) : data.weekRecords.length === 0 ? (
              <div className="p-5">
                <p className="text-center text-sm text-mist">
                  No Stride weeks yet. Here's how they'll look:
                </p>
                <div className="mt-4 space-y-2 opacity-50">
                  {[
                    { label: "Sep 14th – Sep 20th", result: "won" },
                    { label: "Sep 7th – Sep 13th", result: "lost" },
                  ].map((p) => (
                    <div
                      key={p.label}
                      className="flex items-center gap-3 rounded-xl bg-frost/[0.04] p-3"
                    >
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wide ${RESULT_STYLE[p.result]!.cls}`}
                      >
                        {RESULT_STYLE[p.result]!.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-frost">
                        Your Stride
                      </span>
                      <span className="shrink-0 text-xs text-mist">{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              data.weekRecords.map((w, i) => (
                <div
                  key={w.key}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 p-4 ${
                    i > 0 ? "border-t border-white/[0.06]" : ""
                  }`}
                >
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wide ${RESULT_STYLE[w.result]!.cls}`}
                  >
                    {RESULT_STYLE[w.result]!.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/strides/$id"
                      params={{ id: w.challengeId }}
                      className="block truncate font-display text-sm font-semibold text-frost transition-colors hover:text-volt"
                    >
                      {w.challengeName} · Week {w.weekIndex}
                    </Link>
                    <div className="truncate text-xs text-mist">
                      {w.label} · you {w.mine} · top {w.topCount}
                      {w.winners.length > 0 ? ` (${w.winners.join(", ")})` : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* All my workouts */}
        <section className="mt-8 animate-rise" style={{ animationDelay: ".12s" }}>
          <div className="mb-3 font-display text-xs font-bold uppercase tracking-[0.16em] text-volt">
            All your workouts
          </div>
          <div className="overflow-hidden rounded-[18px] bg-frost/[0.05] ring-1 ring-white/[0.07]">
            {!data ? (
              <p className="p-5 text-center text-sm text-mist">Loading…</p>
            ) : data.workouts.length === 0 ? (
              <div className="p-5">
                <p className="text-center text-sm text-mist">
                  Nothing logged yet. Each saved workout will appear like this:
                </p>
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-frost/[0.04] p-3 opacity-50">
                  <div className="grid size-12 shrink-0 place-items-center rounded-lg border border-dashed border-white/10 text-[10px] text-mist">
                    Photo
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-sm font-semibold text-frost">Run</div>
                    <div className="text-xs text-mist">{formatDay(new Date())}</div>
                  </div>
                </div>
              </div>
            ) : (
              data.workouts.map((w, i) => (
                <div
                  key={w.id}
                  className={`flex items-center gap-3 p-3.5 ${
                    i > 0 ? "border-t border-white/[0.06]" : ""
                  }`}
                >
                  {w.url ? (
                    <img
                      src={w.url}
                      alt={w.note ? `Proof photo: ${w.note}` : "Workout proof photo"}
                      loading="lazy"
                      className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-steel font-display text-lg text-mist">
                      ✓
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm font-semibold text-frost">
                      {w.note || "Workout"}
                    </div>
                    <div className="text-xs text-mist">{formatDay(w.date)}</div>
                  </div>
                  <button
                    onClick={() => handleDelete(w.id)}
                    aria-label="Delete workout"
                    title="Delete workout"
                    className="grid size-8 shrink-0 place-items-center rounded-full text-mist transition hover:bg-destructive/15 hover:text-destructive"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
