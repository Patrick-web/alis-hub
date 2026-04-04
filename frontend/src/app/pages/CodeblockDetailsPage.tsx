import { useState } from 'react';
import { Icon } from '@iconify/react';
import { Button } from '../components/Button';

const mockLogs = `minim irure cupidatat ad mollit et et exercitation est. est sit
laboris sint ut consectetur. qui commodo commodo ad elit sint.
est consequat lorem id non lorem minim excepteur exercitation
commodo voluptate ullamco nulla sunt reprehenderit consequat.

laborum voluptate ipsum eu. deserun consequat aute amet ipsum
nostrud magna enim enim sit anim cillum. ad ipsum culpa irure
minim velit ipsum sit qui consequat aliqua. anim ad occaecat
laboris officia in id aute sunt qui. sint reprehenderit magna
veniam velit duis proident eiusmod proident ipsum officia
consequat. mollit veniam non veniam et nisi qui in ex officia
eu tempor. sunt culpa adipisicing eiusmod cupidatat.

veniam consequat adipisicing consequat ipsum tempor. esse minim
incididunt ipsum sint proident excepteur laborum proident culpa
anim incididunt mollit. est esse laborum ex commodo consectetur
adipisicing labore minim ex irure nisi. magna est ipsum nostrud
id voluptate ut quis dolor sint vulputate. velit cillum non
labore. ad aliqua aute officia.`;

const tabs = ['ABOUT', 'DOCUMENTATION', 'VERSIONS', 'HELP'];

export function CodeblockDetailsPage() {
  const [activeTab, setActiveTab] = useState('ABOUT');

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-[#1e1e1e]">
      {/* Sidebar Info */}
      <div className="w-[300px] flex flex-col border-r border-[#464646] bg-[#1e1e1e]">
        <div className="p-[20px] flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[10px]">
            <h1 className="font-['JetBrains_Mono',sans-serif] font-bold text-[18px] text-white uppercase leading-[1.2]">
              SENDGRID EMAIL SENDER
            </h1>
            <p className="text-[12px] text-[rgba(255,255,255,0.7)] leading-[1.5]">
              Empower Your Applications With A Secure, Scalable, And Seamless OIDC Identity Provider.
            </p>
          </div>

          <div className="bg-[rgba(255,255,255,0.03)] border border-[#464646] rounded-[4px] overflow-hidden">
            <div className="p-[12px] border-b border-[#464646]">
              <p className="text-[10px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[2px]">Latest Version</p>
              <p className="text-[12px] text-white font-['JetBrains_Mono',sans-serif]">v1.2.0</p>
            </div>
            <div className="p-[12px] border-b border-[#464646]">
              <p className="text-[10px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[2px]">Release</p>
              <p className="text-[12px] text-white font-['JetBrains_Mono',sans-serif]">Stable</p>
            </div>
            <div className="p-[12px]">
              <p className="text-[10px] text-[rgba(255,255,255,0.5)] uppercase font-bold mb-[2px]">Publisher</p>
              <p className="text-[12px] text-white font-['JetBrains_Mono',sans-serif]">Alis Exchange</p>
            </div>
          </div>

          <div className="flex flex-col gap-[10px]">
            <p className="text-[11px] text-white font-bold uppercase">Admins</p>
            <div className="flex -space-x-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="size-[35px] rounded-full border-2 border-[#1e1e1e] overflow-hidden bg-[#2c2c2c]">
                  <img src={`https://i.pravatar.cc/100?u=${i}`} alt="avatar" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto p-[10px] flex flex-col gap-[10px]">
          <Button variant="secondary" className="w-full h-[50px] flex-col" icon={<Icon icon="solar:box-linear" className="text-xl" />}>
            INSTANCES
          </Button>
          <Button variant="primary" className="w-full h-[50px] flex-col" icon={<Icon icon="solar:download-linear" className="text-xl" />}>
            INSTALL
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab Header */}
        <div className="flex items-center border-b border-[#464646]">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-[30px] py-[15px] text-[11px] font-bold uppercase transition-all relative ${
                activeTab === tab ? 'text-[#f881a9]' : 'text-white opacity-50 hover:opacity-100'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#f881a9]" />
              )}
            </button>
          ))}
          <div className="flex-1" />
          <div className="px-[20px] flex items-center gap-[15px]">
            <Icon icon="solar:copy-linear" className="text-white opacity-50 cursor-pointer hover:opacity-100 text-lg" />
            <Icon icon="solar:document-text-linear" className="text-white opacity-50 cursor-pointer hover:opacity-100 text-lg" />
            <Icon icon="solar:full-screen-linear" className="text-white opacity-50 cursor-pointer hover:opacity-100 text-lg" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-[20px] overflow-auto">
          <pre className="font-['JetBrains_Mono',sans-serif] text-[13px] leading-[1.8] text-[rgba(255,255,255,0.9)] whitespace-pre-wrap">
            {mockLogs}
          </pre>
        </div>
      </div>
    </div>
  );
}
