import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { useNotifications } from '../stores/notifications';
import type { TaskType, TaskStatus } from '../stores/notifications';
import { useLocalAI } from '../stores/localai';
import { NotificationCenter } from './NotificationCenter';
import { HoverCard, HoverCardTrigger, HoverCardContent } from './ui/hover-card';

const TASK_ICON: Record<TaskType, string> = {
  define: 'solar:magic-stick-linear',
  build: 'solar:box-linear',
  deploy: 'solar:cloud-upload-linear',
  packages: 'solar:folder-with-files-linear',
};

const TASK_LABEL: Record<TaskType, string> = {
  define: 'Define',
  build: 'Build',
  deploy: 'Deploy',
  packages: 'Packages',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  running: 'Running',
  done: 'Done',
  error: 'Failed',
};

function formatElapsed(startedAt: number): string {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  if (s < 60) return `0:${String(s).padStart(2, '0')}`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}:${String(rem).padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function StatusStrip() {
  const { state, dismiss, setFocusTaskId } = useNotifications();
  const { state: localAIState } = useLocalAI();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);

  const taskNotifs = state.notifications.filter(n => n.task);
  const hasRunning = taskNotifs.some(n => n.task?.status === 'running');
  const aiGenerating = localAIState.activeRequests > 0;
  const hasContent = taskNotifs.length > 0 || aiGenerating;

  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  function handleChipClick(notifId: string) {
    setFocusTaskId(notifId);
    navigate('/develop');
  }

  return (
    <div
      className="shrink-0 flex items-center border-t border-border bg-background"
      style={{ height: hasContent ? '36px' : '22px' }}
    >
      {/* Task chips */}
      <div className="flex items-center gap-[4px] px-[8px] flex-1 min-w-0 overflow-x-auto">
        {aiGenerating && (
          <HoverCard openDelay={300}>
            <HoverCardTrigger asChild>
              <div className="flex items-center gap-[5px] pl-[7px] pr-[7px] h-[22px] rounded-[3px] border border-purple-500/20 bg-purple-500/[0.08] shrink-0">
                <span className="w-[5px] h-[5px] rounded-full bg-purple-400 animate-pulse shrink-0" />
                <Icon icon="solar:cpu-bolt-linear" className="text-[10px] text-purple-300/80 shrink-0" />
                <span className="text-[9px] font-mono text-purple-300/80">Local AI</span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent side="top" align="start" className="w-64 font-mono text-[11px] space-y-1.5">
              <p className="font-bold text-foreground flex items-center gap-[6px]">
                <Icon icon="solar:cpu-bolt-linear" className="text-[11px] text-purple-300/80 shrink-0" />
                Local AI generating
              </p>
              <p className="text-foreground/50">
                Generating a response — this can use significant RAM/CPU.
              </p>
            </HoverCardContent>
          </HoverCard>
        )}
        {taskNotifs.map(n => {
          const task = n.task!;
          const isRunning = task.status === 'running';
          const isDone = task.status === 'done';
          return (
            <HoverCard key={n.id} openDelay={300}>
              <HoverCardTrigger asChild>
                <div className="flex items-center gap-[5px] pl-[7px] pr-[4px] h-[22px] rounded-[3px] border border-border bg-muted shrink-0 group/chip">
                  {/* Status indicator */}
                  {isRunning ? (
                    <span className="w-[5px] h-[5px] rounded-full bg-brand animate-pulse shrink-0" />
                  ) : isDone ? (
                    <Icon icon="solar:check-circle-bold" className="text-[10px] text-green-400 shrink-0" />
                  ) : (
                    <Icon icon="solar:close-circle-bold" className="text-[10px] text-red-400 shrink-0" />
                  )}

                  {/* Clickable label area */}
                  <button
                    onClick={() => handleChipClick(n.id)}
                    className="flex items-center gap-[4px] focus:outline-none"
                  >
                    <Icon
                      icon={TASK_ICON[task.type]}
                      className="text-[10px] text-foreground/40 shrink-0"
                    />
                    <span className="text-[9px] font-mono text-foreground/70 truncate max-w-[120px]">
                      {n.body || TASK_LABEL[task.type]}
                    </span>
                    {isRunning && (
                      <span className="text-[9px] font-mono text-foreground/30 shrink-0">
                        {/* tick is used to re-render elapsed time */}
                        {formatElapsed(task.startedAt)}
                        {tick > -1 ? '' : ''}
                      </span>
                    )}
                  </button>

                  {/* Dismiss */}
                  <button
                    onClick={() => dismiss(n.id)}
                    className="w-[14px] h-[14px] flex items-center justify-center rounded-[2px] text-foreground/20 hover:text-foreground hover:bg-accent transition-colors shrink-0 opacity-0 group-hover/chip:opacity-100"
                    title="Dismiss"
                  >
                    <Icon icon="solar:close-circle-linear" className="text-[9px]" />
                  </button>
                </div>
              </HoverCardTrigger>
              <HoverCardContent side="top" align="start" className="w-72 font-mono text-[11px] space-y-1.5">
                <p className="font-bold text-foreground flex items-center gap-[6px]">
                  <Icon icon={TASK_ICON[task.type]} className="text-[11px] text-foreground/50 shrink-0" />
                  {TASK_LABEL[task.type]} · {task.neuronId}
                </p>
                <p className="text-foreground/60 truncate">{task.step || n.body}</p>
                <p className="text-foreground/40">
                  {isRunning ? `Running · ${formatElapsed(task.startedAt)}` : STATUS_LABEL[task.status]}
                </p>
                {task.logBuffer.length > 0 && (
                  <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all text-[10px] text-foreground/50 bg-muted rounded-[3px] p-[6px]">
                    {task.logBuffer.slice(-5).join('\n')}
                  </pre>
                )}
              </HoverCardContent>
            </HoverCard>
          );
        })}
      </div>

      {/* Right section */}
      <div className="shrink-0 flex items-center h-full">
        <NotificationCenter />
      </div>
    </div>
  );
}
