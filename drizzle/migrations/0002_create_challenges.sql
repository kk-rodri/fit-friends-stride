CREATE TABLE public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  weeks integer NOT NULL DEFAULT 4,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.challenge_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX idx_challenge_members_user ON public.challenge_members(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenges TO authenticated;
GRANT ALL ON public.challenges TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.challenge_members TO authenticated;
GRANT ALL ON public.challenge_members TO service_role;

CREATE OR REPLACE FUNCTION public.is_challenge_member(_challenge_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.challenge_members m
    WHERE m.challenge_id = _challenge_id AND m.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_challenge_owner(_challenge_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.challenges c
    WHERE c.id = _challenge_id AND c.owner_id = _user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_challenge_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_challenge_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_challenge_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_challenge_owner(uuid, uuid) TO authenticated;

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read challenge" ON public.challenges
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_challenge_member(id, auth.uid()));

CREATE POLICY "Owner creates challenge" ON public.challenges
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner updates challenge" ON public.challenges
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owner deletes challenge" ON public.challenges
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Members read membership" ON public.challenge_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_challenge_member(challenge_id, auth.uid()));

CREATE POLICY "Owner invites members" ON public.challenge_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_challenge_owner(challenge_id, auth.uid()));

CREATE POLICY "Respond to own invite" ON public.challenge_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Leave or owner removes" ON public.challenge_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_challenge_owner(challenge_id, auth.uid()));
