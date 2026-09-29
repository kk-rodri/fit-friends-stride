CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_challenge_member(_challenge_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.challenge_members m
    WHERE m.challenge_id = _challenge_id AND m.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION private.is_challenge_owner(_challenge_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.challenges c
    WHERE c.id = _challenge_id AND c.owner_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "Members read challenge" ON public.challenges;
CREATE POLICY "Members read challenge" ON public.challenges
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR private.is_challenge_member(id, auth.uid()));

DROP POLICY IF EXISTS "Members read membership" ON public.challenge_members;
CREATE POLICY "Members read membership" ON public.challenge_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_challenge_member(challenge_id, auth.uid()));

DROP POLICY IF EXISTS "Owner invites members" ON public.challenge_members;
CREATE POLICY "Owner invites members" ON public.challenge_members
  FOR INSERT TO authenticated
  WITH CHECK (private.is_challenge_owner(challenge_id, auth.uid()));

DROP POLICY IF EXISTS "Leave or owner removes" ON public.challenge_members;
CREATE POLICY "Leave or owner removes" ON public.challenge_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR private.is_challenge_owner(challenge_id, auth.uid()));

DROP FUNCTION IF EXISTS public.is_challenge_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_challenge_owner(uuid, uuid);