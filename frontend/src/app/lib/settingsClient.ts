import * as SettingsService from "../../../bindings/alis-hub-v3/settingsservice";

const MIGRATION_FLAG_KEY = "__meta:localStorageMigrated";

// Every localStorage key ever used by a settings store, copied verbatim into
// SQLite the first time an existing install boots after this migration.
const LEGACY_LOCAL_STORAGE_KEYS = [
  "alis-hub-accent",
  "alis-hub-accent-custom",
  "alis:develop-settings",
  "alis:labs",
  "alis:localai",
  "alis:notifications",
  "alis:platform-override",
  "alis:source-control",
  "alis:tools-context-defaults",
  "alis:tab-settings",
  "alis:recentLandingZone",
  "alis:activeEnvName",
  "alis:systemNotifications",
  "alis-learn-progress",
  "theme",
];

let cache = new Map<string, string>();

async function migrateFromLocalStorage(): Promise<void> {
  for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
    if (cache.has(key)) continue; // already migrated / already set this session
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      continue;
    }
    if (raw == null) continue;
    cache.set(key, raw);
    try {
      await SettingsService.SetSetting(key, raw);
    } catch {
      // best-effort — worst case this key is re-attempted never, but the app
      // still works since the in-memory cache already has the value for this session
    }
  }
  cache.set(MIGRATION_FLAG_KEY, "1");
  try {
    await SettingsService.SetSetting(MIGRATION_FLAG_KEY, "1");
  } catch {}
}

/** Loads all settings from SQLite and runs the one-time localStorage migration if needed. */
export async function init(): Promise<void> {
  try {
    const all = await SettingsService.GetAllSettings();
    cache = new Map(
      Object.entries(all ?? {}).filter((e): e is [string, string] => e[1] !== undefined),
    );
  } catch {
    cache = new Map();
  }
  if (!cache.has(MIGRATION_FLAG_KEY)) {
    await migrateFromLocalStorage();
  }
}

/** Synchronous read from the in-memory cache populated by init(). */
export function getCached(key: string): string | null {
  return cache.get(key) ?? null;
}

/** Fire-and-forget write, mirrors the write-on-every-change pattern the localStorage stores used. */
export function set(key: string, value: string): void {
  cache.set(key, value);
  SettingsService.SetSetting(key, value).catch(() => {});
}
