import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/board.functions";

const AVATAR_BG = [
  "bg-avatar-1",
  "bg-avatar-2",
  "bg-avatar-3",
  "bg-avatar-4",
  "bg-avatar-5",
  "bg-avatar-6",
] as const;

function avatarClass(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
}

/** Always-visible "you are signed in as" chip for the top of every page. */
export function AccountChip({ className = "" }: { className?: string }) {
  const fetchMe = useServerFn(getMe);
  const { data } = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchMe(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full bg-frost/[0.05] py-1.5 pl-1.5 pr-3.5 ring-1 ring-white/[0.07] ${className}`}
    >
      <div
        className={`grid size-7 shrink-0 place-items-center rounded-full font-display text-[10px] font-semibold text-frost ${
          data ? avatarClass(data.id) : "bg-steel"
        }`}
      >
        {data?.initials ?? "·"}
      </div>
      <span className="max-w-[12rem] truncate font-display text-xs font-semibold text-frost">
        {data?.username || data?.name || "…"}
      </span>
    </div>
  );
}
