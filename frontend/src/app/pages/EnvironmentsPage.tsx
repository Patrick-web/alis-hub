import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { ActionButton } from '../components/ActionButton';
import { Table } from '../components/Table';
import { useWorkspace } from '../stores/workspace';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';

interface EnvVar {
  id: string;
  label: string;
  value: string;
}

export function EnvironmentsPage() {
  const { state, setLoadedEnvs, setActiveEnv } = useWorkspace();
  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(false);
  const [envsLoading, setEnvsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load environment list on mount if not already loaded
  useEffect(() => {
    if (state.loadedEnvs.length > 0 || envsLoading) return;
    if (!state.organisation || !state.product) return;

    setEnvsLoading(true);
    (ProductService.ListEnvironments as (org: string, product: string) => Promise<any[]>)(
      state.organisation,
      state.product
    )
      .then((envs) => {
        const loaded = envs.map((e: any) => ({
          name: e.name as string,
          displayName: e.displayName as string,
          state: e.state as number,
        }));
        setLoadedEnvs(loaded);
        if (!state.activeEnvName && loaded.length > 0) {
          setActiveEnv(loaded[0].name);
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setEnvsLoading(false));
  }, [state.organisation, state.product]);

  // Load variables whenever selected environment changes
  const loadVariables = useCallback((envName: string) => {
    if (!envName) return;
    setLoading(true);
    setError(null);
    setSelectedVars([]);
    (ProductService.GetEnvironmentVariables as (envName: string) => Promise<any[]>)(envName)
      .then((result) => {
        const mapped: EnvVar[] = result.map((v: any, i: number) => ({
          id: String(i),
          label: v.label as string,
          value: v.value as string,
        }));
        setVars(mapped);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (state.activeEnvName) {
      loadVariables(state.activeEnvName);
    }
  }, [state.activeEnvName, loadVariables]);

  const toggleVar = (id: string) => {
    setSelectedVars(prev =>
      prev.includes(id) ? prev.filter(vId => vId !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelectedVars(prev =>
      prev.length === filteredVars.length ? [] : filteredVars.map(v => v.id)
    );
  };

  const filteredVars = vars.filter(v =>
    v.label.toLowerCase().includes(filterText.toLowerCase()) ||
    v.value.toLowerCase().includes(filterText.toLowerCase())
  );

  const columns = [
    {
      header: 'LABEL',
      render: (item: EnvVar) => (
        <span className="font-['JetBrains_Mono',sans-serif] text-[11px]">{item.label}</span>
      ),
      className: 'w-[300px]',
    },
    {
      header: 'VALUE',
      render: (item: EnvVar) => (
        <span className="font-['JetBrains_Mono',sans-serif] text-[11px] text-[rgba(255,255,255,0.6)] truncate block max-w-full">
          {item.value}
        </span>
      ),
      className: 'flex-1 min-w-0',
    },
    {
      header: 'Actions',
      render: (_item: EnvVar) => (
        <div className="flex gap-[5px]">
          <ActionButton>Edit</ActionButton>
          <ActionButton>Delete</ActionButton>
        </div>
      ),
      className: 'w-[150px]',
    },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Page Title Header */}
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
          <Button
            variant="secondary"
            className="px-[12px] py-[6px] h-[34px] uppercase text-[10px] font-bold"
            icon={<Icon icon="solar:add-circle-linear" className="text-xl" />}
          >
            New Variable
          </Button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-hidden">
        {loading || envsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-[10px]">
              <div className="size-[6px] rounded-full bg-[#F881A9] animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="size-[6px] rounded-full bg-[#F881A9] animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="size-[6px] rounded-full bg-[#F881A9] animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full px-[20px]">
            <p className="text-[12px] text-[rgba(255,255,255,0.4)] text-center">{error}</p>
          </div>
        ) : (
          <Table
            columns={columns}
            data={filteredVars}
            rowId={(v) => v.id}
            selectedIds={selectedVars}
            onSelectRow={toggleVar}
            onSelectAll={toggleAll}
          />
        )}
      </div>
    </div>
  );
}
