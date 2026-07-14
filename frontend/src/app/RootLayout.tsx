import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useTheme } from 'next-themes';
import { TopNav } from './components/TopNav';
import { StandaloneTopNav } from './components/StandaloneTopNav';
import { Sidebar } from './components/Sidebar';
import { StatusStrip } from './components/StatusStrip';
import { SuggestionsBubble } from './components/SuggestionsBubble';
import { PackageTerminalPane } from './components/PackageTerminalPane';
import { DevelopTaskPanel } from './components/develop/DevelopTaskPanel';
import { ToolsPanel } from './pages/ToolsPage';
import { LoginPage } from './pages/LoginPage';
import { HubPage } from './pages/HubPage';
import { LandingZonesPage } from './pages/LandingZonesPage';
import { ProductPickerPage } from './pages/ProductPickerPage';
import { ReloginModal } from './components/ReloginModal';
import { CommandPalette } from './components/CommandPalette';
import { DevSettingsModal } from './components/DevSettingsModal';
import { DeepLinkHandler } from './components/DeepLinkHandler';
import { DevelopCommandsExtension } from './components/command-palette/DevelopCommandsExtension';
import { GCloudCommandsExtension } from './components/command-palette/GCloudCommandsExtension';
import { useCommandPalette } from './stores/commandPalette';
import { useDevSettingsModal } from './stores/devSettingsModal';
import { Events } from '@wailsio/runtime';
import { useWorkspace, type AppPhase } from './stores/workspace';
import { usePackageSessions } from './stores/packageSessions';
import { initAccentColor } from './stores/accent';
import { useUserProfile } from './stores/userProfile';
import { useSourceControl } from './stores/sourceControl';
import * as ProductService from '../../bindings/alis-hub-v3/productservice';
import * as GitService from '../../bindings/alis-hub-v3/gitservice';
import { Loader } from './components/Loader';

const AUTH_POLL_MS = 5 * 60 * 1000; // 5 minutes

