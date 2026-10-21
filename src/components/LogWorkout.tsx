import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { logWorkout } from "@/lib/board.functions";

/**
 * Floating "Log workout + photo" button and its form. A workout counts toward
 * every Stride you're in, so the board and Stride pages share this.
 */
export function LogWorkoutButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div
        className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 animate-rise"
        style={{ animationDelay: ".24s" }}
      >
        <button
          onClick={() => setOpen(true)}
          className="volt-glow inline-flex items-center gap-2 rounded-full bg-volt py-3 pl-4 pr-5 font-display text-sm font-bold text-ink ring-1 ring-volt transition hover:brightness-105"
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink font-display text-[11px] font-extrabold leading-none text-volt">
            ✓
          </span>
          Log workout + photo
        </button>
      </div>

      {open && <LogWorkoutModal onClose={() => setOpen(false)} />}
    </>
  );
}

function LogWorkoutModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const log = useServerFn(logWorkout);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let photoPath: string | undefined;
      if (file) {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) throw new Error("Not signed in");
        // Short letters-and-digits extension only (the server rejects anything else).
        const raw = file.name.includes(".") ? file.name.split(".").pop()! : "";
        const ext =
          raw
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 5) || "jpg";
        photoPath = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("proofs")
          .upload(photoPath, file, { contentType: file.type });
        if (upErr) throw upErr;
      }
      await log({ data: { photoPath, note: note || undefined } });
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["photos"] });
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["stride"] });
      queryClient.invalidateQueries({ queryKey: ["strides"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-ink/70 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-sm rounded-3xl bg-steel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-bold text-frost">Log a workout</h2>
        <p className="mt-1 text-sm text-mist">Add a photo as proof — it counts once saved.</p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-input bg-muted py-8 text-sm text-mist transition hover:border-volt/50 hover:text-frost"
        >
          {file ? file.name : "Choose a photo"}
        </button>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={80}
          placeholder="What did you do? (e.g. Run, Lift, Flow)"
          className="mt-3 w-full rounded-xl bg-muted px-4 py-3 text-sm text-frost ring-1 ring-border placeholder:text-mist/70 focus:outline-none focus:ring-volt"
        />

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-full py-3 font-display text-sm font-bold text-mist ring-1 ring-border transition hover:text-frost"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 rounded-full bg-volt py-3 font-display text-sm font-bold text-ink transition hover:brightness-105 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Post workout"}
          </button>
        </div>
      </div>
    </div>
  );
}
