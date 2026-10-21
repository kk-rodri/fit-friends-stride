import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addDays, mondayOf, toUtcDate } from "@/lib/challenges.functions";
import { lastPlace } from "@/lib/fund-rules";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadChallenge(challengeId: string) {
  const db = await admin();
  const { data } = await db
    .from("challenges")
    .select("id, owner_id, start_date, weeks, fund_enabled, fund_amount_cents")
    .eq("id", challengeId)
    .maybeSingle();
  if (!data) throw new Error("Stride not found");
  return data;
}

/** Last place for one finished week, using the same rule as the Stride page. */
async function losersOf(challenge: Awaited<ReturnType<typeof loadChallenge>>, weekIndex: number) {
  if (weekIndex < 1 || weekIndex > challenge.weeks) return [];
  const db = await admin();
  const wStart = addDays(mondayOf(toUtcDate(challenge.start_date)), (weekIndex - 1) * 7);
  const wEnd = addDays(wStart, 7);
  if (Date.now() < wEnd.getTime()) return [];

  const { data: members } = await db
    .from("challenge_members")
    .select("user_id")
    .eq("challenge_id", challenge.id)
    .eq("status", "joined");
  const ids = (members ?? []).map((m) => m.user_id);
  if (!ids.length) return [];
  const { data: workouts } = await db
    .from("workouts")
    .select("user_id")
    .in("user_id", ids)
    .gte("created_at", wStart.toISOString())
    .lt("created_at", wEnd.toISOString());
  return lastPlace(
    ids.map((id) => ({
      userId: id,
      workouts: (workouts ?? []).filter((w) => w.user_id === id).length,
    })),
  );
}

const weekSchema = z.object({
  challengeId: z.string().uuid(),
  weekIndex: z.number().int().min(1).max(52),
});

/** The person who lost a week says they've paid. */
export const claimPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => weekSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const challenge = await loadChallenge(data.challengeId);
    if (!challenge.fund_enabled || !challenge.fund_amount_cents) {
      throw new Error("This Stride doesn't have a fund");
    }
    if (!(await losersOf(challenge, data.weekIndex)).includes(userId)) {
      throw new Error("You don't owe anything for that week");
    }
    const now = new Date().toISOString();
    // The creator paying their own fund needs no one else to confirm it.
    const self = challenge.owner_id === userId;
    const db = await admin();
    const { error } = await db.from("fund_payments").upsert(
      {
        challenge_id: challenge.id,
        week_index: data.weekIndex,
        user_id: userId,
        amount_cents: challenge.fund_amount_cents,
        claimed_at: now,
        ...(self ? { confirmed_at: now } : {}),
      },
      { onConflict: "challenge_id,week_index,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** The Stride's creator (who holds the fund) confirms they received a payment. */
export const confirmPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => weekSchema.extend({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const challenge = await loadChallenge(data.challengeId);
    if (challenge.owner_id !== context.userId) {
      throw new Error("Only the Stride's creator can confirm payments");
    }
    if (!challenge.fund_amount_cents) throw new Error("Set an amount for the fund first");
    if (!(await losersOf(challenge, data.weekIndex)).includes(data.userId)) {
      throw new Error("That person doesn't owe for that week");
    }
    const now = new Date().toISOString();
    const db = await admin();
    const { data: existing } = await db
      .from("fund_payments")
      .select("claimed_at")
      .eq("challenge_id", challenge.id)
      .eq("week_index", data.weekIndex)
      .eq("user_id", data.userId)
      .maybeSingle();
    const { error } = await db.from("fund_payments").upsert(
      {
        challenge_id: challenge.id,
        week_index: data.weekIndex,
        user_id: data.userId,
        amount_cents: challenge.fund_amount_cents,
        claimed_at: existing?.claimed_at ?? now,
        confirmed_at: now,
      },
      { onConflict: "challenge_id,week_index,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Creator turns the fund on or off and sets the amount and their Venmo username. */
export const updateFundSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        challengeId: z.string().uuid(),
        enabled: z.boolean(),
        amountCents: z.number().int().min(100).max(10000),
        // Venmo usernames: letters, numbers, - and _ (an optional leading @ is dropped).
        venmo: z
          .string()
          .trim()
          .transform((v) => v.replace(/^@/, ""))
          .pipe(z.string().regex(/^[A-Za-z0-9_-]{5,30}$/, "Enter your Venmo username")),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Runs as the user: the "Owner updates challenge" policy limits it to the creator.
    const { data: updated, error } = await supabase
      .from("challenges")
      .update({
        fund_enabled: data.enabled,
        fund_amount_cents: data.amountCents,
        fund_venmo: data.venmo,
      })
      .eq("id", data.challengeId)
      .eq("owner_id", userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("Only the Stride's creator can change the fund");
    return { ok: true };
  });
