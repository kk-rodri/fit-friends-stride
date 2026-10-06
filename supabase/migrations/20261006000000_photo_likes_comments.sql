-- Likes and comments on proof photos. Whoever can see a workout (its owner and
-- their accepted friends, same rule as the workouts select policy) can react.

CREATE OR REPLACE FUNCTION private.can_see_workout(_workout_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workouts w
    WHERE w.id = _workout_id
      AND (
        w.user_id = _user_id
        OR EXISTS (
          SELECT 1 FROM public.friendships f
          WHERE f.status = 'accepted'
            AND ((f.user_id = _user_id AND f.friend_id = w.user_id)
              OR (f.friend_id = _user_id AND f.user_id = w.user_id))
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.owns_workout(_workout_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workouts w WHERE w.id = _workout_id AND w.user_id = _user_id
  );
$$;

-- Likes
CREATE TABLE public.workout_likes (
  workout_id uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workout_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.workout_likes TO authenticated;
GRANT ALL ON public.workout_likes TO service_role;

ALTER TABLE public.workout_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "See likes on visible workouts" ON public.workout_likes
  FOR SELECT TO authenticated
  USING (private.can_see_workout(workout_id, auth.uid()));
CREATE POLICY "Like visible workouts" ON public.workout_likes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.can_see_workout(workout_id, auth.uid()));
CREATE POLICY "Remove own like" ON public.workout_likes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Comments
CREATE TABLE public.workout_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workout_comments_workout_idx ON public.workout_comments (workout_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.workout_comments TO authenticated;
GRANT ALL ON public.workout_comments TO service_role;

ALTER TABLE public.workout_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "See comments on visible workouts" ON public.workout_comments
  FOR SELECT TO authenticated
  USING (private.can_see_workout(workout_id, auth.uid()));
CREATE POLICY "Comment on visible workouts" ON public.workout_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.can_see_workout(workout_id, auth.uid()));
CREATE POLICY "Delete own comment or any on own workout" ON public.workout_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR private.owns_workout(workout_id, auth.uid()));
