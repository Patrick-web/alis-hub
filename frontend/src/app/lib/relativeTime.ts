/**
 * Formats an ISO timestamp as a short age ("5m ago", "3d ago"), falling back to
 * a locale date once it is old enough that an age stops being useful.
 *
 * Returns "" for a missing or unparsable timestamp, so a caller can render it
 * directly without guarding.
 */
export function relativeTime(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}
