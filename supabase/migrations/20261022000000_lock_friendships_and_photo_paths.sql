-- Security fixes.
--
-- 1. Accepting a friend request could also rewrite who the request was from,
--    turning someone else's request into an accepted friendship with anyone.
--    Signed-in users may now change only the status column, and only from
--    pending to accepted, on requests sent to them.
REVOKE UPDATE ON public.friendships FROM authenticated;
GRANT UPDATE (status) ON public.friendships TO authenticated;

DROP POLICY IF EXISTS "Recipient accepts request" ON public.friendships;
CREATE POLICY "Recipient accepts request" ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = friend_id AND status = 'pending')
  WITH CHECK (auth.uid() = friend_id AND status = 'accepted');

-- 2. A workout could point at a photo in someone else's folder, and deleting
--    that workout then removed their file. A workout's photo must live in its
--    owner's own folder.
ALTER TABLE public.workouts
  ADD CONSTRAINT workouts_photo_in_own_folder
  CHECK (photo_path IS NULL OR split_part(photo_path, '/', 1) = user_id::text);
