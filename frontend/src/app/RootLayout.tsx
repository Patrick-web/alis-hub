import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { TopNav } from './components/TopNav';
import { StandaloneTopNav } from './components/StandaloneTopNav';
import { Sidebar } from './components/Sidebar';
import { StatusStrip } from './components/StatusStrip';
import { SuggestionsBubble } from './components/SuggestionsBubble';
import { PackageTerminalPane } from './components/PackageTerminalPane';
import { DevelopTaskPanel } from './components/develop/DevelopTaskPanel';
import { DevelopTabsProvider } from './stores/developTabs';
import { LoginPage } from './pages/LoginPage';
import { HubPage } from './pages/HubPage';
import { LandingZonesPage } from './pages/LandingZonesPage';
import { ProductPickerPage } from './pages/ProductPickerPage';
import { ReloginModal } from './components/ReloginModal';
import { useWorkspace, type AppPhase } from './stores/workspace';
import { usePackageSessions } from './stores/packageSessions';
import { initAccentColor } from './stores/accent';
import * as ProductService from '../../bindings/alis-hub-v3/productservice';
import { Loader } from './components/Loader';

const AUTH_POLL_MS = 5 * 60 * 1000; // 5 minutes

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, setPhase } = useWorkspace();
  const { sessions, paneRef, onCloseSession, clearSessions, onInput, onResize } = usePackageSessions();
  const isOnDevelop = location.pathname === '/develop';
  const [sessionExpired, setSessionExpired] = useState(false);
  const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { initAccentColor(); }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyN') {
        e.preventDefault();
        navigate('/debug/notifications');
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  // On mount: check login status, then route to appropriate phase.
  // DEV: ?phase=picking-org overrides for browser testing without Wails bridge.
  useEffect(() => {
    const devPhase = new URLSearchParams(window.location.search).get('phase') as AppPhase | null;
    if (devPhase) { setPhase(devPhase); return; }
    (ProductService.IsLoggedIn as () => Promise<boolean>)()
      .then(loggedIn => setPhase(loggedIn ? 'hub' : 'login'))
      .catch(() => setPhase('login'));
  }, []);

  // Poll auth validity once the user is past the login screen.
  // Also re-check when the window regains focus (e.g. after the laptop sleeps).
  useEffect(() => {
    const unauthPhases: AppPhase[] = ['init', 'login'];
    if (unauthPhases.includes(state.phase)) return;

    async function checkAuth() {
      try {
        const ok = await (ProductService.CheckAuth as () => Promise<boolean>)();
        if (!ok) setSessionExpired(true);
      } catch {
        setSessionExpired(true);
      }
    }

    authPollRef.current = setInterval(checkAuth, AUTH_POLL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') checkAuth();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (authPollRef.current) clearInterval(authPollRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [state.phase]);

  // Pre-workspace phases render fullscreen without nav chrome
  if (state.phase === 'init') {
    return (
      <div className="bg-background flex items-center justify-center h-screen w-full">
        <Loader />
      </div>
    );
  }

  if (state.phase === 'login') {
    return (
      <div className="bg-background flex flex-col h-screen w-full">
        <LoginPage />
      </div>
    );
  }

  const reloginModal = sessionExpired
    ? <ReloginModal onSuccess={() => setSessionExpired(false)} />
    : null;

  if (state.phase === 'hub') {
    return <>{<HubPage />}{reloginModal}</>;
  }

  if (state.phase === 'picking-org') {
    return (
      <div className="bg-background flex flex-col h-screen w-full overflow-hidden">
        <LandingZonesPage />
        {reloginModal}
      </div>
    );
  }

  if (state.phase === 'picking-product') {
    return (
      <div className="bg-background flex flex-col h-screen w-full overflow-hidden">
        <ProductPickerPage />
        {reloginModal}
      </div>
    );
  }

  const path = location.pathname;
  const codeblockListPaths = new Set(['/codeblocks', '/codeblocks/mine', '/codeblocks/starred']);
  const showSidebar = codeblockListPaths.has(path);

  // Standalone phase — slim 4-shortcut nav, no product required
  if (state.phase === 'standalone') {
    return (
      <div className="bg-background flex flex-col h-screen w-full overflow-hidden">
        <StandaloneTopNav />
        <div className="flex flex-1 overflow-hidden">
          {showSidebar && <Sidebar />}
          <Outlet />
        </div>
        <SuggestionsBubble />
        <StatusStrip />
        {reloginModal}
      </div>
    );
  }

  // Workspace phase — full nav chrome + sidebar + tab content
  const workspaceSidebar =
    path === '/environments' ||
    path === '/builds' ||
    showSidebar;

  return (
    <DevelopTabsProvider>
      <div className="bg-background flex flex-col h-screen w-full overflow-hidden">
        <TopNav />
        <div className="flex flex-1 overflow-hidden flex-col">
          <div className="flex flex-1 overflow-hidden">
            {workspaceSidebar && <Sidebar />}
            <Outlet key={`${state.organisation}/${state.product}`} />
            {/* Develop task panel — keep-alive at layout level so tabs persist across navigation */}
            <div style={{ display: isOnDevelop ? undefined : 'none' }}>
              <DevelopTaskPanel />
            </div>
          </div>
          {/* Package terminal pane — kept mounted here to preserve PTY across navigation */}
          {sessions.length > 0 && (
            <div
              style={{ display: isOnDevelop ? undefined : 'none', height: '280px', flexShrink: 0 }}
            >
              <PackageTerminalPane
                ref={paneRef}
                sessions={sessions}
                onCloseSession={onCloseSession}
                onClose={clearSessions}
                onInput={onInput}
                onResize={onResize}
              />
            </div>
          )}
        </div>
        <SuggestionsBubble />
        <StatusStrip />
        {reloginModal}
      </div>
    </DevelopTabsProvider>
  );
}
