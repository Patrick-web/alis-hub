import { Outlet, useLocation } from 'react-router';
import { TopNav } from './components/TopNav';
import { Sidebar } from './components/Sidebar';

export function RootLayout() {
  const location = useLocation();
  
  // Routes where the global Sidebar should be hidden
  // - /codeblocks/create
  // - /codeblocks/:id (details)
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
