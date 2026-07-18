import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { System } from "@wailsio/runtime";
import * as settingsClient from "../lib/settingsClient";

export type RealPlatform = "darwin" | "windows" | "linux";
export type PlatformOverride = "auto" | RealPlatform;

interface EnvironmentInfo {
  OS?: string;
  Arch?: string;
}

interface PlatformContextValue {
  real: RealPlatform;
  envInfo: EnvironmentInfo | null;
  override: PlatformOverride;
  effective: RealPlatform;
  setOverride: (v: PlatformOverride) => void;
}

const STORAGE_KEY = "alis:platform-override";

function loadOverride(): PlatformOverride {
  try {
    const raw = settingsClient.getCached(STORAGE_KEY);
    if (raw === "darwin" || raw === "windows" || raw === "linux" || raw === "auto") return raw;
    return "auto";
  } catch {
    return "auto";
  }
}

function saveOverride(v: PlatformOverride) {
  settingsClient.set(STORAGE_KEY, v);
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const [real, setReal] = useState<RealPlatform>(() =>
    System.IsWindows() ? "windows" : System.IsLinux() ? "linux" : "darwin",
  );
  const [envInfo, setEnvInfo] = useState<EnvironmentInfo | null>(null);
  const [override, setOverrideState] = useState<PlatformOverride>(loadOverride);

  // Self-heal: System.IsWindows() reads a global injected into the webview,
  // which can lose the race on first module/mount evaluation. Environment()
  // is an async round-trip to the Go backend, so it's an authoritative
  // correction if the two ever disagree.
  useEffect(() => {
    System.Environment()
      .then((env) => {
        setEnvInfo(env);
        if (env?.OS === "windows") setReal("windows");
        else if (env?.OS === "linux") setReal("linux");
        else if (env?.OS) setReal("darwin");
      })
      .catch(() => {});
  }, []);

  const setOverride = useCallback((v: PlatformOverride) => {
    setOverrideState(v);
    saveOverride(v);
  }, []);

  const effective: RealPlatform = override === "auto" ? real : override;

  return (
    <PlatformContext.Provider value={{ real, envInfo, override, effective, setOverride }}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatform must be used within PlatformProvider");
  return ctx;
}
