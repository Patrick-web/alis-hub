import { useRef, useCallback, useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { useDevelopTabs } from '../../stores/developTabs';
import { useNotifications } from '../../stores/notifications';
import { DefinePane } from './DefinePane';
import { BuildPane } from './BuildPane';
import { DeployPane } from './DeployPane';
import { PackagesPane } from './PackagesPane';
import type { TaskType } from '../../stores/notifications';

const MIN_WIDTH = 320;
const MAX_WIDTH = 1200;
const DEFAULT_WIDTH = 400;

const TYPE_ICONS: Record<TaskType, string> = {
  define: 'solar:document-text-linear',
  build: 'solar:code-linear',
  deploy: 'solar:cloud-upload-linear',
  packages: 'solar:box-linear',
};

const TYPE_LABELS: Record<TaskType, string> = {
  define: 'Define',
  build: 'Build',
  deploy: 'Deploy',
  packages: 'Packages',
};

export function DevelopTaskPanel() {
  const { tabs, activeTabId, closeTab, activateTab } = useDevelopTabs();
  const { state: notifState } = useNotifications();

  const [paneWidth, setPaneWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = paneWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [paneWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setPaneWidth(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (tabs.length === 0) return null;

  function tabStatus(notifId?: string) {
    if (!notifId) return 'idle';
    const n = notifState.notifications.find(n => n.id === notifId);
    if (!n?.task) return 'idle';
    if (n.task.status === 'running') return 'running';
    if (n.task.status === 'error') return 'error';
    return 'done';
  }

  return (
    <div
      className="border-l border-border flex flex-col overflow-hidden shrink-0 relative bg-background h-full"
      style={{ width: paneWidth }}
    >
      {/* Left drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 bottom-0 w-[4px] cursor-col-resize z-10 group"
      >
        <div className="absolute inset-y-0 left-0 w-[1px] bg-border group-hover:bg-brand/50 transition-colors" />
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-[2px] px-[8px] border-b border-border shrink-0 h-[36px] overflow-x-auto">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const status = tabStatus(tab.notificationId);
          return (
            <button
              key={tab.id}
              onClick={() => activateTab(tab.id)}
              className={`flex items-center gap-[6px] px-[8px] h-[26px] rounded-[4px] shrink-0 max-w-[180px] transition-colors group/tab ${
                isActive
                  ? 'bg-card border border-border text-foreground'
                  : 'text-foreground/40 hover:text-foreground/70 hover:bg-accent/30'
              }`}
            >
              <Icon icon={TYPE_ICONS[tab.type]} className="text-[11px] shrink-0" />
              <span className="text-[10px] font-mono truncate min-w-0">{tab.neuron}</span>
              {/* Status dot */}
              {status === 'running' && (
                <span className="size-[5px] rounded-full bg-brand animate-pulse shrink-0" />
              )}
              {status === 'done' && (
                <span className="size-[5px] rounded-full bg-green-400 shrink-0" />
              )}
              {status === 'error' && (
                <span className="size-[5px] rounded-full bg-red-400 shrink-0" />
              )}
              {/* Close */}
              <button
                onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                className="size-[14px] flex items-center justify-center text-foreground/25 hover:text-foreground rounded-[2px] hover:bg-accent transition-colors opacity-0 group-hover/tab:opacity-100 shrink-0"
              >
                <Icon icon="solar:close-circle-linear" className="text-[10px]" />
              </button>
            </button>
          );
        })}
      </div>

      {/* Pane header */}
      {activeTabId && (() => {
        const tab = tabs.find(t => t.id === activeTabId);
        if (!tab) return null;
        return (
          <div className="px-[14px] py-[10px] border-b border-border flex items-center justify-between shrink-0">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] text-foreground/40 uppercase font-bold font-mono">{TYPE_LABELS[tab.type]}</p>
              <p className="text-[13px] font-bold text-foreground font-mono truncate">{tab.neuron}</p>
            </div>
            <button
              onClick={() => closeTab(tab.id)}
              className="size-[24px] flex items-center justify-center rounded-[3px] text-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
            >
              <Icon icon="solar:close-circle-linear" className="text-sm" />
            </button>
          </div>
        );
      })()}

      {/* Content — all panes mounted simultaneously for keep-alive */}
      <div className="flex-1 overflow-hidden min-h-0">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={tab.id === activeTabId ? 'flex flex-col h-full' : 'hidden'}
          >
            {tab.type === 'define' && (
              <DefinePane tabId={tab.id} neuron={tab.neuron} restore={tab.restore} />
            )}
            {tab.type === 'build' && (
              <BuildPane tabId={tab.id} neuron={tab.neuron} restore={tab.restore} />
            )}
            {tab.type === 'deploy' && (
              <DeployPane tabId={tab.id} neuron={tab.neuron} restore={tab.restore} />
            )}
            {tab.type === 'packages' && (
              <PackagesPane tabId={tab.id} neuron={tab.neuron} neuronNames={tab.neuron.split(',')} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
