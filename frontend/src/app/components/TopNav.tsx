import { useNavigate, useLocation } from 'react-router';
import { Icon } from '@iconify/react';
import { Tab } from './Tab';
import { Dropdown } from './Dropdown';

function WindowControls() {
  return (
    <div className="h-[8px] relative shrink-0 w-[36px]">
      <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 36 8">
        <circle cx="4" cy="4" fill="#FF5C5F" r="4" />
        <circle cx="18" cy="4" fill="#FAC800" r="4" />
        <circle cx="32" cy="4" fill="#34C759" r="4" />
      </svg>
    </div>
  );
}

const tabs = [
  { id: 'about', label: 'About', icon: <Icon icon="solar:info-circle-linear" className="text-xl" /> },
  { id: 'develop', label: 'Develop', icon: <Icon icon="solar:code-2-linear" className="text-base" /> },
  { id: 'builds', label: 'Builds', icon: <Icon icon="solar:box-linear" className="text-base" /> },
  { id: 'deployments', label: 'Deployments', icon: <Icon icon="solar:cloud-upload-linear" className="text-base" /> },
  { id: 'environments', label: 'Environments', icon: <Icon icon="solar:server-linear" className="text-base" /> },
  { id: 'tools', label: 'Tools', icon: <Icon icon="solar:settings-linear" className="text-base" /> },
  { id: 'agents', label: 'Agents', icon: <Icon icon="solar:users-group-two-rounded-linear" className="text-base" /> },
  { id: 'codeblocks', label: 'Codeblocks', icon: <Icon icon="solar:code-linear" className="text-base" /> },
];

export function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTab = () => {
    const path = location.pathname.split('/')[1] || 'about';
    // Services is a sub-section of develop
    if (path === 'services') return 'develop';
    return path;
  };

  const activeTab = getActiveTab();

  const handleTabClick = (tabId: string) => {
    navigate(`/${tabId}`);
  };

  return (
    <div className="bg-[#2c2c2c] border-b border-[#464646] h-[35px] flex items-center shrink-0 w-full overflow-hidden">
      {/* Left: Window controls and breadcrumb */}
      <div className="flex items-center h-full pr-[10px]">
        <div className="px-[10px] flex items-center justify-center">
          <WindowControls />
        </div>

        <div className="flex items-center gap-[5px] ml-[5px] border-l border-r border-[#464646] h-full px-[10px]">
          <Icon icon="solar:home-2-linear" className="text-white text-base opacity-70 cursor-pointer hover:opacity-100" />
          <Icon icon="solar:alt-arrow-right-linear" className="text-white text-[10px] opacity-40" />
          <p className="text-[11px] text-white font-['JetBrains_Mono',sans-serif] opacity-70">voyage</p>
          <Icon icon="solar:alt-arrow-right-linear" className="text-white text-[10px] opacity-40" />
          <p className="text-[11px] text-white font-['JetBrains_Mono',sans-serif] opacity-70 font-bold">vp</p>
          <Icon icon="solar:alt-arrow-right-linear" className="text-white text-[10px] opacity-40" />
        </div>
      </div>

      {/* Center: Tabs */}
      <div className="flex h-full flex-1 justify-center overflow-x-auto no-scrollbar">
        <div className="flex h-full border-r border-[#464646]">
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onClick={() => handleTabClick(tab.id)}
            />
          ))}
        </div>
      </div>

      {/* Right: Environment and Settings */}
      <div className="flex items-center h-full px-[10px] gap-[10px]">
        <Dropdown label="Production" options={['Production', 'Staging', 'Development']} />
        <div className="h-full w-px bg-[#464646]" />
        <Icon icon="solar:user-circle-linear" className="text-white text-xl opacity-70 cursor-pointer hover:opacity-100" />
      </div>
    </div>
  );
  }
