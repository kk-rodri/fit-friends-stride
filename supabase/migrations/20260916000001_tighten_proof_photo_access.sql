-- Trigger function should not be callable via the API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- Restrict proof photo reads to the owner and accepted friends
DROP POLICY IF EXISTS "Signed-in users can view proof photos" ON storage.objects;

CREATE POLICY "View own and friends proof photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'proofs'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (
          (f.user_id = auth.uid() AND (f.friend_id)::text = (storage.foldername(name))[1])
          OR (f.friend_id = auth.uid() AND (f.user_id)::text = (storage.foldername(name))[1])
        )
    )
  )
);