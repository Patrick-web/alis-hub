import { useState } from 'react';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { ActionButton } from '../components/ActionButton';
import { Dropdown } from '../components/Dropdown';
import { Table } from '../components/Table';

interface Neuron {
  id: string;
  name: string;
  latestBuild: string;
  staging: string;
  production: string;
  development: string;
}

const neurons: Neuron[] = [
  { id: '1', name: 'bookings-v1', latestBuild: '1.0.167', staging: '1.0.167', production: '1.0.167', development: '1.0.167' },
  { id: '2', name: 'bundles-v1', latestBuild: '1.0.167', staging: '1.0.167', production: '1.0.167', development: '1.0.167' },
  { id: '3', name: 'charters-v1', latestBuild: '1.0.167', staging: '1.0.167', production: '1.0.167', development: '1.0.167' },
  { id: '4', name: 'chartertmps-v1', latestBuild: '1.0.167', staging: '1.0.167', production: '1.0.167', development: '1.0.167' },
  { id: '5', name: 'commissions-v1', latestBuild: '1.0.167', staging: '1.0.167', production: '1.0.167', development: '1.0.167' },
  { id: '6', name: 'iam-v1', latestBuild: '1.0.167', staging: '1.0.167', production: '1.0.167', development: '1.0.167' },
  { id: '7', name: 'products-v1', latestBuild: '1.0.167', staging: '1.0.167', production: '1.0.167', development: '1.0.167' },
  { id: '8', name: 'packages-v1', latestBuild: '1.0.167', staging: '1.0.167', production: '1.0.167', development: '1.0.167' },
];

export function DevelopPage() {
  const [selectedNeurons, setSelectedNeurons] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');

  const toggleNeuron = (id: string) => {
    setSelectedNeurons(prev => 
      prev.includes(id) ? prev.filter(nId => nId !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelectedNeurons(prev => 
      prev.length === neurons.length ? [] : neurons.map(n => n.id)
    );
  };

  const filteredNeurons = neurons.filter(n => 
    n.name.toLowerCase().includes(filterText.toLowerCase())
  );

  const columns = [
    { 
      header: 'NEURON', 
      render: (item: Neuron) => item.name,
      className: 'w-[300px]'
    },
    { 
      header: 'LATEST BUILD', 
      render: (item: Neuron) => item.latestBuild,
      className: 'w-[150px]'
    },
    { 
      header: 'Staging', 
      render: (item: Neuron) => item.staging,
      className: 'w-[150px]'
    },
    { 
      header: 'Production', 
      render: (item: Neuron) => item.production,
      className: 'w-[150px]'
    },
    { 
      header: 'Development', 
      render: (item: Neuron) => item.development,
      className: 'w-[150px]'
    },
    { 
      header: 'Actions', 
      render: (item: Neuron) => (
        <div className="flex gap-[5px]">
          <ActionButton>Define</ActionButton>
          <ActionButton>Build</ActionButton>
          <ActionButton>Deploy</ActionButton>
          <ActionButton>New Service</ActionButton>
        </div>
      ),
      className: 'min-w-[400px]'
    },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
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
            className="w-[200px] border-l-0 rounded-l-none h-full"
            containerClassName="h-full"
          />
        </div>
        
        <div className="flex items-center gap-[10px]">
          <Button variant="secondary" className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold">DEFINE</Button>
          <Button variant="secondary" className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold">BUILD</Button>
          <Button variant="secondary" className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold">DEPLOY</Button>
          <Dropdown label="Manage Packages" options={['Package Manager', 'Dependencies', 'Update All']} />
          <Button variant="primary" icon={<Icon icon="solar:add-circle-linear" className="text-xl" />} className="h-[34px] uppercase text-[10px] font-bold">New Neuron</Button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-hidden">
        <Table 
          columns={columns}
          data={filteredNeurons}
          rowId={(n) => n.id}
          selectedIds={selectedNeurons}
          onSelectRow={toggleNeuron}
          onSelectAll={toggleAll}
        />
      </div>
    </div>
  );
}
