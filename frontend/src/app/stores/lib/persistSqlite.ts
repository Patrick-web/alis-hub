import type { PersistOptions, PersistStorage, StorageValue } from "zustand/middleware";
import * as settingsClient from "../../lib/settingsClient";

/** True when the raw JSON is a zustand persist envelope ({ state, version })
 * rather than a legacy flat settings payload written by the pre-zustand stores. */
function isEnvelope(value: unknown): value is StorageValue<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "state" in value &&
    "version" in value
  );
}

function createSqliteStorage<P>(): PersistStorage<P> {
  return {
    getItem: (name) => {
      const raw = settingsClient.getCached(name);
      if (raw == null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isEnvelope(parsed)) return parsed as StorageValue<P>;
        // Legacy payload from the pre-zustand stores: surface it as version 0
        // state so merge()/migrate() can reconcile it.
        return { state: parsed as P, version: 0 };
      } catch {
        return null;
      }
    },
    setItem: (name, value) => settingsClient.set(name, JSON.stringify(value)),
    removeItem: () => {
      // settingsClient has no delete; persist.clearStorage() is unused here.
    },
  };
}

interface HydratableStore {
  persist: { rehydrate: () => Promise<void> | void };
}

const pendingReady: Array<() => void> = [];
let settingsReady = false;

/** Runs fn once the SQLite settings cache is loaded (immediately if it already
 * is). Store modules are evaluated by the static import graph before
 * settingsClient.init() has populated the cache, so reads at create() time
 * would always see an empty cache. */
export function onSettingsReady(fn: () => void): void {
  if (settingsReady) fn();
  else pendingReady.push(fn);
}

/** Registers a persisted store for hydration once the settings cache is ready. */
export function hydrateWhenReady(store: HydratableStore): void {
  onSettingsReady(() => void store.persist.rehydrate());
}

/** Called once from bootstrap() after settingsClient.init(), before render. */
export function rehydratePersistedStores(): void {
  settingsReady = true;
  for (const fn of pendingReady.splice(0)) fn();
}

interface PersistSqliteOptions<S, P> {
  key: string;
  version?: number;
  partialize?: (state: S) => P;
  migrate?: (persistedState: unknown, version: number) => P | Promise<P>;
  merge?: (persistedState: unknown, currentState: S) => S;
}

/** Zustand persist options backed by the SQLite settings store. Pair with
 * hydrateWhenReady() so the store hydrates after the settings cache loads. */
export function persistSqlite<S, P = S>(options: PersistSqliteOptions<S, P>): PersistOptions<S, P> {
  const { key, version = 0, ...rest } = options;
  return {
    name: key,
    version,
    storage: createSqliteStorage<P>(),
    skipHydration: true,
    ...rest,
  };
}
