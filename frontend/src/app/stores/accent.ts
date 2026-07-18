import { create } from "zustand";
import * as settingsClient from "../lib/settingsClient";
import { onSettingsReady } from "./lib/persistSqlite";
import {
  getAccessibleForeground,
  getAccessibleTextColor,
  getAccentHoverFill,
} from "../lib/colorContrast";

export interface AccentColor {
  id: string;
  label: string;
  brand: string;
}

export const ACCENT_COLORS: AccentColor[] = [
  { id: "pink", label: "Pink", brand: "#f881a9" },
  { id: "blue", label: "Blue", brand: "#2563eb" },
  { id: "purple", label: "Purple", brand: "#bf5af2" },
  { id: "green", label: "Green", brand: "#34c759" },
  { id: "orange", label: "Orange", brand: "#ff9f0a" },
  { id: "red", label: "Red", brand: "#ff3b30" },
  { id: "teal", label: "Teal", brand: "#5ac8fa" },
];

// Persisted as raw strings (not JSON) for compatibility with the values the
// hook-based store wrote, so persistSqlite's JSON envelope is not used here.
const STORAGE_KEY = "alis-hub-accent";
const CUSTOM_COLOR_KEY = "alis-hub-accent-custom";
const DEFAULT_ID = "pink";
const DEFAULT_CUSTOM_HEX = "#f881a9";

function currentPageBackground(): string {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  return bg || "#ffffff";
}

function applyAccent(brand: string) {
  const pageBackground = currentPageBackground();
  document.documentElement.style.setProperty("--brand-fill", brand);
  document.documentElement.style.setProperty("--brand-fill-hover", getAccentHoverFill(brand));
  document.documentElement.style.setProperty("--brand-foreground", getAccessibleForeground(brand));
  document.documentElement.style.setProperty(
    "--brand",
    getAccessibleTextColor(brand, pageBackground),
  );
  document.documentElement.style.setProperty("--ring", brand);
}

/** Re-applies the persisted accent against the current theme background.
 * Called on boot and whenever the resolved theme changes (RootLayout). */
export function initAccentColor() {
  const id = settingsClient.getCached(STORAGE_KEY) ?? DEFAULT_ID;
  if (id === "custom") {
    const hex = settingsClient.getCached(CUSTOM_COLOR_KEY) ?? DEFAULT_CUSTOM_HEX;
    applyAccent(hex);
  } else {
    const color = ACCENT_COLORS.find((c) => c.id === id) ?? ACCENT_COLORS[0];
    applyAccent(color.brand);
  }
}

interface AccentStore {
  accentId: string;
  customHex: string;
  setAccent: (id: string) => void;
  setCustomAccent: (hex: string) => void;
}

export const useAccentColor = create<AccentStore>((set) => ({
  accentId: DEFAULT_ID,
  customHex: DEFAULT_CUSTOM_HEX,
  setAccent: (id) => {
    const color = ACCENT_COLORS.find((c) => c.id === id) ?? ACCENT_COLORS[0];
    settingsClient.set(STORAGE_KEY, id);
    applyAccent(color.brand);
    set({ accentId: id });
  },
  setCustomAccent: (hex) => {
    settingsClient.set(CUSTOM_COLOR_KEY, hex);
    settingsClient.set(STORAGE_KEY, "custom");
    applyAccent(hex);
    set({ customHex: hex, accentId: "custom" });
  },
}));

onSettingsReady(() => {
  useAccentColor.setState({
    accentId: settingsClient.getCached(STORAGE_KEY) ?? DEFAULT_ID,
    customHex: settingsClient.getCached(CUSTOM_COLOR_KEY) ?? DEFAULT_CUSTOM_HEX,
  });
});
