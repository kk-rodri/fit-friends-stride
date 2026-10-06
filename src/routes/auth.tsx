import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkNameAvailable } from "@/lib/board.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Stride" },
      { name: "description", content: "Sign in or create your Stride account to join the weekly workout board." },
      { property: "og:title", content: "Sign in — Stride" },
      { property: "og:description", content: "Sign in or create your Stride account to join the weekly workout board." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Where to go after signing in, e.g. back to an invite link. Same-site paths only.
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = typeof search["next"] === "string" ? search["next"] : undefined;
    // "//x" and "/\\x" would leave the site, so only plain "/path" is allowed.
    return next && /^\/(?![/\\])/.test(next) ? { next } : {};
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const next = Route.useSearch().next ?? "/board";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleForgot() {
    setError(null);
    if (!email) {
      setError("Enter your email above, then tap “Forgot password?”.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setResetSent(true);
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const uname = username.trim();
        if (uname.length < 3) {
          setError("Pick a username of at least 3 characters.");
          return;
        }
        if (uname.length > 30) {
          setError("Usernames can be at most 30 characters.");
          return;
        }
        const { available } = await checkNameAvailable({ data: { name: uname } });
        if (!available) {
          setError("That username is taken — try another one.");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: uname, display_name: uname },
            emailRedirectTo: `${window.location.origin}${next}`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setConfirmEmail(true);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ href: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    // Supabase redirects to Google and back to `next` with the session in the URL.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${next}` },
    });
    if (error) setError(error.message ?? "Google sign-in failed");
  }

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
          {confirmEmail || resetSent ? (
            <div className="text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-volt/15 font-display text-xl text-volt">
                ✓
              </div>
              <h1 className="mt-4 font-display text-xl font-bold text-frost">
                Check your email
              </h1>
              <p className="mt-2 text-sm text-mist">
                {resetSent
                  ? `We sent a link to ${email}. Click it to choose a new password.`
                  : `We sent a confirmation link to ${email}. Click it, then come back and sign in.`}
              </p>
              <button
                onClick={() => {
                  setConfirmEmail(false);
                  setResetSent(false);
                  setMode("signin");
                }}
                className="mt-6 w-full rounded-full bg-volt py-3 font-display text-sm font-bold text-ink transition hover:brightness-105"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold tracking-tight text-frost">
                {mode === "signin" ? "Welcome back" : "Join the board"}
              </h1>
              <p className="mt-1 text-sm text-mist">
                {mode === "signin"
                  ? "Sign in to see this week's standings."
                  : "Create your account and start logging workouts."}
              </p>

              <form onSubmit={handleEmail} className="mt-6 space-y-3">
                {mode === "signup" && (
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    required
                    className="w-full rounded-xl bg-muted px-4 py-3 text-sm text-frost placeholder:text-mist/70 ring-1 ring-border focus:outline-none focus:ring-volt"
                  />
                )}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="w-full rounded-xl bg-muted px-4 py-3 text-sm text-frost placeholder:text-mist/70 ring-1 ring-border focus:outline-none focus:ring-volt"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={6}
                  className="w-full rounded-xl bg-muted px-4 py-3 text-sm text-frost placeholder:text-mist/70 ring-1 ring-border focus:outline-none focus:ring-volt"
                />
                {mode === "signin" && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={handleForgot}
                      disabled={busy}
                      className="text-xs text-mist hover:text-volt"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-full bg-volt py-3 font-display text-sm font-bold text-ink transition hover:brightness-105 disabled:opacity-50"
                >
                  {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </form>

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-mist">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <button
                onClick={handleGoogle}
                className="w-full rounded-full bg-secondary py-3 font-display text-sm font-bold text-frost ring-1 ring-border transition hover:bg-accent"
              >
                Continue with Google
              </button>

              <p className="mt-5 text-center text-sm text-mist">
                {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
                <button
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setError(null);
                  }}
                  className="font-semibold text-volt hover:underline"
                >
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
