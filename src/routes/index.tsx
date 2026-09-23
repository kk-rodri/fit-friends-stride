import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import proofRun from "@/assets/proof-run.jpg";
import proofLift from "@/assets/proof-lift.jpg";
import proofFlow from "@/assets/proof-flow.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stride — Weekly workout board with friends" },
      {
        name: "description",
        content:
          "Add friends, log workouts with photo proof, and see who worked out most this week.",
      },
      { property: "og:title", content: "Stride — Weekly workout board with friends" },
      {
        property: "og:description",
        content:
          "Add friends, log workouts with photo proof, and see who worked out most this week.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-body text-foreground">
      <div className="absolute inset-0 bg-scene" />
      <div className="absolute inset-0 bg-scene-streak" />

      <div className="relative mx-auto max-w-2xl px-5 py-12">
        <header className="animate-rise flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-volt font-display text-xs font-extrabold leading-none text-ink">
            ✓
          </span>
          <span className="font-display text-sm font-bold tracking-tight text-frost/90">
            STRIDE
          </span>
        </header>

        <main className="mt-16 animate-rise" style={{ animationDelay: ".06s" }}>
          <p className="font-display text-xs font-extrabold uppercase tracking-[0.18em] text-volt">
            Weekly accountability
          </p>
          <h1 className="mt-4 max-w-[16ch] text-balance font-display text-5xl font-bold leading-[1.02] tracking-tight text-frost sm:text-6xl">
            Who worked out most this week?
          </h1>
          <p className="mt-5 max-w-[42ch] text-pretty text-base leading-relaxed text-mist">
            Add your friends, log each workout with a photo as proof, and let the weekly
            leaderboard settle the debate.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to={signedIn ? "/board" : "/auth"}
              className="volt-glow inline-flex items-center gap-2 rounded-full bg-volt py-3 pl-4 pr-5 font-display text-sm font-bold text-ink ring-1 ring-volt transition hover:brightness-105"
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink font-display text-[11px] font-extrabold leading-none text-volt">
                ✓
              </span>
              {signedIn ? "Open your board" : "Start your board"}
            </Link>
            {!signedIn && (
              <Link
                to="/auth"
                className="inline-flex items-center rounded-full px-5 py-3 font-display text-sm font-bold text-frost/80 ring-1 ring-border transition hover:text-volt"
              >
                Sign in
              </Link>
            )}
          </div>
        </main>

        <section className="mt-16 animate-rise" style={{ animationDelay: ".14s" }}>
          <p className="mb-4 font-display text-xs font-bold uppercase tracking-[0.16em] text-volt">
            Proof, not promises
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { src: proofRun, label: "Dana · Run" },
              { src: proofLift, label: "Marcus · Lift" },
              { src: proofFlow, label: "Priya · Flow" },
            ].map((p) => (
              <figure
                key={p.label}
                className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-border"
              >
                <img
                  src={p.src}
                  alt={`Workout proof photo — ${p.label}`}
                  loading="lazy"
                  width={816}
                  height={816}
                  className="h-full w-full object-cover"
                />
                <figcaption className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-ink/60 p-2 backdrop-blur-sm">
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-volt font-display text-[10px] font-bold leading-none text-ink">
                    ✓
                  </span>
                  <span className="truncate text-[11px] leading-none text-frost">{p.label}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-4 text-sm text-mist">
            One photo per session. Friends see your proof — and your count.
          </p>
        </section>
      </div>
    </div>
  );
}
