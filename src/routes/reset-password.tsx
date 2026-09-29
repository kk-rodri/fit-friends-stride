import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "New password — Stride" },
      { name: "description", content: "Choose a new password for your Stride account." },
    ],
  }),
  component: ResetPasswordPage,
});

// The emailed link signs the person in with a recovery session; this page
// only has to set the new password on that session.
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes("session")
          ? "This link has expired. Go back to sign in and tap “Forgot password?” again."
          : error.message,
      );
      return;
    }
    navigate({ to: "/board" });
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
          <h1 className="font-display text-2xl font-bold tracking-tight text-frost">
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-mist">Your Strides, friends and workouts are all still here.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              required
              minLength={6}
              className="w-full rounded-xl bg-muted px-4 py-3 text-sm text-frost placeholder:text-mist/70 ring-1 ring-border focus:outline-none focus:ring-volt"
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-volt py-3 font-display text-sm font-bold text-ink transition hover:brightness-105 disabled:opacity-50"
            >
              {busy ? "One moment…" : "Save and continue"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-mist">
            <Link to="/auth" className="font-semibold text-volt hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
