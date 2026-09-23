# Usernames accept any character

## Problem
At signup, the app silently rewrites the name you type: anything that isn't a letter, number, or underscore is stripped from the username (so "kk.rodri" became "kkrodri"), while the display name keeps the original. Result: two different names from one input, and friends searching the exact name can't find you.

## What changes

1. **Signup keeps your name exactly as typed**
   - Remove the character-stripping cleanup in `src/routes/auth.tsx`.
   - The name you type becomes both your username and display name, unchanged (only leading/trailing spaces trimmed, case kept).
   - Validation: at least 3 characters, at most 30, not already taken (case-insensitive check against existing profiles before creating the account, with a clear "that name is taken" message).

2. **Fix your existing account**
   - Update the profile for kkrodri so the username becomes exactly `kk.rodri`, matching the display name.

3. **Search stays exact-match**
   - The existing exact-match search (username or display name, case-insensitive) keeps working as-is; with names no longer rewritten, typing "kk.rodri" finds you.

## Technical notes
- Uniqueness check runs through a small server function querying `profiles` (username/display_name, case-insensitive) before sign-up.
- No schema changes; only the signup form logic, one new server function, and one profile row update.
- Input is length-limited and trimmed; React already escapes rendered text, so any characters are safe to store and display.
