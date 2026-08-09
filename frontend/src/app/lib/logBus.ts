type LogListener = (chunks: string[], replaced: boolean) => void;

/**
 * Chunks kept per channel. xterm's own scrollback is 10k lines, so holding
 * more here buys nothing the user can scroll back to, and a long deploy would
 * otherwise grow this array for the life of the tab.
 */
const MAX_CHUNKS = 5000;

export class LogBus {
  private chunks: string[] = [];
  private listeners = new Set<LogListener>();
  private _version = 0;
  private _dropped = 0;

  write(text: string) {
    this.chunks.push(text);
    if (this.chunks.length > MAX_CHUNKS) {
      this._dropped += this.chunks.length - MAX_CHUNKS;
      this.chunks = this.chunks.slice(-MAX_CHUNKS);
    }
    this._version++;
    for (const fn of this.listeners) fn(this.chunks, false);
  }

  /**
   * How many chunks have been trimmed off the front.
   *
   * Consumers track their position in the whole stream, not in the current
   * array, so they need this to know where the array now starts. Without it a
   * trim silently shifts every index and the next chunk is never written.
   */
  get dropped(): number {
    return this._dropped;
  }

  /**
   * Replaces everything written so far.
   *
   * Log pages are scraped structured views that rewrite in place, so the text
   * a producer already sent can stop being a prefix of the current text. When
   * that happens there is no safe append point and the whole log is resent.
   */
  replace(text: string) {
    this.chunks = [text];
    this._dropped = 0;
    this._version++;
    for (const fn of this.listeners) fn(this.chunks, true);
  }

  /** A copy: callers hold on to snapshots, and this array is mutated in place. */
  getSnapshot(): string[] {
    return [...this.chunks];
  }

  get version(): number {
    return this._version;
  }

  subscribe(fn: LogListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

const logBuses = new Map<string, Map<string, LogBus>>();

export function getLogBus(tabId: string, channel: string): LogBus {
  let tabBuses = logBuses.get(tabId);
  if (!tabBuses) {
    tabBuses = new Map();
    logBuses.set(tabId, tabBuses);
  }
  let bus = tabBuses.get(channel);
  if (!bus) {
    bus = new LogBus();
    tabBuses.set(channel, bus);
  }
  return bus;
}

export function disposeLogBuses(tabId: string): void {
  logBuses.delete(tabId);
}
