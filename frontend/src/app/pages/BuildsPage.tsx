import { useState } from 'react';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Table } from '../components/Table';

interface Build {
  id: string;
  version: string;
  date: string;
}

const builds: Build[] = [
  { id: '1', version: '1.0.167', date: '01/20/2025 6:54PM' },
  { id: '2', version: '1.0.166', date: '01/19/2025 4:08PM' },
  { id: '3', version: '1.0.165', date: '01/19/2025 2:01PM' },
  { id: '4', version: '1.0.164', date: '01/18/2025 6:19AM' },
  { id: '5', version: '1.0.163', date: '01/17/2025 6:43PM' },
  { id: '6', version: '1.0.162', date: '01/16/2025 8:26AM' },
  { id: '7', version: '1.0.161', date: '01/16/2025 7:32PM' },
  { id: '8', version: '1.0.160', date: '01/16/2025 1:23AM' },
  { id: '9', version: '1.0.159', date: '01/15/2025 5:12PM' },
  { id: '10', version: '1.0.158', date: '01/15/2025 11:45AM' },
];

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
labore. ad aliqua aute officia.

elit qui duis magna et cillum dolor velit aliquip occaecat eu
elit tempor ullamco eiusmod et. minim nostrud nisi nostrud ad
adipisicing esse sint esse consectetur aliquip. duis eu magna
fugiat sunt deserunt sit ullamco. enim esse sit qui eiusmod
excepteur sint eiusmod minim. deserunt deserunt dolor qui
mollit pariatur aute ad occaecat anim adipisicing ea. commodo
velit dolore amet aute laborum eiusmod reprehenderit laborum
aute lorem.`;

export function BuildsPage() {
  const [selectedBuilds, setSelectedBuilds] = useState<string[]>(['1']);
  const [filterText, setFilterText] = useState('');

  const toggleBuild = (id: string) => {
    setSelectedBuilds(prev => 
      prev.includes(id) ? prev.filter(bId => bId !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelectedBuilds(prev => 
      prev.length === builds.length ? [] : builds.map(b => b.id)
    );
  };

  const columns = [
    { 
      header: 'ID', 
      render: (item: Build) => item.version,
      className: 'w-[200px]'
    },
    { 
      header: 'DATE', 
      render: (item: Build) => (
        <span className="opacity-70">{item.date}</span>
      ),
      className: 'flex-1'
    },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-row bg-[#1e1e1e]">
      {/* Left Section: Toolbar and Table */}
      <div className="flex-1 flex flex-col border-r border-[#464646] overflow-hidden">
        {/* Toolbar */}
        <div className="border-b border-[#464646] px-[20px] py-[8px] flex items-center justify-between">
          <div className="flex items-center h-[34px]">
            <div className="bg-[#2c2c2c] border border-[#464646] px-[12px] h-full flex items-center justify-center border-r-0 rounded-l-[4px]">
              <p className="text-[12px] text-white">/</p>
            </div>
            <Input 
              placeholder="Filter..." 
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-[150px] border-l-0 rounded-l-none h-full"
              containerClassName="h-full"
            />
          </div>
          
          <div className="flex items-center gap-[10px]">
            <Button variant="secondary" className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold" icon={<Icon icon="solar:cloud-upload-linear" className="text-base" />}>
              DEPLOY
            </Button>
            <Button variant="secondary" className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold" icon={<Icon icon="solar:restart-linear" className="text-base" />}>
              REVERT
            </Button>
            <Button variant="secondary" className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold" icon={<Icon icon="solar:box-linear" className="text-base" />}>
              BUILD
            </Button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-hidden">
          <Table 
            columns={columns}
            data={builds}
            rowId={(b) => b.id}
            selectedIds={selectedBuilds}
            onSelectRow={toggleBuild}
            onSelectAll={toggleAll}
          />
        </div>
      </div>

      {/* Right Section: Logs Panel */}
      <div className="w-[450px] flex flex-col bg-[#1e1e1e] overflow-hidden">
        <div className="px-[20px] py-[10px] border-b border-[#464646] flex items-center justify-between h-[51px]">
          <p className="font-['JetBrains_Mono',sans-serif] font-bold text-[11px] text-white uppercase opacity-70">
            LOGS
          </p>
          <div className="flex items-center gap-[15px]">
            <Icon icon="solar:copy-linear" className="text-white opacity-50 cursor-pointer hover:opacity-100 text-lg" />
            <Icon icon="solar:document-text-linear" className="text-white opacity-50 cursor-pointer hover:opacity-100 text-lg" />
            <Icon icon="solar:full-screen-linear" className="text-white opacity-50 cursor-pointer hover:opacity-100 text-lg" />
          </div>
        </div>
        <div className="flex-1 p-[20px] overflow-auto">
          <pre className="font-['JetBrains_Mono',sans-serif] text-[12px] leading-[1.6] text-[rgba(255,255,255,0.85)] whitespace-pre-wrap">
            {mockLogs}
          </pre>
        </div>
      </div>
    </div>
  );
}
