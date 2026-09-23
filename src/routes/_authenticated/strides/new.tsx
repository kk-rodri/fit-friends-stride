import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getBoard } from "@/lib/board.functions";
import { createChallenge } from "@/lib/challenges.functions";

export const Route = createFileRoute("/_authenticated/strides/new")({
  head: () => ({
    meta: [
      { title: "Start a Stride — Stride" },
      {
        name: "description",
        content: "Name your challenge, set how many weeks it runs, and pick the friends you want in it.",
      },
    ],
  }),
  component: NewStride,
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function NewStride() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchBoard = useServerFn(getBoard);
  const create = useServerFn(createChallenge);
  const { data: board } = useQuery({ queryKey: ["board"], queryFn: () => fetchBoard() });

  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [startDate, setStartDate] = useState(todayIso());
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
      const res = await create({
        data: { name: name.trim(), weeks, startDate, friendIds: [...picked] },
      });
      await queryClient.invalidateQueries({ queryKey: ["strides"] });
      navigate({ to: "/strides/$id", params: { id: res.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the Stride");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = name.trim().length >= 2 && picked.size > 0 && !busy;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-body text-foreground">
      <div className="absolute inset-0 bg-scene" />
      <div className="relative mx-auto max-w-[36rem] px-5 py-10">
        <Link to="/board" className="text-xs font-medium text-mist transition-colors hover:text-volt">
          ‹ Back to board
        </Link>
        <h1 className="mt-5 font-display text-[2rem] font-semibold leading-tight text-frost">
          Start a Stride
        </h1>
        <p className="mt-2 text-sm text-mist">
          A Stride is a challenge between you and the friends you pick. Each week, whoever logs the
          most workouts wins the week.
        </p>

        <div className="glass-card mt-7 space-y-5 rounded-[22px] p-5">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-mist">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder="e.g. October Grind"
              className="mt-2 w-full rounded-xl bg-muted px-4 py-3 text-sm text-frost ring-1 ring-border placeholder:text-mist/70 focus:outline-none focus:ring-volt"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-[0.18em] text-mist">Starts</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value || todayIso())}
                className="mt-2 w-full rounded-xl bg-muted px-4 py-3 text-sm text-frost ring-1 ring-border focus:outline-none focus:ring-volt"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-[0.18em] text-mist">Length</label>
              <select
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
                className="mt-2 w-full rounded-xl bg-muted px-4 py-3 text-sm text-frost ring-1 ring-border focus:outline-none focus:ring-volt"
              >
                {[1, 2, 3, 4, 6, 8, 12].map((w) => (
                  <option key={w} value={w}>
                    {w} week{w === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-mist">
              Who's in it with you
            </label>
            <div className="mt-2 space-y-1">
              {!board ? (
                <p className="py-3 text-sm text-mist">Loading friends…</p>
              ) : board.friends.length === 0 ? (
                <p className="py-3 text-sm text-mist">
                  Add a friend on your board first — you can only invite people you're friends with.
                </p>
              ) : (
                board.friends.map((f) => {
                  const on = picked.has(f.userId);
                  return (
                    <button
                      key={f.userId}
                      onClick={() => toggle(f.userId)}
                      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 transition ${
                        on ? "bg-volt/[0.1] ring-volt/40" : "bg-frost/[0.04] ring-white/[0.06]"
                      }`}
                    >
                      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-steel font-display text-xs font-semibold text-frost">
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
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            onClick={submit}
            disabled={!canSubmit}
            className="volt-glow w-full rounded-full bg-volt py-3 font-display text-sm font-bold text-ink transition hover:brightness-105 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create Stride"}
          </button>
        </div>
      </div>
    </div>
  );
}
