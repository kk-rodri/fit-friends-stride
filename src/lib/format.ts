const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function toDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-").map(Number);
    return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  }
  return new Date(input);
}

/** "Oct 10th 2026" */
export function formatDay(input: string | Date): string {
  const d = toDate(input);
  return `${MONTHS[d.getUTCMonth()]} ${ordinal(d.getUTCDate())} ${d.getUTCFullYear()}`;
}

/** "Oct 10th" */
export function formatDayShort(input: string | Date): string {
  const d = toDate(input);
  return `${MONTHS[d.getUTCMonth()]} ${ordinal(d.getUTCDate())}`;
}

/** "Oct 5th – Oct 11th 2026" */
export function formatRange(start: string | Date, end: string | Date): string {
  return `${formatDayShort(start)} – ${formatDay(end)}`;
}
