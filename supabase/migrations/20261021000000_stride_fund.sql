-- Stride fund: each finished week, last place pays the Stride's creator a set
-- amount (outside the app, e.g. Venmo). Stride only tracks who owes, who says
-- they paid, and what the creator confirmed. Writes go through server
-- functions with the service role, which check who is acting.

ALTER TABLE public.challenges
  ADD COLUMN fund_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN fund_amount_cents integer CHECK (fund_amount_cents BETWEEN 100 AND 10000),
  ADD COLUMN fund_venmo text CHECK (fund_venmo ~ '^[A-Za-z0-9_-]{5,30}$');

CREATE TABLE public.fund_payments (
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  week_index integer NOT NULL CHECK (week_index >= 1),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  claimed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, week_index, user_id)
);

GRANT SELECT ON public.fund_payments TO authenticated;
GRANT ALL ON public.fund_payments TO service_role;

ALTER TABLE public.fund_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members see their Stride's fund" ON public.fund_payments
  FOR SELECT TO authenticated
  USING (private.is_challenge_member(challenge_id, auth.uid()));
