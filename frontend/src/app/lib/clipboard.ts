import { Clipboard } from '@wailsio/runtime';

/**
 * Copies text to the clipboard, preferring the Wails runtime clipboard which
 * works inside the webview where navigator.clipboard is often blocked
 * (NotAllowedError). Falls back to navigator.clipboard when available.
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await Clipboard.SetText(text);
    return;
  } catch {
    // fall through to the browser API
  }
  await navigator.clipboard.writeText(text);
}
