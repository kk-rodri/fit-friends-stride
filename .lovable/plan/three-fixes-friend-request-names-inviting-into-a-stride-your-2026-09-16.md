# Three fixes: friend request names, inviting into a Stride, your name in the header

## 1. Friend requests show "Athlete" instead of the person's name

Confirmed cause: the board only loads profiles for you and your accepted friends. Someone who sent you a request isn't in that list yet, so their name falls back to the placeholder "Athlete".

Fix: include the people who sent you pending requests when loading profiles, so each request shows their real name plus their `@username` underneath (same style as the Add friend search results).

## 2. Add friends to a Stride that already exists

On a Stride's page, the person who created it gets an "Add friends" button. It opens a picker listing your friends who aren't in the Stride yet; ticking them and confirming sends them an invite, exactly like invites sent at creation time. They appear under "Invited" until they join or decline.

Rules kept the same as today: only the Stride's owner can invite, and only accepted friends can be invited. Newly joined members start counting from the week they join; earlier weeks show 0 for them.

## 3. Your username always visible at the top

The top of every signed-in page (board, Stride, history) shows your avatar circle and your name, so you always know which account you're on. On the board it replaces nothing — it sits in the header next to "Your history" and "Sign out".

## Technical notes

- `getBoard` in `src/lib/board.functions.ts`: add the pending requesters' ids to the profiles lookup; return `username` alongside `name`/`initials` for each incoming request; render both in `board.tsx`.
- New `inviteToChallenge` server function in `src/lib/challenges.functions.ts` (auth middleware, zod: `challengeId`, `friendIds`): verifies the caller owns the challenge, filters to accepted friends who aren't already rows in `challenge_members`, inserts them with status `invited`. Existing RLS ("Owner invites members") already permits this — no migration needed.
- `getChallenge` also returns `invitableFriends` (accepted friends not yet members) so the picker has data; `strides/$id.tsx` gets an "Add friends" modal reusing the friend-picker markup from `strides/new.tsx`, invalidating `["stride"]` and `["strides"]` after inviting.
- A small shared `AccountChip` component (avatar + name) used in the headers of `board.tsx`, `history.tsx`, and `strides/$id.tsx`, fed by existing query data.
