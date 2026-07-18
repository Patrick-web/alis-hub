const wired = new Set<string>();

/** Runs module-level wiring (Wails event listeners, pollers) exactly once per
 * app load, guarding against re-invocation from component effects, StrictMode
 * double-mounting, or repeated imports during migration. */
export function wireOnce(key: string, fn: () => void): void {
  if (wired.has(key)) return;
  wired.add(key);
  fn();
}
