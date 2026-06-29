import React, { useState, useEffect } from 'react';
import { Window, Events } from '@wailsio/runtime';

export function MacWindowControls() {
  return (
    <div className="flex items-center gap-[6px]" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => Window.Close()}
        className="w-[12px] h-[12px] rounded-full bg-destructive hover:bg-destructive transition-colors shrink-0 focus:outline-none"
        title="Close"
      />
      <button
        onClick={() => Window.Minimise()}
        className="w-[12px] h-[12px] rounded-full bg-warning hover:bg-warning transition-colors shrink-0 focus:outline-none"
        title="Minimise"
      />
      <button
        onClick={() => Window.ToggleMaximise()}
        className="w-[12px] h-[12px] rounded-full bg-success hover:bg-success transition-colors shrink-0 focus:outline-none"
        title="Maximise"
      />
    </div>
  );
}

const MinimizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <line x1="0" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

const MaximizeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

const RestoreIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <rect x="2.5" y="0.5" width="7" height="7" stroke="currentColor" strokeWidth="1.1" />
    <path d="M0.5 2.5H2V9.5H9V8" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

export function WindowsWindowControls() {
  const [isMaximised, setIsMaximised] = useState(false);

  useEffect(() => {
    Window.IsMaximised().then(setIsMaximised);
    const offMax = Events.On('common:WindowMaximise', () => setIsMaximised(true));
    const offUnmax = Events.On('common:WindowUnMaximise', () => setIsMaximised(false));
    return () => { offMax(); offUnmax(); };
  }, []);

  return (
    <div
      className="flex items-stretch h-full ml-[4px]"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button
        onClick={() => Window.Minimise()}
        className="flex items-center justify-center w-[46px] h-full text-foreground/70 hover:text-foreground hover:bg-foreground/[0.07] transition-colors focus:outline-none"
        title="Minimise"
      >
        <MinimizeIcon />
      </button>
      <button
        onClick={() => Window.ToggleMaximise()}
        className="flex items-center justify-center w-[46px] h-full text-foreground/70 hover:text-foreground hover:bg-foreground/[0.07] transition-colors focus:outline-none"
        title={isMaximised ? 'Restore' : 'Maximise'}
      >
        {isMaximised ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        onClick={() => Window.Close()}
        className="flex items-center justify-center w-[46px] h-full text-foreground/70 hover:text-white hover:bg-[#c42b1c] transition-colors focus:outline-none"
        title="Close"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
