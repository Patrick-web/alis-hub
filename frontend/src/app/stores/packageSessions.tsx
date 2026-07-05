import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { TerminalSession, PackageTerminalPaneHandle } from '../components/PackageTerminalPane';
import { useNotifications } from './notifications';
import { completeTaskNotification } from '../lib/taskNotify';
import { useLabs } from './labs';
import { useSuggestions } from './suggestions';
import { useLocalAI } from './localai';
import * as PackageService from '../../../bindings/alis-hub-v3/packageservice';
import * as LocalAIService from '../../../bindings/alis-hub-v3/localaiservice';

interface PackageSessionsContextValue {
  sessions: TerminalSession[];
  paneRef: RefObject<PackageTerminalPaneHandle>;
  addSessions: (newSessions: TerminalSession[]) => void;
  updateSession: (runID: string, patch: Partial<TerminalSession>) => void;
  closeSession: (runID: string) => void;
  clearSessions: () => void;
  setTaskId: (id: string | null) => void;
  onCloseSession: (runID: string) => void;
  onInput: (runID: string, data: string) => void;
  onResize: (runID: string, cols: number, rows: number) => void;
}

const PackageSessionsContext = createContext<PackageSessionsContextValue | null>(null);

export function PackageSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const paneRef = useRef<PackageTerminalPaneHandle>(null);
  const pkgOffsetRefs = useRef<Record<string, number>>({});
  const taskIdRef = useRef<string | null>(null);
  const { updateNotification } = useNotifications();
  const { isSuggestionEnabled } = useLabs();
  const { addSuggestion } = useSuggestions();
  const { state: localAIState } = useLocalAI();

  // Polling loop — stays alive regardless of which page is mounted
  useEffect(() => {
    const running = sessions.filter(s => !s.done && !s.error);
    if (running.length === 0) return;
    const interval = setInterval(async () => {
      for (const session of running) {
        try {
          const chunk = await PackageService.PollPackageRun(
            session.runID,
            pkgOffsetRefs.current[session.runID] ?? 0
          );
          if (!chunk) continue;
          if (chunk.content) paneRef.current?.write(session.runID, chunk.content);
          pkgOffsetRefs.current[session.runID] = chunk.nextOffset;
          if (chunk.done || chunk.error) {
            setSessions(prev =>
              prev.map(s =>
                s.runID === session.runID
                  ? { ...s, done: chunk.done, error: chunk.error || undefined }
                  : s
              )
            );
          }
        } catch {
          // ignore individual poll errors
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [sessions]);

  const addSessions = useCallback((newSessions: TerminalSession[]) => {
    newSessions.forEach(s => { pkgOffsetRefs.current[s.runID] = 0; });
    setSessions(prev => [...prev, ...newSessions]);
  }, []);

  const updateSession = useCallback((runID: string, patch: Partial<TerminalSession>) => {
    setSessions(prev => prev.map(s => s.runID === runID ? { ...s, ...patch } : s));
  }, []);

  const closeSession = useCallback((runID: string) => {
    setSessions(prev => prev.filter(s => s.runID !== runID));
  }, []);

  const clearSessions = useCallback(() => {
    setSessions([]);
  }, []);

  const onCloseSession = useCallback((runID: string) => {
    PackageService.CancelPackageRun(runID).catch(() => {});
    closeSession(runID);
  }, [closeSession]);

  const onInput = useCallback((runID: string, data: string) => {
    PackageService.WritePackageInput(runID, data).catch(() => {});
  }, []);

  const onResize = useCallback((runID: string, cols: number, rows: number) => {
    PackageService.ResizePackageTerminal(runID, cols, rows).catch(() => {});
  }, []);

  const setTaskId = useCallback((id: string | null) => {
    taskIdRef.current = id;
  }, []);

  // Update the status-strip notification when all sessions finish (runs even when off the Develop page)
  useEffect(() => {
    if (sessions.length === 0 || !taskIdRef.current) return;
    const allDone = sessions.every(s => s.done || s.error);
    if (!allDone) return;
    const hasErrors = sessions.some(s => s.error);
    completeTaskNotification(updateNotification, {
      id: taskIdRef.current,
      severity: hasErrors ? 'error' : 'success',
      title: hasErrors ? 'Packages failed' : 'Packages complete',
      body: sessions.map(s => s.title).join(', '),
      taskStatus: hasErrors ? 'error' : 'done',
    });
    if (!hasErrors && isSuggestionEnabled('build-success-deploy')) {
      addSuggestion({
        definitionId: 'build-success-deploy',
        category: 'Build & Deploy',
        title: 'Ready to deploy?',
        body: 'All packages built successfully.',
        priority: 'passive',
      });
    }
    if (!hasErrors && isSuggestionEnabled('packages-installed-commit')) {
      addSuggestion({
        definitionId: 'packages-installed-commit',
        category: 'Build & Deploy',
        title: 'Commit package changes?',
        body: 'Packages installed successfully. Stage and commit the updated files.',
        priority: 'passive',
      });
    }
    if (hasErrors && isSuggestionEnabled('build-failure-verbose')) {
      addSuggestion({
        definitionId: 'build-failure-verbose',
        category: 'Build & Deploy',
        title: 'Build failed',
        body: 'Re-run with verbose output to see more detail.',
        priority: 'passive',
      });
    }
    // AI contextual suggestion (fire-and-forget)
    if (localAIState.enabled && localAIState.modelPulled && isSuggestionEnabled('ai-contextual-insight')) {
      const outcome = hasErrors ? 'failed with errors' : 'completed successfully';
      LocalAIService.Generate(
        localAIState.model,
        'You are a helpful development assistant. Given a development event, suggest one concise actionable next step in 1-2 sentences. Be specific and practical.',
        `A package build just ${outcome}.`,
      ).then(body => {
        if (body) addSuggestion({ definitionId: 'ai-contextual-insight', category: 'AI Insights', title: 'AI suggestion', body, priority: 'passive' });
      }).catch(() => {});
    }
    taskIdRef.current = null;
  }, [sessions, updateNotification, isSuggestionEnabled, addSuggestion, localAIState]);

  return (
    <PackageSessionsContext.Provider
      value={{
        sessions,
        paneRef,
        addSessions,
        updateSession,
        closeSession,
        clearSessions,
        setTaskId,
        onCloseSession,
        onInput,
        onResize,
      }}
    >
      {children}
    </PackageSessionsContext.Provider>
  );
}

export function usePackageSessions() {
  const ctx = useContext(PackageSessionsContext);
  if (!ctx) throw new Error('usePackageSessions must be used within PackageSessionsProvider');
  return ctx;
}
