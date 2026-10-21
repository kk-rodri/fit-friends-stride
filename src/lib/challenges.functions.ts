import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { lastPlace } from "@/lib/fund-rules";
import { formatDayShort } from "@/lib/format";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

/** Monday of the week containing the given date (UTC). */
export function mondayOf(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function longestRun(days: Set<string>, weekStart: Date): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < 7; i++) {
    const key = addDays(weekStart, i).toISOString().slice(0, 10);
    if (days.has(key)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Dense ranking over an already-sorted list: people level on the scoring
 * metric share a rank and the next person takes the next number (1, 1, 2),
 * with everyone in a shared place flagged as tied.
 */
function withRanks<T>(rows: T[], same: (a: T, b: T) => boolean) {
  let rank = 0;
  return rows.map((row, i) => {
    if (i === 0 || !same(rows[i - 1]!, row)) rank += 1;
    const tied =
      (i > 0 && same(rows[i - 1]!, row)) || (i < rows.length - 1 && same(rows[i + 1]!, row));
    return { ...row, rank, tied };
  });
}

export const listMyChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: memberships } = await supabase
      .from("challenge_members")
      .select("id, challenge_id, status")
      .eq("user_id", userId);

    const ids = (memberships ?? []).map((m) => m.challenge_id);
    if (ids.length === 0) return { active: [], invites: [] };

    const { data: challenges } = await supabase
      .from("challenges")
      .select("id, name, owner_id, start_date, weeks")
      .in("id", ids);

    const { data: allMembers } = await supabase
      .from("challenge_members")
      .select("challenge_id, user_id, status")
      .in("challenge_id", ids);

    const ownerIds = [...new Set((challenges ?? []).map((c) => c.owner_id))];
    const { data: owners } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", ownerIds);

    const ownerName = (id: string) => {
      const p = (owners ?? []).find((o) => o.id === id);
      return p?.display_name || p?.username || "Athlete";
    };

    const today = new Date();
    const rows = (challenges ?? []).map((c) => {
      const start = mondayOf(toUtcDate(c.start_date));
      const end = addDays(start, c.weeks * 7 - 1);
      const weekIndex = Math.floor(
        (mondayOf(today).getTime() - start.getTime()) / (7 * 86400000),
      );
      const joined = (allMembers ?? []).filter(
        (m) => m.challenge_id === c.id && m.status === "joined",
      ).length;
      return {
        id: c.id,
        name: c.name,
        ownerName: c.owner_id === userId ? "You" : ownerName(c.owner_id),
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        weeks: c.weeks,
        currentWeek: Math.min(Math.max(weekIndex + 1, 1), c.weeks),
        over: today.getTime() > addDays(end, 1).getTime(),
        memberCount: joined,
        myStatus:
          (memberships ?? []).find((m) => m.challenge_id === c.id)?.status ?? "invited",
      };
    });

    return {
      active: rows.filter((r) => r.myStatus === "joined"),
      invites: rows.filter((r) => r.myStatus === "invited"),
    };
  });

export const createChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        name: z.string().trim().min(2).max(50),
        weeks: z.number().int().min(1).max(12),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        friendIds: z.array(z.string().uuid()).min(1).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Only accepted friends may be invited.
    const { data: friendships } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status")
      .eq("status", "accepted");
    const friendIds = new Set(
      (friendships ?? []).map((f) => (f.user_id === userId ? f.friend_id : f.user_id)),
    );
    const invitees = data.friendIds.filter((id) => friendIds.has(id));
    if (invitees.length === 0) throw new Error("Pick at least one friend to invite.");

    const { data: challenge, error } = await supabase
      .from("challenges")
      .insert({
        name: data.name,
        owner_id: userId,
        start_date: data.startDate,
        weeks: data.weeks,
      })
      .select("id")
      .single();
    if (error || !challenge) throw new Error(error?.message ?? "Could not create challenge");

    const { error: memberError } = await supabase.from("challenge_members").insert([
      { challenge_id: challenge.id, user_id: userId, status: "joined" },
      ...invitees.map((id) => ({
        challenge_id: challenge.id,
        user_id: id,
        status: "invited",
      })),
    ]);
    if (memberError) throw new Error(memberError.message);

    return { id: challenge.id };
  });

