# Challenges (Strides) with selected friends

Adding a friend no longer puts them on a leaderboard. Ranking only happens inside a challenge you create and invite specific friends to.

## What you'll be able to do

- Create a **Stride**: give it a name, pick a duration (start date + number of weeks), and tick which of your friends to invite.
- Invited friends see the invite on their board and can join or decline.
- Each Stride has its own page with a **weekly leaderboard**: everyone's workout count for that week decides the ranking, with their longest run of days in a row shown next to it.
- Past weeks of the Stride stay visible, each showing who won that week, plus a running tally of weeks won.
- Proof photos from people in the Stride show in that Stride's photo grid.

## Main board changes

- The all-friends ranking is removed.
- The board keeps: your own week summary, the proof photo grid from all your friends (no ranking), your friends list and requests, and the log-workout button.
- A new "Your Strides" section lists the challenges you're in, pending invites, and a "Start a Stride" button.

## Pages

- `/board` — home: your week, friends' photos, friends, Strides list, invites.
- `/strides/new` — name, start date, length in weeks, friend picker.
- `/strides/$id` — the challenge: current week leaderboard, past weeks, members, photos from members.

## Technical notes

New tables (migration, additive only — nothing existing is dropped):

- `challenges`: id, name, owner_id, start_date, weeks, created_at.
- `challenge_members`: challenge_id, user_id, status (`invited` / `joined` / `declined`), unique per pair.

RLS: members (any status) can read the challenge and its member list; only the owner creates it and invites; a user updates only their own membership row to join/decline; owner can delete the challenge. GRANTs to `authenticated` and `service_role` in the same migration. Because workouts RLS already limits reads to self + accepted friends, challenge stats are computed in a server function via `requireSupabaseAuth`, deriving week buckets (Monday-start, UTC) from `start_date` and `weeks`, counting workouts per member per week and the longest consecutive-day run within that week.

New server functions in `src/lib/challenges.functions.ts`: `createChallenge`, `respondToInvite`, `listMyChallenges`, `getChallenge`. `getBoard` in `src/lib/board.functions.ts` drops the leaderboard array and keeps friends, proofs, requests, and my own weekly count.

Keeps the Kinetic glass styling, `["board"]` query key invalidation pattern, and existing auth/storage setup.
