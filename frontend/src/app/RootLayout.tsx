import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { TopNav } from './components/TopNav';
import { StandaloneTopNav } from './components/StandaloneTopNav';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { HubPage } from './pages/HubPage';
import { LandingZonesPage } from './pages/LandingZonesPage';
import { ProductPickerPage } from './pages/ProductPickerPage';
import { useWorkspace, type AppPhase } from './stores/workspace';
import * as ProductService from '../../bindings/alis-hub-v3/productservice';
import { Loader } from './components/Loader';

export function RootLayout() {
  const location = useLocation();
  const { state, setPhase } = useWorkspace();

  // On mount: check login status, then route to appropriate phase.
  // DEV: ?phase=picking-org overrides for browser testing without Wails bridge.
  useEffect(() => {
    const devPhase = new URLSearchParams(window.location.search).get('phase') as AppPhase | null;
    if (devPhase) { setPhase(devPhase); return; }
    (ProductService.IsLoggedIn as () => Promise<boolean>)()
      .then(loggedIn => setPhase(loggedIn ? 'hub' : 'login'))
      .catch(() => setPhase('login'));
  }, []);

  // Pre-workspace phases render fullscreen without nav chrome
  if (state.phase === 'init') {
    return (
      <div className="bg-[#1e1e1e] flex items-center justify-center h-screen w-full">
        <Loader />
      </div>
    );
  }

  if (state.phase === 'login') {
    return (
      <div className="bg-[#1e1e1e] flex flex-col h-screen w-full">
        <LoginPage />
      </div>
    );
  }

  if (state.phase === 'hub') {
    return <HubPage />;
  }

  if (state.phase === 'picking-org') {
    return (
      <div className="bg-[#1e1e1e] flex flex-col h-screen w-full overflow-hidden">
        <LandingZonesPage />
      </div>
    );
  }

  if (state.phase === 'picking-product') {
    return (
      <div className="bg-[#1e1e1e] flex flex-col h-screen w-full overflow-hidden">
        <ProductPickerPage />
      </div>
    );
  }

  const path = location.pathname;
  const codeblockListPaths = new Set(['/codeblocks', '/codeblocks/mine', '/codeblocks/starred']);
  const showSidebar = codeblockListPaths.has(path);

  // Standalone phase — slim 4-shortcut nav, no product required
  if (state.phase === 'standalone') {
    return (
      <div className="bg-[#1e1e1e] flex flex-col h-screen w-full overflow-hidden">
        <StandaloneTopNav />
        <div className="flex flex-1 overflow-hidden">
          {showSidebar && <Sidebar />}
          <Outlet />
        </div>
      </div>
    );
  }

  // Workspace phase — full nav chrome + sidebar + tab content
  const workspaceSidebar =
    path === '/environments' ||
    path === '/builds' ||
    showSidebar;

  return (
    <div className="bg-[#1e1e1e] flex flex-col h-screen w-full overflow-hidden">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        {workspaceSidebar && <Sidebar />}
        <Outlet key={`${state.organisation}/${state.product}`} />
      </div>
    </div>
  );
}
