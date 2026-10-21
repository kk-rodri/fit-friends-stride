import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { getChallenge } from "@/lib/challenges.functions";
import { claimPaid, confirmPaid, updateFundSettings } from "@/lib/fund.functions";
import { formatCents } from "@/lib/fund-rules";

type Fund = Awaited<ReturnType<typeof getChallenge>>["fund"];
type Debt = Fund["debts"][number];

function venmoLink(handle: string, cents: number, note: string) {
  const params = new URLSearchParams({ txn: "pay", amount: (cents / 100).toFixed(2), note });
  return `https://venmo.com/${encodeURIComponent(handle)}?${params}`;
}

const STATUS: Record<Debt["status"], { label: string; cls: string }> = {
  owed: { label: "Owes", cls: "bg-destructive/15 text-destructive" },
  claimed: { label: "Paid, waiting", cls: "bg-volt/15 text-volt" },
  confirmed: { label: "Confirmed", cls: "bg-frost/15 text-frost" },
};

/** Fund tab on a Stride: last place each week pays the creator, tracked here. */
export function StrideFund({
  challengeId,
  strideName,
  isOwner,
  fund,
}: {
  challengeId: string;
  strideName: string;
  isOwner: boolean;
  fund: Fund;
}) {
  const queryClient = useQueryClient();
  const claim = useServerFn(claimPaid);
  const confirm = useServerFn(confirmPaid);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>) {
    setError(null);
    setBusyKey(key);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["stride", challengeId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyKey(null);
    }
  }

  if (!fund.enabled) {
    return isOwner ? (
      <FundSettings challengeId={challengeId} fund={fund} />
    ) : (
      <div className="glass-card rounded-2xl p-6 text-center">
        <p className="text-sm text-mist">
          No fund for this Stride. {fund.holderName} can turn one on.
        </p>
      </div>
    );
  }

  const myOpen = fund.debts.filter((d) => d.mine && d.status === "owed");
  const amount = formatCents(fund.amountCents);

  return (
    <div className="space-y-4">
      <div className="rounded-[18px] bg-frost/[0.05] p-4 ring-1 ring-white/[0.07]">
        <div className="text-[10px] uppercase tracking-widest text-mist">Pot so far</div>
        <div className="mt-1 font-display text-3xl font-bold text-frost">
          {formatCents(fund.potCents)}
        </div>
        <p className="mt-1 text-xs text-mist">
          {amount} per loss · held by {fund.holderName}
          {fund.venmo ? ` on Venmo (@${fund.venmo})` : ""}
        </p>
      </div>

      {myOpen.map((d) => {
        const key = `claim-${d.weekIndex}`;
        return (
          <div key={key} className="rounded-[18px] bg-volt/[0.07] p-4 ring-1 ring-volt/30">
            <div className="font-display text-lg font-bold text-frost">
              You owe {formatCents(d.amountCents)}
            </div>
            <p className="text-xs text-mist">
              Week {d.weekIndex} · last place with {d.workouts} workout{d.workouts === 1 ? "" : "s"}
            </p>
            {fund.venmo && !isOwner && (
              <a
                href={venmoLink(
                  fund.venmo,
                  d.amountCents,
                  `${strideName} · Week ${d.weekIndex} fund`,
                )}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block w-full rounded-full bg-[#008CFF] py-3 text-center font-display text-sm font-bold text-white transition hover:brightness-110"
              >
                Pay {formatCents(d.amountCents)} on Venmo
              </a>
            )}
            <button
              onClick={() =>
                run(key, () => claim({ data: { challengeId, weekIndex: d.weekIndex } }))
              }
              disabled={busyKey === key}
              className="mt-2 w-full rounded-full py-3 font-display text-sm font-bold text-frost ring-1 ring-border transition hover:bg-frost/[0.06] disabled:opacity-50"
            >
              {isOwner ? "Mark as added to the pot" : "I paid"}
            </button>
          </div>
        );
      })}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-widest text-mist">Who owes</div>
        {fund.debts.length === 0 ? (
          <p className="text-sm text-mist">Nobody owes yet. Last place pays once each week ends.</p>
        ) : (
          <div className="overflow-hidden rounded-[18px] bg-frost/[0.05] ring-1 ring-white/[0.07]">
            {fund.debts.map((d, i) => {
              const key = `confirm-${d.weekIndex}-${d.userId}`;
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 px-4 py-3 text-sm ${
                    i > 0 ? "border-t border-white/[0.06]" : ""
                  }`}
                >
                  <span className="shrink-0 text-xs text-mist">Week {d.weekIndex}</span>
                  <span className="min-w-0 flex-1 truncate text-frost">
                    {d.mine ? `${d.name} (you)` : d.name}
                  </span>
                  {isOwner && d.status !== "confirmed" && !d.mine ? (
                    <button
                      onClick={() =>
                        run(key, () =>
                          confirm({
                            data: { challengeId, weekIndex: d.weekIndex, userId: d.userId },
                          }),
                        )
                      }
                      disabled={busyKey === key}
                      className="shrink-0 rounded-full bg-volt px-3 py-1.5 font-display text-xs font-bold text-ink transition hover:brightness-105 disabled:opacity-50"
                    >
                      {d.status === "claimed" ? "Got it" : "Mark paid"}
                    </button>
                  ) : (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide ${STATUS[d.status].cls}`}
                    >
                      {STATUS[d.status].label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isOwner && <FundSettings challengeId={challengeId} fund={fund} />}
    </div>
  );
}

function FundSettings({ challengeId, fund }: { challengeId: string; fund: Fund }) {
  const queryClient = useQueryClient();
  const save = useServerFn(updateFundSettings);
  const [amount, setAmount] = useState(fund.amountCents ? String(fund.amountCents / 100) : "5");
  const [venmo, setVenmo] = useState(fund.venmo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(enabled: boolean) {
    setError(null);
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < 1 || dollars > 100) {
      setError("Pick an amount between $1 and $100.");
      return;
    }
    setBusy(true);
    try {
      await save({
        data: { challengeId, enabled, amountCents: Math.round(dollars * 100), venmo },
      });
      await queryClient.invalidateQueries({ queryKey: ["stride", challengeId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-card rounded-[18px] p-4">
      <div className="font-display text-sm font-bold text-frost">
        {fund.enabled ? "Fund settings" : "Start a fund"}
      </div>
      <p className="mt-1 text-xs text-mist">
        Each finished week, whoever logged the fewest workouts pays you this amount. Ties for last
        all pay. You confirm each payment here.
      </p>
      <label className="mt-4 block text-xs text-mist">
        Amount per loss ($)
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={100}
          step="0.5"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-xl bg-muted px-4 py-2.5 text-sm text-frost ring-1 ring-border focus:outline-none focus:ring-volt"
        />
      </label>
      <label className="mt-3 block text-xs text-mist">
        Your Venmo username
        <input
          value={venmo}
          onChange={(e) => setVenmo(e.target.value)}
          placeholder="@your-venmo"
          autoCapitalize="none"
          autoCorrect="off"
          className="mt-1 w-full rounded-xl bg-muted px-4 py-2.5 text-sm text-frost ring-1 ring-border placeholder:text-mist/70 focus:outline-none focus:ring-volt"
        />
      </label>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex gap-2">
        {fund.enabled && (
          <button
            onClick={() => submit(false)}
            disabled={busy}
            className="flex-1 rounded-full py-2.5 font-display text-sm font-bold text-mist ring-1 ring-border transition hover:text-frost disabled:opacity-50"
          >
            Turn off
          </button>
        )}
        <button
          onClick={() => submit(true)}
          disabled={busy}
          className="flex-1 rounded-full bg-volt py-2.5 font-display text-sm font-bold text-ink transition hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "Saving…" : fund.enabled ? "Save" : "Turn on fund"}
        </button>
      </div>
    </div>
  );
}
