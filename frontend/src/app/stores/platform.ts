import { create } from "zustand";
import { System } from "@wailsio/runtime";
import * as settingsClient from "../lib/settingsClient";
import { onSettingsReady } from "./lib/persistSqlite";

export type RealPlatform = "darwin" | "windows" | "linux";
export type PlatformOverride = "auto" | RealPlatform;

interface EnvironmentInfo {
  OS?: string;
  Arch?: string;
}

interface PlatformStore {
  real: RealPlatform;
  envInfo: EnvironmentInfo | null;
  override: PlatformOverride;
  setOverride: (v: PlatformOverride) => void;
}

// Persisted as a raw string (not JSON) for compatibility with the value the
// context-based store wrote, so persistSqlite's JSON envelope is not used here.
const STORAGE_KEY = "alis:platform-override";

function loadOverride(): PlatformOverride {
  const raw = settingsClient.getCached(STORAGE_KEY);
  if (raw === "darwin" || raw === "windows" || raw === "linux" || raw === "auto") return raw;
  return "auto";
}

export const usePlatformStore = create<PlatformStore>((set) => ({
  real: System.IsWindows() ? "windows" : System.IsLinux() ? "linux" : "darwin",
  envInfo: null,
  override: "auto",
  setOverride: (v) => {
    set({ override: v });
    settingsClient.set(STORAGE_KEY, v);
  },
}));

onSettingsReady(() => {
  usePlatformStore.setState({ override: loadOverride() });

  // Self-heal: System.IsWindows() reads a global injected into the webview,
  // which can lose the race on first module evaluation. Environment() is an
  // async round-trip to the Go backend, so it's an authoritative correction
  // if the two ever disagree.
  System.Environment()
    .then((env: EnvironmentInfo | undefined) => {
      if (!env) return;
      const real: RealPlatform =
        env.OS === "windows" ? "windows" : env.OS === "linux" ? "linux" : "darwin";
      usePlatformStore.setState(env.OS ? { envInfo: env, real } : { envInfo: env });
    })
    .catch(() => {});
});

interface PlatformValue extends PlatformStore {
  effective: RealPlatform;
}

export function usePlatform(): PlatformValue {
  const real = usePlatformStore((s) => s.real);
  const envInfo = usePlatformStore((s) => s.envInfo);
  const override = usePlatformStore((s) => s.override);
  const setOverride = usePlatformStore((s) => s.setOverride);
  return { real, envInfo, override, effective: override === "auto" ? real : override, setOverride };
}
