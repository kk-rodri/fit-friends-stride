/**
 * Who pays into a Stride's fund for one finished week: everyone tied for the
 * fewest workouts. Nobody pays if nobody logged, or if everyone is level
 * (there's no "last place" when no one is behind).
 */
export function lastPlace(rows: { userId: string; workouts: number }[]): string[] {
  if (rows.length < 2) return [];
  const counts = rows.map((r) => r.workouts);
  const low = Math.min(...counts);
  const high = Math.max(...counts);
  if (high === 0 || low === high) return [];
  return rows.filter((r) => r.workouts === low).map((r) => r.userId);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
