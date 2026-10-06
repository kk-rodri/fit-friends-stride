-- Shareable invite links. Anyone holding a code becomes friends with its owner
-- (and joins the Stride, for Stride codes), so codes are random and resettable.
-- Codes are generated and redeemed by server functions with the service role;
-- signed-in users can only see and delete their own.
CREATE TABLE public.invites (
  code text PRIMARY KEY CHECK (code ~ '^[A-Za-z0-9_-]{12,32}$'),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id uuid REFERENCES public.challenges(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One active code per person, and one per person per Stride.
CREATE UNIQUE INDEX invites_one_friend_code ON public.invites (user_id) WHERE challenge_id IS NULL;
CREATE UNIQUE INDEX invites_one_stride_code ON public.invites (user_id, challenge_id)
  WHERE challenge_id IS NOT NULL;

GRANT SELECT, DELETE ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "See own invites" ON public.invites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Delete own invites" ON public.invites
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