export const respondToInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ challengeId: z.string().uuid(), accept: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("challenge_members")
      .update({ status: data.accept ? "joined" : "declined" })
      .eq("challenge_id", data.challengeId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getChallenge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: challenge } = await supabase
      .from("challenges")
      .select("id, name, owner_id, start_date, weeks, fund_enabled, fund_amount_cents, fund_venmo")
      .eq("id", data.id)
      .maybeSingle();
    if (!challenge) throw new Error("Challenge not found");

    const { data: members } = await supabase
      .from("challenge_members")
      .select("user_id, status")
      .eq("challenge_id", data.id);

    const mine = (members ?? []).find((m) => m.user_id === userId);
    if (!mine) throw new Error("You are not part of this challenge");

    const joined = (members ?? []).filter((m) => m.status === "joined");
    const memberIds = joined.map((m) => m.user_id);

    // Friends of mine who aren't in this Stride yet — the owner can invite them.
    const { data: myFriendships } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status")
      .eq("status", "accepted");
    const existing = new Set((members ?? []).map((m) => m.user_id));
    const invitableIds = [
      ...new Set(
        (myFriendships ?? [])
          .map((f) => (f.user_id === userId ? f.friend_id : f.user_id))
          .filter((id) => id !== userId && !existing.has(id)),
      ),
    ];

    const allIds = [
      ...new Set([...(members ?? []).map((m) => m.user_id), ...invitableIds, userId]),
    ];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", allIds);

    const nameOf = (id: string) => {
      const p = (profiles ?? []).find((x) => x.id === id);
      return p?.display_name || p?.username || "Athlete";
    };

    const start = mondayOf(toUtcDate(challenge.start_date));
    const end = addDays(start, challenge.weeks * 7);

    // Counting spans every member of the challenge, including people the viewer
    // is not friends with, so it runs with elevated access over this fixed set.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: workouts } = await supabaseAdmin
      .from("workouts")
      .select("id, user_id, created_at, note, photo_path")
      .in("user_id", memberIds.length ? memberIds : [userId])
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false });

    const todayMonday = mondayOf(new Date());
    const currentIndex = Math.floor(
      (todayMonday.getTime() - start.getTime()) / (7 * 86400000),
    );

    const weeksOut = [] as {
      index: number;
      label: string;
      isCurrent: boolean;
      started: boolean;
      rows: {
        userId: string;
        name: string;
        initials: string;
        workouts: number;
        streak: number;
        isMe: boolean;
        rank: number;
        tied: boolean;
      }[];
      result: { kind: "won" | "tied"; names: string[] } | null;
      finished: boolean;
      losers: string[];
    }[];

    const wins = new Map<string, number>();
    const ties = new Map<string, number>();

    for (let i = 0; i < challenge.weeks; i++) {
      const wStart = addDays(start, i * 7);
      const wEnd = addDays(wStart, 7);
      const counts = new Map<string, number>();
      const days = new Map<string, Set<string>>();

      for (const w of workouts ?? []) {
        const t = new Date(w.created_at).getTime();
        if (t < wStart.getTime() || t >= wEnd.getTime()) continue;
        counts.set(w.user_id, (counts.get(w.user_id) ?? 0) + 1);
        if (!days.has(w.user_id)) days.set(w.user_id, new Set());
        days.get(w.user_id)!.add(dayKey(new Date(w.created_at).toISOString()));
      }

      // Workout count decides the rank; streak only orders people within a tie.
      const sortedRows = memberIds
        .map((id) => ({
          userId: id,
          name: id === userId ? `${nameOf(id)} (you)` : nameOf(id),
          initials: initials(nameOf(id)),
          workouts: counts.get(id) ?? 0,
          streak: longestRun(days.get(id) ?? new Set(), wStart),
          isMe: id === userId,
        }))
        .sort((a, b) => b.workouts - a.workouts || b.streak - a.streak || a.name.localeCompare(b.name));
      const rows = withRanks(sortedRows, (a, b) => a.workouts === b.workouts);

      const started = Date.now() >= wStart.getTime();
      const finished = Date.now() >= wEnd.getTime();
      let result: { kind: "won" | "tied"; names: string[] } | null = null;
      if (finished && rows[0] && rows[0].workouts > 0) {
        const top = rows.filter((r) => r.rank === 1);
        const tally = top.length === 1 ? wins : ties;
        for (const r of top) tally.set(r.userId, (tally.get(r.userId) ?? 0) + 1);
        result = { kind: top.length === 1 ? "won" : "tied", names: top.map((r) => nameOf(r.userId)) };
      }

      weeksOut.push({
        index: i + 1,
        label: `${formatDayShort(wStart)} – ${formatDayShort(addDays(wStart, 6))}`,
        isCurrent: i === currentIndex,
        started,
        rows,
        result,
        finished,
        losers: finished ? lastPlace(rows) : [],
      });
    }

    // Every proof photo from the whole Stride, newest first (workouts is already
    // limited to members and the Stride's dates, newest first).
    const photoWorkouts = (workouts ?? []).filter((w) => w.photo_path).slice(0, 200);
    const photoIds = photoWorkouts.map((w) => w.id);
    const [{ data: signed }, { data: likes }, { data: comments }] = await Promise.all([
      photoWorkouts.length
        ? supabaseAdmin.storage.from("proofs").createSignedUrls(
            photoWorkouts.map((w) => w.photo_path!),
            3600,
          )
        : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
      supabaseAdmin.from("workout_likes").select("workout_id").in("workout_id", photoIds),
      supabaseAdmin.from("workout_comments").select("workout_id").in("workout_id", photoIds),
    ]);
    const countBy = (rows: { workout_id: string }[] | null, id: string) =>
      (rows ?? []).filter((r) => r.workout_id === id).length;
    const proofs = photoWorkouts.map((w) => ({
      id: w.id,
      url: (signed ?? []).find((s) => s.path === w.photo_path)?.signedUrl ?? null,
      name: nameOf(w.user_id),
      note: w.note,
      createdAt: w.created_at,
      mine: w.user_id === userId,
      likeCount: countBy(likes, w.id),
      commentCount: countBy(comments, w.id),
    }));

    // Overall standings across the whole Stride: total workouts, weeks won,
    // and best single-week streak.
    const sortedStandings = memberIds
      .map((id) => {
        let total = 0;
        let bestStreak = 0;
        for (const w of weeksOut) {
          const row = w.rows.find((r) => r.userId === id);
          if (!row || !w.started) continue;
          total += row.workouts;
          bestStreak = Math.max(bestStreak, row.streak);
        }
        return {
          userId: id,
          name: id === userId ? `${nameOf(id)} (you)` : nameOf(id),
          initials: initials(nameOf(id)),
          total,
          bestStreak,
          weeksWon: wins.get(id) ?? 0,
          weeksTied: ties.get(id) ?? 0,
          isMe: id === userId,
        };
      })
      .sort(
        (a, b) =>
          b.weeksWon - a.weeksWon ||
          b.total - a.total ||
          b.bestStreak - a.bestStreak ||
          a.name.localeCompare(b.name),
      );
    const standings = withRanks(
      sortedStandings,
      // Streak only orders people within a tie; it never breaks one.
      (a, b) => a.weeksWon === b.weeksWon && a.total === b.total,
    );

    // Fund: last place of each finished week owes the creator; payments record
    // "I paid" claims and the creator's confirmations.
    const { data: payments } = await supabase
      .from("fund_payments")
      .select("week_index, user_id, amount_cents, claimed_at, confirmed_at")
      .eq("challenge_id", challenge.id);
    const amountCents = challenge.fund_amount_cents ?? 0;
    const debts = weeksOut.flatMap((w) =>
      w.losers.map((id) => {
        const p = (payments ?? []).find((x) => x.week_index === w.index && x.user_id === id);
        return {
          weekIndex: w.index,
          weekLabel: w.label,
          userId: id,
          name: nameOf(id),
          workouts: w.rows.find((r) => r.userId === id)?.workouts ?? 0,
          amountCents: p?.amount_cents ?? amountCents,
          status: (p?.confirmed_at ? "confirmed" : p?.claimed_at ? "claimed" : "owed") as
            | "owed"
            | "claimed"
            | "confirmed",
          mine: id === userId,
        };
      }),
    );
    const fund = {
      enabled: challenge.fund_enabled,
      amountCents,
      venmo: challenge.fund_venmo,
      holderName: nameOf(challenge.owner_id),
      potCents: debts.filter((d) => d.status === "confirmed").reduce((n, d) => n + d.amountCents, 0),
      debts: [...debts].sort((a, b) => b.weekIndex - a.weekIndex || a.name.localeCompare(b.name)),
    };

    return {
      id: challenge.id,
      name: challenge.name,
      isOwner: challenge.owner_id === userId,
      weeks: challenge.weeks,
      startDate: start.toISOString().slice(0, 10),
      endDate: addDays(start, challenge.weeks * 7 - 1).toISOString().slice(0, 10),
      currentWeek: Math.min(Math.max(currentIndex + 1, 1), challenge.weeks),
      notStarted: currentIndex < 0,
      over: currentIndex >= challenge.weeks,
      members: memberIds.map((id) => ({
        userId: id,
        name: id === userId ? `${nameOf(id)} (you)` : nameOf(id),
        initials: initials(nameOf(id)),
        weeksWon: wins.get(id) ?? 0,
        weeksTied: ties.get(id) ?? 0,
      })),
      standings,
      pending: (members ?? [])
        .filter((m) => m.status === "invited")
        .map((m) => ({ userId: m.user_id, name: nameOf(m.user_id) })),
      weeksData: weeksOut,
      proofs,
      fund,
      invitableFriends: invitableIds
        .map((id) => ({ userId: id, name: nameOf(id), initials: initials(nameOf(id)) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

/** Owner adds more friends to a Stride that already exists. */
export const inviteToChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        challengeId: z.string().uuid(),
        friendIds: z.array(z.string().uuid()).min(1).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: challenge } = await supabase
      .from("challenges")
      .select("id, owner_id")
      .eq("id", data.challengeId)
      .maybeSingle();
    if (!challenge) throw new Error("Challenge not found");
    if (challenge.owner_id !== userId) throw new Error("Only the owner can invite people.");

    const { data: friendships } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status")
      .eq("status", "accepted");
    const friendIds = new Set(
      (friendships ?? []).map((f) => (f.user_id === userId ? f.friend_id : f.user_id)),
    );

    const { data: members } = await supabase
      .from("challenge_members")
      .select("user_id")
      .eq("challenge_id", data.challengeId);
    const existing = new Set((members ?? []).map((m) => m.user_id));

    const invitees = data.friendIds.filter((id) => friendIds.has(id) && !existing.has(id));
    if (invitees.length === 0) throw new Error("No new friends to invite.");

    const { error } = await supabase.from("challenge_members").insert(
      invitees.map((id) => ({
        challenge_id: data.challengeId,
        user_id: id,
        status: "invited",
      })),
    );
    if (error) throw new Error(error.message);
    return { invited: invitees.length };
  });

/**
 * Personal history: every workout I logged, plus a week-by-week record of
 * whether I won or lost each Stride week.
 */
export const getMyHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: myWorkouts } = await supabase
      .from("workouts")
      .select("id, created_at, note, photo_path")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    const workoutsOut = [] as {
      id: string;
      date: string;
      note: string | null;
      url: string | null;
    }[];
    for (const w of myWorkouts ?? []) {
      let url: string | null = null;
      if (w.photo_path) {
        const { data: signed } = await supabase.storage
          .from("proofs")
          .createSignedUrl(w.photo_path, 3600);
        url = signed?.signedUrl ?? null;
      }
      workoutsOut.push({ id: w.id, date: w.created_at, note: w.note, url });
    }

    // Weekly win/loss record across every Stride I joined.
    const { data: memberships } = await supabase
      .from("challenge_members")
      .select("challenge_id, status")
      .eq("user_id", userId)
      .eq("status", "joined");

    const challengeIds = (memberships ?? []).map((m) => m.challenge_id);

    const weekRecords = [] as {
      key: string;
      challengeId: string;
      challengeName: string;
      weekIndex: number;
      label: string;
      startIso: string;
      mine: number;
      topCount: number;
      winners: string[];
      result: "won" | "lost" | "tied" | "none" | "open";
    }[];
    let won = 0;
    let lost = 0;
    let tied = 0;

    if (challengeIds.length > 0) {
      const { data: challenges } = await supabase
        .from("challenges")
        .select("id, name, start_date, weeks")
        .in("id", challengeIds);

      const { data: allMembers } = await supabase
        .from("challenge_members")
        .select("challenge_id, user_id, status")
        .in("challenge_id", challengeIds);

      const everyone = [
        ...new Set(
          (allMembers ?? []).filter((m) => m.status === "joined").map((m) => m.user_id),
        ),
      ];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", everyone.length ? everyone : [userId]);
      const nameOf = (id: string) => {
        const p = (profiles ?? []).find((x) => x.id === id);
        return id === userId ? "You" : p?.display_name || p?.username || "Athlete";
      };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: allWorkouts } = await supabaseAdmin
        .from("workouts")
        .select("user_id, created_at")
        .in("user_id", everyone.length ? everyone : [userId]);

      for (const c of challenges ?? []) {
        const cStart = mondayOf(toUtcDate(c.start_date));
        const cMembers = (allMembers ?? [])
          .filter((m) => m.challenge_id === c.id && m.status === "joined")
          .map((m) => m.user_id);

        for (let i = 0; i < c.weeks; i++) {
          const wStart = addDays(cStart, i * 7);
          const wEnd = addDays(wStart, 7);
          if (Date.now() < wStart.getTime()) continue;

          const counts = new Map<string, number>();
          for (const w of allWorkouts ?? []) {
            if (!cMembers.includes(w.user_id)) continue;
            const t = new Date(w.created_at).getTime();
            if (t < wStart.getTime() || t >= wEnd.getTime()) continue;
            counts.set(w.user_id, (counts.get(w.user_id) ?? 0) + 1);
          }

          const mine = counts.get(userId) ?? 0;
          const topCount = Math.max(0, ...cMembers.map((id) => counts.get(id) ?? 0));
          const winnerIds = cMembers.filter((id) => (counts.get(id) ?? 0) === topCount);
          const finished = Date.now() >= wEnd.getTime();

          let result: "won" | "lost" | "tied" | "none" | "open" = "open";
          if (finished) {
            if (topCount === 0) result = "none";
            else if (!winnerIds.includes(userId)) result = "lost";
            else if (winnerIds.length > 1) result = "tied";
            else result = "won";
            if (result === "won") won += 1;
            else if (result === "lost") lost += 1;
            else if (result === "tied") tied += 1;
          }

          weekRecords.push({
            key: `${c.id}-${i}`,
            challengeId: c.id,
            challengeName: c.name,
            weekIndex: i + 1,
            label: `${formatDayShort(wStart)} – ${formatDayShort(addDays(wStart, 6))}`,
            startIso: wStart.toISOString(),
            mine,
            topCount,
            winners: topCount === 0 ? [] : winnerIds.map(nameOf),
            result,
          });
        }
      }

      weekRecords.sort(
        (a, b) => new Date(b.startIso).getTime() - new Date(a.startIso).getTime(),
      );
    }

    return {
      workouts: workoutsOut,
      totalWorkouts: (myWorkouts ?? []).length,
      weekRecords,
      record: { won, lost, tied },
    };
  });
