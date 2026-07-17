import { useRef, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@iconify/react';
import { useDevelopTabs } from '../../stores/developTabs';
import { useNotifications } from '../../stores/notifications';
import { TabBar } from '../ui/TabBar';
import { DefinePane } from './DefinePane';
import { BuildPane } from './BuildPane';
import { DeployPane } from './DeployPane';
import { PackagesPane } from './PackagesPane';
import { useKeyboardShortcuts } from '../../lib/keyboardShortcuts';
import type { TaskType } from '../../stores/notifications';

const MIN_WIDTH = 320;
const MAX_WIDTH = 1200;
const DEFAULT_WIDTH = 400;

// 'workflow' tasks never open a Develop tab (they live on the Workflows page),
// but these maps are keyed on the full TaskType union so TS stays exhaustive.
const TYPE_ICONS: Record<TaskType, string> = {
  define: 'solar:document-text-linear',
  build: 'solar:code-linear',
  deploy: 'solar:cloud-upload-linear',
  packages: 'solar:box-linear',
  workflow: 'solar:playlist-2-linear',
};

const TYPE_LABELS: Record<TaskType, string> = {
  define: 'Define',
  build: 'Build',
  deploy: 'Deploy',
  packages: 'Packages',
  workflow: 'Workflow',
};

function StatusDot({ status }: { status: string }): ReactNode {
  if (status === 'running') return <span className="size-[5px] rounded-full bg-brand-fill animate-pulse shrink-0" />;
  if (status === 'done') return <span className="size-[5px] rounded-full bg-green-400 shrink-0" />;
  if (status === 'error') return <span className="size-[5px] rounded-full bg-red-400 shrink-0" />;
  return null;
}

export function DevelopTaskPanel() {
  const { tabs, activeTabId, closeTab, closeMultiple, activateTab } = useDevelopTabs();
  const { state: notifState, dismiss } = useNotifications();

  function handleCloseTab(id: string) {
    const tab = tabs.find(t => t.id === id);
    closeTab(id);
    if (tab?.notificationId) dismiss(tab.notificationId);
  }

  function handleCloseMultiple(ids: string[]) {
    const notifIds = tabs
      .filter(t => ids.includes(t.id) && t.notificationId)
      .map(t => t.notificationId!);
    closeMultiple(ids);
    notifIds.forEach(dismiss);
  }

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const activateTabRef = useRef(activateTab);
  activateTabRef.current = activateTab;
  const closeTabRef = useRef(closeTab);
  closeTabRef.current = closeTab;
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useKeyboardShortcuts([
    ...([1, 2, 3, 4] as const).map(n => ({
      id: `develop-tab-${n}`,
      keys: `Ctrl+${n}`,
      description: `Switch to tab ${n}`,
      group: 'Develop',
      scope: '/develop',
      handler: () => {
        const current = tabsRef.current;
        if (current.length >= n) activateTabRef.current(current[n - 1].id);
      },
    })),
    {
      id: 'develop-close-tab',
      keys: 'Ctrl+W',
      description: 'Close active tab',
      group: 'Develop',
      scope: '/develop',
      handler: () => {
        const id = activeTabIdRef.current;
        if (!id) return;
        const tab = tabsRef.current.find(t => t.id === id);
        closeTabRef.current(id);
        if (tab?.notificationId) dismissRef.current(tab.notificationId);
      },
    },
  ], []);

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
        <div className="absolute inset-y-0 left-0 w-[1px] bg-border group-hover:bg-brand-fill/50 transition-colors" />
      </div>

      {/* Tab bar */}
      <TabBar
        items={tabs.map(tab => ({
          id: tab.id,
          label: tab.neuron,
          icon: <Icon icon={TYPE_ICONS[tab.type]} className="text-[11px] shrink-0" />,
          statusSlot: <StatusDot status={tabStatus(tab.notificationId)} />,
        }))}
        activeId={activeTabId ?? ''}
        onActivate={activateTab}
        onClose={handleCloseTab}
        onCloseMultiple={handleCloseMultiple}
        variant="filled"
        size="md"
      />

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
              onClick={() => handleCloseTab(tab.id)}
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
