import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { TopNav } from './components/TopNav';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { LandingZonesPage } from './pages/LandingZonesPage';
import { ProductPickerPage } from './pages/ProductPickerPage';
import { useWorkspace, type AppPhase } from './stores/workspace';
import * as ProductService from '../../bindings/alis-hub-v3/productservice';

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
        <div className="flex items-center gap-[10px]">
          <div className="size-[8px] rounded-full bg-[#F881A9] animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="size-[8px] rounded-full bg-[#F881A9] animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="size-[8px] rounded-full bg-[#F881A9] animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
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
  const isCodeblockSubPage = location.pathname.startsWith('/codeblocks/') && location.pathname !== '/codeblocks';
  const showSidebar = !isCodeblockSubPage;

  return (
    <div className="bg-[#1e1e1e] flex flex-col h-screen w-full overflow-hidden">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        {showSidebar && <Sidebar />}
        <Outlet />
      </div>
    </div>
  );
}