export function RootLayout() {
  const location = useLocation();
  const { resolvedTheme } = useTheme();
  const { state, setPhase } = useWorkspace();
  const { sessions, paneRef, onCloseSession, clearSessions, onInput, onResize } = usePackageSessions();
  const { fetchProfile } = useUserProfile();
  const isOnDevelop = location.pathname === '/develop';
  const isOnTools = location.pathname === '/tools';
  const [sessionExpired, setSessionExpired] = useState(false);
  const { toggle } = useCommandPalette();
  const { toggle: toggleDevSettings } = useDevSettingsModal();
  const { state: scState } = useSourceControl();
  const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [repoPaths, setRepoPaths] = useState<{ buildDir: string; defineDir: string } | null>(null);

  useEffect(() => { initAccentColor(); }, [resolvedTheme]);

  useEffect(() => {
    const unauthPhases: AppPhase[] = ['init', 'login'];
    if (!unauthPhases.includes(state.phase)) fetchProfile();
  }, [state.phase]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
        e.preventDefault();
        toggleDevSettings();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggleDevSettings]);

  useEffect(() => {
    const off = Events.On('menu:command-palette', () => toggle());
    return () => off();
  }, [toggle]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

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
  // Also listen for auth:expired events emitted by the backend (e.g. on push/pull failure).
  useEffect(() => {
    const unauthPhases: AppPhase[] = ['init', 'login'];
    if (unauthPhases.includes(state.phase)) return;

    // CheckAuth resolves to a definitive boolean (the Go side never errors, it
    // catches internally). So a *thrown* promise means the Wails RPC transport
    // failed — typically the webview bridge not being ready when the window
    // regains focus after the laptop sleeps — not that the session expired.
    // Retry transient transport failures with backoff and only surface the
    // re-login modal on a definitive false, so we don't flash a spurious
    // "session expired" on resume while the token is actually still valid.
    async function checkAuth() {
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const ok = await (ProductService.CheckAuth as () => Promise<boolean>)();
          // Clear a previously-set expiry on a definitive success too — a
          // one-off auth_error from a background git fetch (network blip,
          // misclassified remote error, etc.) may have already flipped
          // sessionExpired to true. Without this, that flag is a one-way
          // latch: only a full manual re-login clears it, so the modal would
          // keep showing indefinitely even though the session is actually
          // fine, as confirmed by this very poll.
          setSessionExpired(!ok);
          return;
        } catch {
          if (attempt < MAX_ATTEMPTS) {
            await new Promise(r => setTimeout(r, attempt * 500));
            continue;
          }
          // RPC still failing after retries: fall back to the cheap on-disk
          // credentials check. Only prompt re-login if credentials are truly
          // gone; otherwise assume a transient bridge issue and leave the
          // session intact for the next poll/focus to re-verify.
          try {
            const loggedIn = await (ProductService.IsLoggedIn as () => Promise<boolean>)();
            if (!loggedIn) setSessionExpired(true);
          } catch {
            // Bridge unavailable for both calls — do nothing; not evidence of expiry.
          }
        }
      }
    }

    authPollRef.current = setInterval(checkAuth, AUTH_POLL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') checkAuth();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Treat the backend event as a hint to re-verify, not as ground truth: it's
    // raised by any git op (including the periodic background fetch) on a
    // classified auth failure, which can be a transient network blip or a
    // remote error unrelated to the token. Routing it through the same
    // checkAuth() used for polling/focus means the re-login modal only shows
    // once CheckAuth itself — the authoritative, retry-hardened path —
    // confirms the session is actually dead.
    const offAuthExpired = Events.On('auth:expired', () => { checkAuth(); });

    return () => {
      if (authPollRef.current) clearInterval(authPollRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      offAuthExpired();
    };
  }, [state.phase]);

  // Resolve the current product's repo paths, independent of whether the
  // Source Control tab is mounted, so background fetch can run regardless
  // of which tab is active.
  useEffect(() => {
    if (!state.organisation || !state.product) { setRepoPaths(null); return; }
    GitService.GetProductRepoPaths(state.organisation, state.product)
      .then(paths => setRepoPaths(paths ? { buildDir: paths.buildDir, defineDir: paths.defineDir } : null))
      .catch(() => setRepoPaths(null));
  }, [state.organisation, state.product]);

  // Periodically fetch from origin so ahead/behind state is fresh even
  // without a manual pull, per the "Background Fetch" setting.
  useEffect(() => {
    const unauthPhases: AppPhase[] = ['init', 'login'];
    if (unauthPhases.includes(state.phase)) return;
    if (!repoPaths || scState.fetchIntervalMinutes <= 0) return;

    async function fetchAll() {
      if (!repoPaths) return;
      await Promise.all([
        GitService.FetchOrigin(repoPaths.buildDir).catch(() => {}),
        GitService.FetchOrigin(repoPaths.defineDir).catch(() => {}),
      ]);
    }

    fetchPollRef.current = setInterval(fetchAll, scState.fetchIntervalMinutes * 60 * 1000);
    return () => {
      if (fetchPollRef.current) clearInterval(fetchPollRef.current);
    };
  }, [state.phase, repoPaths, scState.fetchIntervalMinutes]);

  // Pre-workspace phases render fullscreen without nav chrome
  if (state.phase === 'init') {
    return (
      <div className="bg-background flex items-center justify-center h-screen w-full">
        <Loader />
        <DeepLinkHandler />
      </div>
    );
  }

  if (state.phase === 'login') {
    return (
      <div className="bg-background flex flex-col h-screen w-full">
        <LoginPage />
        <DeepLinkHandler />
      </div>
    );
  }

  const reloginModal = sessionExpired
    ? <ReloginModal onSuccess={() => setSessionExpired(false)} />
    : null;

  if (state.phase === 'hub') {
    return <>{<HubPage />}{reloginModal}<DevSettingsModal /><DeepLinkHandler /></>;
  }

  if (state.phase === 'picking-org') {
    return (
      <div className="bg-background flex flex-col h-screen w-full overflow-hidden">
        <LandingZonesPage />
        {reloginModal}
        <DevSettingsModal />
        <DeepLinkHandler />
      </div>
    );
  }

  if (state.phase === 'picking-product') {
    return (
      <div className="bg-background flex flex-col h-screen w-full overflow-hidden">
        <ProductPickerPage />
        {reloginModal}
        <DevSettingsModal />
        <DeepLinkHandler />
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
        <DevSettingsModal />
        <DeepLinkHandler />
      </div>
    );
  }

  // Workspace phase — full nav chrome + sidebar + tab content
  const workspaceSidebar =
    path === '/environments' ||
    path === '/builds' ||
    showSidebar;

  return (
    <div className="bg-background flex flex-col h-screen w-full overflow-hidden">
      <TopNav />
      <div className="flex flex-1 overflow-hidden flex-col">
        <div className="flex flex-1 overflow-hidden">
          {workspaceSidebar && <Sidebar />}
          <Outlet key={`${state.organisation}/${state.product}`} />
          {/* Develop task panel — keep-alive at layout level so tabs persist across navigation */}
          <div className="h-full" style={{ display: isOnDevelop ? undefined : 'none' }}>
            <DevelopTaskPanel />
          </div>
          {/* Tools panel — keep-alive so selected tool + internal state persists across navigation */}
          <div className="flex flex-col flex-1 h-full overflow-hidden" style={{ display: isOnTools ? undefined : 'none' }}>
            <ToolsPanel />
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
      <CommandPalette />
      <DevSettingsModal />
      <DevelopCommandsExtension />
      <GCloudCommandsExtension />
      {reloginModal}
      <DeepLinkHandler />
    </div>
  );
}
