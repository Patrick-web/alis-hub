import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import { SidebarNavItem } from './SidebarNavItem';
import { Button } from './Button';
import { useWorkspace } from '../stores/workspace';

// Items with a route navigate; items without (null) are placeholders.
// Environment items are loaded dynamically from the API (see Sidebar component).
const developNavItems = [
  { id: 'about', label: 'Overview', route: '/about', icon: <Icon icon="solar:chart-square-linear" className="text-[#F881A9] text-xl" /> },
  { id: 'services', label: 'Services', route: '/services', icon: <Icon icon="solar:layers-linear" className="text-[#F881A9] text-xl" /> },
  { id: 'routes', label: 'Routes', route: null, icon: <Icon icon="solar:map-point-linear" className="text-white text-xl" /> },
  { id: 'sharing', label: 'Sharing', route: '/share', icon: <Icon icon="solar:share-linear" className="text-[#F881A9] text-xl" /> },
  { id: 'product-access', label: 'Product access', route: null, icon: <Icon icon="solar:shield-keyhole-linear" className="text-white text-xl" /> },
];

const envNavItems = [
  { id: 'production', label: 'Production', icon: <Icon icon="solar:earth-linear" className="text-[#F881A9] text-xl" /> },
  { id: 'staging', label: 'Staging', icon: <Icon icon="solar:cloud-linear" className="text-white text-xl" /> },
  { id: 'development', label: 'Development', icon: <Icon icon="solar:code-linear" className="text-white text-xl" /> },
];

const buildNavItems = [
  { id: 'bookings-v1', label: 'bookings-v1', icon: <Icon icon="solar:delta-linear" className="text-[#F881A9] text-xl" /> },
  { id: 'bundles-v1', label: 'bundles-v1', icon: <Icon icon="solar:delta-linear" className="text-white text-xl" /> },
  { id: 'charters-v1', label: 'charters-v1', icon: <Icon icon="solar:delta-linear" className="text-white text-xl" /> },
  { id: 'chartertypes-v1', label: 'chartertypes-v1', icon: <Icon icon="solar:delta-linear" className="text-white text-xl" /> },
  { id: 'commissions-v1', label: 'commissions-v1', icon: <Icon icon="solar:delta-linear" className="text-white text-xl" /> },
  { id: 'iam-v1', label: 'iam-v1', icon: <Icon icon="solar:delta-linear" className="text-white text-xl" /> },
  { id: 'products-v1', label: 'products-v1', icon: <Icon icon="solar:delta-linear" className="text-white text-xl" /> },
  { id: 'packages-v1', label: 'packages-v1', icon: <Icon icon="solar:delta-linear" className="text-white text-xl" /> },
];

const codeblockNavItems = [
  { id: 'all', label: 'All Codeblocks', icon: <Icon icon="solar:box-linear" className="text-[#F881A9] text-xl" /> },
  { id: 'mine', label: 'My Codeblocks', icon: <Icon icon="solar:user-linear" className="text-white text-xl" /> },
  { id: 'starred', label: 'Starred', icon: <Icon icon="solar:star-linear" className="text-white text-xl" /> },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, setActiveEnv } = useWorkspace();
  const [activeBuildItem, setActiveBuildItem] = useState('');
  const [activeCodeblockItem, setActiveCodeblockItem] = useState('');

  const isEnvironments = location.pathname.includes('/environments');
  const isBuilds = location.pathname.includes('/builds');
  const isCodeblocks = location.pathname.includes('/codeblocks');

  // Derive active develop item from current path
  const currentPath = location.pathname;
  const activeDevelopId = developNavItems.find(i => i.route === currentPath)?.id ?? 'about';

  // Build dynamic env items from loaded environments
  const dynamicEnvItems = state.loadedEnvs.map(env => ({
    id: env.name,
    label: env.displayName,
    icon: <Icon icon="solar:server-square-cloud-linear" className="text-[#F881A9] text-xl" />,
  }));

  let items: { id: string; label: string; route?: string | null; icon: JSX.Element }[] = developNavItems;
  let header = 'DEVELOP';
  let bottomButtonLabel = 'Open in IDE';
  let bottomButtonIcon = <Icon icon="solar:keyboard-linear" className="text-xl" />;

  if (isEnvironments) {
    items = dynamicEnvItems.length > 0 ? dynamicEnvItems : envNavItems;
    header = 'ENVIRONMENTS';
    bottomButtonLabel = 'New Environment';
    bottomButtonIcon = <Icon icon="solar:add-circle-linear" className="text-xl" />;
  } else if (isBuilds) {
    items = buildNavItems;
    header = 'BUILDS';
    bottomButtonLabel = 'New Service';
    bottomButtonIcon = <Icon icon="solar:add-circle-linear" className="text-xl" />;
  } else if (isCodeblocks) {
    items = codeblockNavItems;
    header = 'CODEBLOCKS';
    bottomButtonLabel = 'Install Block';
    bottomButtonIcon = <Icon icon="solar:download-linear" className="text-xl" />;
  }

  const getActiveItem = () => {
    if (isEnvironments) {
      if (dynamicEnvItems.length > 0) return state.activeEnvName || dynamicEnvItems[0]?.id;
      return envNavItems[0]?.id;
    }
    if (isBuilds) return activeBuildItem || buildNavItems[0]?.id;
    if (isCodeblocks) return activeCodeblockItem || codeblockNavItems[0]?.id;
    return activeDevelopId;
  };

  const handleItemClick = (item: typeof items[0]) => {
    if (isEnvironments && dynamicEnvItems.length > 0) {
      setActiveEnv(item.id);
    } else if (isBuilds) {
      setActiveBuildItem(item.id);
    } else if (isCodeblocks) {
      setActiveCodeblockItem(item.id);
    }

    if ('route' in item && item.route) {
      navigate(item.route);
    }
  };

  return (
    <div className="bg-[#2c2c2c] h-full relative shrink-0 w-[300px]">
      <div className="content-stretch flex flex-col items-center justify-between overflow-clip relative rounded-[inherit] size-full">
        {/* Navigation items */}
        <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
          <div className="px-[20px] py-[10px] w-full border-b border-[#464646]">
            <p className="font-['JetBrains_Mono',sans-serif] font-bold text-[11px] text-white uppercase opacity-50">
              {header}
            </p>
          </div>
          {items.map((item) => (
            <SidebarNavItem
              key={item.id}
              label={item.label}
              icon={item.icon}
              active={getActiveItem() === item.id}
              onClick={() => handleItemClick(item)}
            />
          ))}
        </div>

        {/* Bottom button */}
        <div className="relative shrink-0 w-full">
          <div className="content-stretch flex flex-col items-start p-[10px] relative w-full">
            <Button 
              variant="primary" 
              icon={bottomButtonIcon}
              className="w-full flex-col h-[60px]"
            >
              {bottomButtonLabel}
            </Button>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="absolute border-[#626262] border-r border-solid inset-0 pointer-events-none" />
    </div>
  );
}
