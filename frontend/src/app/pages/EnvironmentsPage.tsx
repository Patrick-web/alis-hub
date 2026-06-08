import { useEffect, useState, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { ActionButton } from '../components/ActionButton';
import { Table } from '../components/Table';
import { VarFormSheet } from '../components/VarFormSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Variable CRUD sheet state
  const [varSheetOpen, setVarSheetOpen] = useState(false);
  const [varSheetMode, setVarSheetMode] = useState<'create' | 'edit'>('create');
  const [editVar, setEditVar] = useState<EnvVar | null>(null);

  // Delete confirmation state
  const [deleteVar, setDeleteVar] = useState<EnvVar | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  // Persist vars array to API
  const persistVars = useCallback(async (updated: EnvVar[]) => {
    if (!state.activeEnvName) return;
    setSaving(true);
    try {
      await (ProductService.SetEnvironmentVariables as (envName: string, vars: any[]) => Promise<void>)(
        state.activeEnvName,
        updated.map((v) => ({ label: v.label, value: v.value })),
      );
    } finally {
      setSaving(false);
    }
  }, [state.activeEnvName]);

  const handleCreateVar = async (label: string, value: string) => {
    if (vars.some((v) => v.label === label)) {
      throw new Error(`Variable "${label}" already exists`);
    }
    const newId = String(Date.now());
    const updated = [...vars, { id: newId, label, value }];
    setVars(updated);
    await persistVars(updated);
  };

  const handleEditVar = async (_label: string, value: string) => {
    if (!editVar) return;
    const updated = vars.map((v) => v.id === editVar.id ? { ...v, value } : v);
    setVars(updated);
    await persistVars(updated);
  };

  const handleDeleteVar = async () => {
    if (!deleteVar) return;
    setDeleteLoading(true);
    try {
      const updated = vars.filter((v) => v.id !== deleteVar.id);
      setVars(updated);
      await persistVars(updated);
      setDeleteVar(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleteLoading(false);
    }
  };

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
      render: (item: EnvVar) => (
        <div className="flex gap-[5px]">
          <ActionButton onClick={() => {
            setEditVar(item);
            setVarSheetMode('edit');
            setVarSheetOpen(true);
          }}>Edit</ActionButton>
          <ActionButton onClick={() => setDeleteVar(item)}>Delete</ActionButton>
        </div>
      ),
      className: 'w-[150px]',
    },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#1e1e1e]">
      {/* Page Title Header */}
      <div className="px-[20px] py-[6px] border-b border-[#464646] flex items-center justify-between">
        <p className="font-['JetBrains_Mono',sans-serif] font-bold text-[10px] text-[rgba(255,255,255,0.5)] uppercase">
          VARIABLES
        </p>
        {saving && (
          <div className="flex items-center gap-[6px]">
            <Icon icon="solar:refresh-linear" className="text-[#F881A9] text-[14px] animate-spin" />
            <p className="font-['JetBrains_Mono',sans-serif] text-[10px] text-[rgba(255,255,255,0.4)]">Saving…</p>
          </div>
        )}
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
            onClick={() => {
              setVarSheetMode('create');
              setEditVar(null);
              setVarSheetOpen(true);
            }}
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

      {/* Variable create/edit sheet */}
      <VarFormSheet
        open={varSheetOpen}
        onOpenChange={setVarSheetOpen}
        mode={varSheetMode}
        initialLabel={varSheetMode === 'edit' ? (editVar?.label ?? '') : ''}
        initialValue={varSheetMode === 'edit' ? (editVar?.value ?? '') : ''}
        onSubmit={varSheetMode === 'create' ? handleCreateVar : handleEditVar}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteVar)}
        onOpenChange={(open) => { if (!open) setDeleteVar(null); }}
        title="Delete Variable"
        description={
          <>
            Delete <span className="text-white font-['JetBrains_Mono',sans-serif]">{deleteVar?.label}</span>?
            This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={handleDeleteVar}
      />
    </div>
  );
}
