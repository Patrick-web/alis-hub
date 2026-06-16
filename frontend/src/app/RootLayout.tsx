import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { TopNav } from './components/TopNav';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/LoginPage';
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
      .then(loggedIn => setPhase(loggedIn ? 'picking-org' : 'login'))
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

  // Workspace phase — full nav chrome + sidebar + tab content
  const path = location.pathname;
  const codeblockListPaths = new Set(['/codeblocks', '/codeblocks/mine', '/codeblocks/starred']);
  const showSidebar =
    path === '/environments' ||
    path === '/builds' ||
    codeblockListPaths.has(path);

  return (
    <div className="bg-[#1e1e1e] flex flex-col h-screen w-full overflow-hidden">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        {showSidebar && <Sidebar />}
        <Outlet key={`${state.organisation}/${state.product}`} />
      </div>
    </div>
  );
}
