import { useState, useEffect } from 'react';
import * as settingsClient from '../lib/settingsClient';

export interface AccentColor {
  id: string;
  label: string;
  brand: string;
  brandFg: string;
}

export const ACCENT_COLORS: AccentColor[] = [
  { id: 'pink',   label: 'Pink',   brand: '#f881a9', brandFg: '#6f0025' },
  { id: 'blue',   label: 'Blue',   brand: '#3b82f6', brandFg: '#1e3a8a' },
  { id: 'purple', label: 'Purple', brand: '#bf5af2', brandFg: '#4a0072' },
  { id: 'green',  label: 'Green',  brand: '#34c759', brandFg: '#14532d' },
  { id: 'orange', label: 'Orange', brand: '#ff9f0a', brandFg: '#7c2d12' },
  { id: 'red',    label: 'Red',    brand: '#ff3b30', brandFg: '#800000' },
  { id: 'teal',   label: 'Teal',   brand: '#5ac8fa', brandFg: '#0c4a6e' },
];

const STORAGE_KEY = 'alis-hub-accent';
const CUSTOM_COLOR_KEY = 'alis-hub-accent-custom';
const DEFAULT_ID = 'pink';

function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1a1a1a' : '#ffffff';
}

function applyAccent(brand: string, brandFg: string) {
  document.documentElement.style.setProperty('--brand', brand);
  document.documentElement.style.setProperty('--brand-foreground', brandFg);
  document.documentElement.style.setProperty('--ring', brand);
}

export function initAccentColor() {
  const id = settingsClient.getCached(STORAGE_KEY) ?? DEFAULT_ID;
  if (id === 'custom') {
    const hex = settingsClient.getCached(CUSTOM_COLOR_KEY) ?? '#f881a9';
    applyAccent(hex, contrastColor(hex));
  } else {
    const color = ACCENT_COLORS.find(c => c.id === id) ?? ACCENT_COLORS[0];
    applyAccent(color.brand, color.brandFg);
  }
}

export function useAccentColor() {
  const [accentId, setAccentId] = useState<string>(
    () => settingsClient.getCached(STORAGE_KEY) ?? DEFAULT_ID
  );
  const [customHex, setCustomHex] = useState<string>(
    () => settingsClient.getCached(CUSTOM_COLOR_KEY) ?? '#f881a9'
  );

  useEffect(() => { initAccentColor(); }, []);

  function setAccent(id: string) {
    const color = ACCENT_COLORS.find(c => c.id === id) ?? ACCENT_COLORS[0];
    settingsClient.set(STORAGE_KEY, id);
    applyAccent(color.brand, color.brandFg);
    setAccentId(id);
  }

  function setCustomAccent(hex: string) {
    const fg = contrastColor(hex);
    settingsClient.set(CUSTOM_COLOR_KEY, hex);
    settingsClient.set(STORAGE_KEY, 'custom');
    applyAccent(hex, fg);
    setCustomHex(hex);
    setAccentId('custom');
  }

  return { accentId, setAccent, customHex, setCustomAccent };
}
