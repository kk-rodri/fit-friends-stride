import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getInvitePreview, redeemInvite } from "@/lib/invites.functions";

export const Route = createFileRoute("/join/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "You're invited — Stride" },
      { name: "description", content: "Join your friends on Stride, the weekly workout board." },
      { property: "og:title", content: "You're invited to Stride" },
      {
        property: "og:description",
        content: "Log workouts with photo proof and see who worked out most this week.",
      },
    ],
  }),
  // `go=1` means we're coming back from sign-in, so finish joining without another tap.
  validateSearch: (search: Record<string, unknown>): { go?: 1 } =>
    search["go"] === 1 || search["go"] === "1" ? { go: 1 } : {},
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const { go } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchPreview = useServerFn(getInvitePreview);
  const redeem = useServerFn(redeemInvite);

  const { data: preview, isPending } = useQuery({
    queryKey: ["invite", code],
    queryFn: () => fetchPreview({ data: { code } }),
  });
  const { data: signedIn } = useQuery({
    queryKey: ["session"],
    queryFn: async () => !!(await supabase.auth.getSession()).data.session,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSelf, setIsSelf] = useState(false);
  const autoRan = useRef(false);

  async function handleJoin() {
    setError(null);
    setBusy(true);
    try {
      const result = await redeem({ data: { code } });
      if (result.self) {
        setIsSelf(true);
        return;
      }
      for (const key of [["board"], ["photos"], ["strides"], ["stride"]]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      navigate({ href: result.redirect });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (go && signedIn && preview?.valid && !autoRan.current) {
      autoRan.current = true;
      void handleJoin();
    }
  });

  const name = preview?.valid ? preview.inviterName : "";
  const stride = preview?.valid ? preview.strideName : null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 font-body text-foreground">
      <div className="absolute inset-0 bg-scene" />
      <div className="absolute inset-0 bg-scene-streak" />

      <div className="relative w-full max-w-sm animate-rise">
        <Link to="/" className="mb-8 flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-volt font-display text-xs font-extrabold leading-none text-ink">
            ✓
          </span>
          <span className="font-display text-sm font-bold tracking-tight text-frost/90">
            STRIDE
          </span>
        </Link>

        <div className="glass-card rounded-3xl p-6">
          {isPending ? (
            <p className="text-sm text-mist">Loading your invite…</p>
          ) : !preview?.valid ? (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tight text-frost">
                This invite doesn't work anymore
              </h1>
              <p className="mt-2 text-sm text-mist">
                The link may have been reset. Ask your friend to send you a new one.
              </p>
              <Link
                to="/board"
                className="mt-6 block w-full rounded-full bg-secondary py-3 text-center font-display text-sm font-bold text-frost ring-1 ring-border transition hover:bg-accent"
              >
                Go to Stride
              </Link>
            </>
          ) : isSelf ? (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tight text-frost">
                This is your own invite
              </h1>
              <p className="mt-2 text-sm text-mist">
                Share it with friends so they can join you on Stride.
              </p>
              <Link
                to="/board"
                className="mt-6 block w-full rounded-full bg-volt py-3 text-center font-display text-sm font-bold text-ink transition hover:brightness-105"
              >
                Back to your board
              </Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tight text-frost">
                {stride ? (
                  <>
                    {name} invited you to <span className="text-volt">{stride}</span>
                  </>
                ) : (
                  <>
                    {name} invited you to <span className="text-volt">Stride</span>
                  </>
                )}
              </h1>
              <p className="mt-2 text-sm text-mist">
                {stride
                  ? `Join the Stride and become friends with ${name}: log workouts with a photo and see who shows up most each week.`
                  : `Become friends with ${name}: log workouts with a photo and see who shows up most each week.`}
              </p>

              {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

              {signedIn ? (
                <button
                  onClick={handleJoin}
                  disabled={busy}
                  className="mt-6 w-full rounded-full bg-volt py-3 font-display text-sm font-bold text-ink transition hover:brightness-105 disabled:opacity-50"
                >
                  {busy ? "One moment…" : stride ? "Join Stride" : `Add ${name}`}
                </button>
              ) : (
                <Link
                  to="/auth"
                  search={{ next: `/join/${code}?go=1` }}
                  className="mt-6 block w-full rounded-full bg-volt py-3 text-center font-display text-sm font-bold text-ink transition hover:brightness-105"
                >
                  Sign in to join
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
