export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4; break;
  }
  return [h * 60, s * 100, l * 100];
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  if (s === 0) {
    const v = l * 255;
    return rgbToHex(v, v, v);
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToRgb = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const hk = h / 360;
  const r = hueToRgb(hk + 1 / 3) * 255;
  const g = hueToRgb(hk) * 255;
  const b = hueToRgb(hk - 1 / 3) * 255;
  return rgbToHex(r, g, b);
}

function channelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (gamma-corrected), 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

/** WCAG contrast ratio between two colors, 1 (no contrast) to 21 (black/white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Best of near-black/near-white text color to sit on top of `bgHex`. */
export function getAccessibleForeground(bgHex: string): string {
  const black = '#1a1a1a';
  const white = '#ffffff';
  return contrastRatio(bgHex, black) >= contrastRatio(bgHex, white) ? black : white;
}

/**
 * Derives a variant of `hueHex` (same hue/saturation, adjusted lightness) that reaches
 * `targetRatio` contrast against `pageBackgroundHex` — for using an accent color as text/icon
 * color directly on the page background, rather than on top of a solid accent fill.
 */
export function getAccessibleTextColor(
  hueHex: string,
  pageBackgroundHex: string,
  targetRatio = 4.5
): string {
  const [h, s, startL] = hexToHsl(hueHex);
  const bgLuminance = relativeLuminance(pageBackgroundHex);
  // Light page background -> darken the hue; dark page background -> lighten it.
  const darkening = bgLuminance >= 0.5;
  const nearExtreme = hslToHex(h, s, darkening ? 0 : 100);

  if (contrastRatio(nearExtreme, pageBackgroundHex) < targetRatio) {
    // Even the most extreme lightness can't hit the target; it's the best we can do.
    return nearExtreme;
  }

  let lo = darkening ? 0 : startL;
  let hi = darkening ? startL : 100;
  let best = nearExtreme;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const candidate = hslToHex(h, s, mid);
    const ratio = contrastRatio(candidate, pageBackgroundHex);
    if (ratio >= targetRatio) {
      best = candidate;
      if (darkening) lo = mid; else hi = mid;
    } else {
      if (darkening) hi = mid; else lo = mid;
    }
  }
  return best;
}
