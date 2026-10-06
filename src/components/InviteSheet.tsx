import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { Copy, Share2, X } from "lucide-react";
import { getMyInvite, resetMyInvite } from "@/lib/invites.functions";

/** QR code, copy link, WhatsApp and the phone's share sheet for one invite link. */
export function InviteSheet({
  challengeId,
  strideName,
  onClose,
}: {
  challengeId?: string;
  strideName?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchInvite = useServerFn(getMyInvite);
  const reset = useServerFn(resetMyInvite);
  const inviteKey = ["my-invite", challengeId ?? "friends"];
  const { data, error } = useQuery({
    queryKey: inviteKey,
    queryFn: () => fetchInvite({ data: { challengeId } }),
  });

  const link = data ? `${window.location.origin}/join/${data.code}` : "";
  const message = strideName
    ? `Join my Stride "${strideName}" 💪 ${link}`
    : `Join me on Stride 💪 Let's see who works out most each week: ${link}`;

  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  useEffect(() => {
    if (!link) return;
    QRCode.toString(link, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#131a27", light: "#ffffff" },
    }).then(setQr);
  }, [link]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    try {
      await navigator.share({ title: "Stride", text: message });
    } catch {
      /* closed the share sheet */
    }
  }

  async function handleReset() {
    if (!window.confirm("Make a new link? The old link and QR code will stop working.")) return;
    const fresh = await reset({ data: { challengeId } });
    queryClient.setQueryData(inviteKey, fresh);
  }

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-ink/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Invite friends"
        className="glass-card w-full max-w-sm rounded-3xl bg-steel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold text-frost">
              {strideName ? "Invite to this Stride" : "Invite friends"}
            </h2>
            <p className="mt-1 text-sm text-mist">
              {strideName
                ? "Anyone with this link joins the Stride and becomes your friend."
                : "Anyone with this link becomes your friend right away."}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full text-frost/70 transition hover:bg-frost/10 hover:text-frost"
          >
            <X className="size-5" />
          </button>
        </div>

        {error ? (
          <p className="mt-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Couldn't load your invite"}
          </p>
        ) : (
          <>
            <div className="mx-auto mt-6 aspect-square w-56 overflow-hidden rounded-2xl bg-white p-2">
              {qr ? (
                <div
                  className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                  role="img"
                  aria-label="QR code for your invite link"
                  dangerouslySetInnerHTML={{ __html: qr }}
                />
              ) : null}
            </div>
            <p className="mt-2 text-center text-xs text-mist">Scan with a phone camera</p>

            <div className="mt-5 flex items-center gap-2 rounded-full bg-muted py-1 pl-4 pr-1 ring-1 ring-border">
              <span className="min-w-0 flex-1 truncate text-sm text-frost">
                {link || "Making your link…"}
              </span>
              <button
                onClick={handleCopy}
                disabled={!link}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-xs font-semibold text-frost transition hover:bg-accent disabled:opacity-50"
              >
                <Copy className="size-3.5" aria-hidden="true" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <a
              href={link ? `https://wa.me/?text=${encodeURIComponent(message)}` : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!link}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-3 font-display text-sm font-bold text-[#0b2e17] transition hover:brightness-105"
            >
              Share on WhatsApp
            </a>

            {canShare && (
              <button
                onClick={handleShare}
                disabled={!link}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-secondary py-3 font-display text-sm font-bold text-frost ring-1 ring-border transition hover:bg-accent disabled:opacity-50"
              >
                <Share2 className="size-4" aria-hidden="true" />
                More ways to share
              </button>
            )}

            <button
              onClick={handleReset}
              disabled={!link}
              className="mt-4 w-full text-center text-xs text-mist transition hover:text-frost"
            >
              Reset link
            </button>
          </>
        )}
      </div>
    </div>
  );
}
