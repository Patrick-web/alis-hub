import { Window } from '@wailsio/runtime';

// Mirrors the Wails runtime's own drag-eligibility check (see @wailsio/runtime/dist/drag.js)
// so double-click-to-maximize only fires on the actual draggable title bar area, not on
// buttons/tabs/etc. that sit inside it with --wails-draggable: no-drag.
export function handleTitleBarDoubleClick(event: React.MouseEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  const draggable = window.getComputedStyle(target).getPropertyValue('--wails-draggable').trim();
  if (draggable === 'drag') {
    Window.ToggleMaximise();
  }
}
