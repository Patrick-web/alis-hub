import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import * as settingsClient from '../lib/settingsClient';
import { getAccessibleForeground, getAccessibleTextColor } from '../lib/colorContrast';

export interface AccentColor {
  id: string;
  label: string;
  brand: string;
}

export const ACCENT_COLORS: AccentColor[] = [
  { id: 'pink',   label: 'Pink',   brand: '#f881a9' },
  { id: 'blue',   label: 'Blue',   brand: '#2563eb' },
  { id: 'purple', label: 'Purple', brand: '#bf5af2' },
  { id: 'green',  label: 'Green',  brand: '#34c759' },
  { id: 'orange', label: 'Orange', brand: '#ff9f0a' },
  { id: 'red',    label: 'Red',    brand: '#ff3b30' },
  { id: 'teal',   label: 'Teal',   brand: '#5ac8fa' },
];

const STORAGE_KEY = 'alis-hub-accent';
const CUSTOM_COLOR_KEY = 'alis-hub-accent-custom';
const DEFAULT_ID = 'pink';

function currentPageBackground(): string {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
  return bg || '#ffffff';
}

function applyAccent(brand: string) {
  const pageBackground = currentPageBackground();
  document.documentElement.style.setProperty('--brand-fill', brand);
  document.documentElement.style.setProperty('--brand-foreground', getAccessibleForeground(brand));
  document.documentElement.style.setProperty('--brand', getAccessibleTextColor(brand, pageBackground));
  document.documentElement.style.setProperty('--ring', brand);
}

export function initAccentColor() {
  const id = settingsClient.getCached(STORAGE_KEY) ?? DEFAULT_ID;
  if (id === 'custom') {
    const hex = settingsClient.getCached(CUSTOM_COLOR_KEY) ?? '#f881a9';
    applyAccent(hex);
  } else {
    const color = ACCENT_COLORS.find(c => c.id === id) ?? ACCENT_COLORS[0];
    applyAccent(color.brand);
  }
}

export function useAccentColor() {
  const { resolvedTheme } = useTheme();
  const [accentId, setAccentId] = useState<string>(
    () => settingsClient.getCached(STORAGE_KEY) ?? DEFAULT_ID
  );
  const [customHex, setCustomHex] = useState<string>(
    () => settingsClient.getCached(CUSTOM_COLOR_KEY) ?? '#f881a9'
  );

  useEffect(() => { initAccentColor(); }, [resolvedTheme]);

  function setAccent(id: string) {
    const color = ACCENT_COLORS.find(c => c.id === id) ?? ACCENT_COLORS[0];
    settingsClient.set(STORAGE_KEY, id);
    applyAccent(color.brand);
    setAccentId(id);
  }

  function setCustomAccent(hex: string) {
    settingsClient.set(CUSTOM_COLOR_KEY, hex);
    settingsClient.set(STORAGE_KEY, 'custom');
    applyAccent(hex);
    setCustomHex(hex);
    setAccentId('custom');
  }

  return { accentId, setAccent, customHex, setCustomAccent };
}
