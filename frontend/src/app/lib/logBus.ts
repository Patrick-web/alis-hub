type LogListener = (chunks: string[]) => void;

export class LogBus {
  private chunks: string[] = [];
  private listeners = new Set<LogListener>();
  private _version = 0;

  write(text: string) {
    this.chunks.push(text);
    this._version++;
    for (const fn of this.listeners) fn(this.chunks);
  }

  getSnapshot(): string[] {
    return this.chunks;
  }

  get version(): number {
    return this._version;
  }

  subscribe(fn: LogListener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
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
