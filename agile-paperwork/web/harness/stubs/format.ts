// Harness stand-in: formatDate copied from src/lib/quotes/format.ts.
function parseDateOnly(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
export function formatDate(v: Date | string | null | undefined, now: Date = new Date()): string {
  if (!v) return "";
  const d = v instanceof Date ? v : /^\d{4}-\d{2}-\d{2}$/.test(v) ? parseDateOnly(v) : new Date(v);
  if (!d || Number.isNaN(d.getTime())) return "";
  const base = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}
