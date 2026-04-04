import { useState } from 'react';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { ActionButton } from '../components/ActionButton';
import { Table } from '../components/Table';

interface EnvVar {
  id: string;
  label: string;
  value: string;
}

const vars: EnvVar[] = [
  { id: '1', label: 'ALIS_RUN_HASH', value: 'utametid.dolorest-loremculpa_magna-consequat' },
  { id: '2', label: 'ALIS_REGION', value: 'utametid.dolorest-loremculpa_magna-consequat' },
  { id: '3', label: 'ALIS_PROJECT_NR', value: 'utametid.dolorest-loremculpa_magna-consequat' },
  { id: '4', label: 'ALIS_PRODUCT_REGION', value: 'utametid.dolorest-loremculpa_magna-consequat' },
  { id: '5', label: 'ALIS_PRODUCT_CONFIG', value: 'utametid.dolorest-loremculpa_magna-consequat' },
  { id: '6', label: 'ALIS_OS_VERSION', value: 'utametid.dolorest-loremculpa_magna-consequat' },
  { id: '7', label: 'ALIS_OS_PROJECT', value: 'utametid.dolorest-loremculpa_magna-consequat' },
  { id: '8', label: 'ALIS_OS_PRODUCT_PROJECT', value: 'utametid.dolorest-loremculpa_magna-consequat' },
];

export function EnvironmentsPage() {
  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');

  const toggleVar = (id: string) => {
    setSelectedVars(prev => 
      prev.includes(id) ? prev.filter(vId => vId !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelectedVars(prev => 
      prev.length === vars.length ? [] : vars.map(v => v.id)
    );
  };

  const filteredVars = vars.filter(v => 
    v.label.toLowerCase().includes(filterText.toLowerCase()) ||
    v.value.toLowerCase().includes(filterText.toLowerCase())
  );

  const columns = [
    { 
      header: 'LABEL', 
      render: (item: EnvVar) => item.label,
      className: 'w-[300px]'
    },
    { 
      header: 'VALUE', 
      render: (item: EnvVar) => item.value,
      className: 'flex-1'
    },
    { 
      header: 'Actions', 
      render: (item: EnvVar) => (
        <div className="flex gap-[5px]">
          <ActionButton>Edit</ActionButton>
          <ActionButton>Delete</ActionButton>
        </div>
      ),
      className: 'w-[150px]'
    },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Page Title Header (matches design: "VARIABLES") */}
      <div className="px-[20px] py-[6px] border-b border-[#464646]">
        <p className="font-['JetBrains_Mono',sans-serif] font-bold text-[10px] text-[rgba(255,255,255,0.5)] uppercase">
          VARIABLES
        </p>
      </div>

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
            className="w-[300px] border-l-0 rounded-l-none h-full"
            containerClassName="h-full"
          />
        </div>
        
        <div className="flex items-center gap-[10px]">
          <Button variant="secondary" className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold" icon={<Icon icon="solar:add-circle-linear" className="text-xl" />}>
            New Variable
          </Button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-hidden">
        <Table 
          columns={columns}
          data={filteredVars}
          rowId={(v) => v.id}
          selectedIds={selectedVars}
          onSelectRow={toggleVar}
          onSelectAll={toggleAll}
        />
      </div>
    </div>
  );
}
