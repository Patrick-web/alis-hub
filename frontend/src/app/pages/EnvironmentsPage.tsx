import { useEffect, useState, useCallback } from 'react';

function parseError(err: unknown): string {
  const s = String(err);
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj.message === 'string') return obj.message;
  } catch { /* not JSON */ }
  return s;
}
import { Icon } from '@iconify/react';
import { FilterInput } from '../components/FilterInput';
import { Toolbar } from '../components/Toolbar';
import { Button } from '../components/Button';
import { ActionButton } from '../components/ActionButton';
import { Table } from '../components/Table';
import { VarFormSheet, type PropagationTarget } from '../components/VarFormSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DuplicateVarModal } from '../components/DuplicateVarModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '../components/ui/tooltip';
import { useWorkspace } from '../stores/workspace';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import { Loader } from '../components/Loader';

interface EnvVar {
  id: string;
  label: string;
  value: string;
}

export function EnvironmentsPage() {
  const { state } = useWorkspace();
  const [filterText, setFilterText] = useState('');
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Variable CRUD sheet state
  const [varSheetOpen, setVarSheetOpen] = useState(false);
  const [varSheetMode, setVarSheetMode] = useState<'create' | 'edit'>('create');
  const [editVar, setEditVar] = useState<EnvVar | null>(null);

  // Delete confirmation state
  const [deleteVar, setDeleteVar] = useState<EnvVar | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // View value modal state
  const [viewVar, setViewVar] = useState<EnvVar | null>(null);

  // Duplicate modal state
  const [duplicateVar, setDuplicateVar] = useState<EnvVar | null>(null);

  // Labels present in each other environment: envName → Set<label>
  const [otherEnvLabels, setOtherEnvLabels] = useState<Record<string, Set<string>>>({});

  useEffect(() => {
    const others = state.loadedEnvs.filter(e => e.name !== state.activeEnvName);
    if (others.length === 0) { setOtherEnvLabels({}); return; }
    Promise.all(
      others.map(e =>
        (ProductService.GetEnvironmentVariables as (n: string) => Promise<any[]>)(e.name)
          .then(vars => ({ name: e.name, labels: new Set<string>(vars.map((v: any) => v.label as string)) }))
          .catch(() => ({ name: e.name, labels: new Set<string>() }))
      )
    ).then(results => {
      setOtherEnvLabels(Object.fromEntries(results.map(r => [r.name, r.labels])));
    });
  }, [state.activeEnvName, state.loadedEnvs]);

  // Load variables whenever selected environment changes
  const loadVariables = useCallback((envName: string) => {
    if (!envName) return;
    setLoading(true);
    setError(null);
    (ProductService.GetEnvironmentVariables as (envName: string) => Promise<any[]>)(envName)
      .then((result) => {
        const mapped: EnvVar[] = result.map((v: any, i: number) => ({
          id: String(i),
          label: v.label as string,
          value: v.value as string,
        }));
        setVars(mapped);
      })
      .catch((err) => setError(parseError(err)))
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

  const handleCreateVar = async (label: string, value: string, propagations?: PropagationTarget[]) => {
    if (vars.some((v) => v.label === label)) {
      throw new Error(`Variable "${label}" already exists`);
    }
    const newId = String(Date.now());
    const updated = [...vars, { id: newId, label, value }];
    setVars(updated);
    await persistVars(updated);

    // Propagate to other environments
    if (propagations && propagations.length > 0) {
      for (const target of propagations) {
        const existing = await (ProductService.GetEnvironmentVariables as (envName: string) => Promise<any[]>)(target.envName);
        const merged = [
          ...existing
            .filter((v: any) => v.label !== label)
            .map((v: any) => ({ label: v.label as string, value: v.value as string })),
          { label, value: target.value },
        ];
        await (ProductService.SetEnvironmentVariables as (envName: string, vars: any[]) => Promise<void>)(
          target.envName,
          merged,
        );
      }
    }
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
      setError(parseError(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredVars = vars.filter(v =>
    v.label.toLowerCase().includes(filterText.toLowerCase()) ||
    v.value.toLowerCase().includes(filterText.toLowerCase())
  );

  const columns = [
    {
      header: 'LABEL',
      render: (item: EnvVar) => (
        <span className="font-mono text-[11px]">{item.label}</span>
      ),
      className: 'w-[220px]',
    },
    {
      header: 'VALUE',
      render: (item: EnvVar) => (
        <div className="group relative flex items-center gap-[6px] min-w-0">
          <span className="font-mono text-[11px] text-foreground/60 break-all flex-1">
            {item.value}
          </span>
          <div className="hidden group-hover:flex items-center gap-[4px] shrink-0 bg-background pl-[4px]">
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                setViewVar(item);
              }}
            >
              View
            </ActionButton>
            <ActionButton
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(item.value);
              }}
            >
              Copy
            </ActionButton>
          </div>
        </div>
      ),
      className: 'w-[260px]',
    },
    {
      header: 'Actions',
      render: (item: EnvVar) => {
        const others = state.loadedEnvs.filter(e => e.name !== state.activeEnvName);
        const missingIn = others.filter(e => !otherEnvLabels[e.name]?.has(item.label));
        const existsInAll = others.length > 0 && missingIn.length === 0;

        return (
          <div className="flex gap-[5px] items-center">
            <ActionButton onClick={() => {
              setEditVar(item);
              setVarSheetMode('edit');
              setVarSheetOpen(true);
            }}>Edit</ActionButton>

            {others.length > 0 && (existsInAll ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-mono text-[9px] font-bold uppercase text-success border border-success px-[6px] py-[2px] rounded-[3px] cursor-default select-none opacity-70">
                    Present
                  </span>
                </TooltipTrigger>
                <TooltipContent className="bg-card border border-border text-foreground font-mono text-[10px] rounded-[4px] px-[10px] py-[6px]">
                  Present in all environments
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <ActionButton onClick={() => setDuplicateVar(item)}>Duplicate</ActionButton>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="bg-card border border-border text-foreground font-mono text-[10px] rounded-[4px] px-[10px] py-[6px]">
                  Missing in: {missingIn.map(e => e.displayName).join(', ')}
                </TooltipContent>
              </Tooltip>
            ))}

            <ActionButton onClick={() => setDeleteVar(item)}>Delete</ActionButton>
          </div>
        );
      },
      className: 'w-[210px]',
    },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-background">
      {/* Page Title Header */}
      <div className="px-[20px] py-[6px] border-b border-border flex items-center justify-between">
        <p className="font-mono font-bold text-[10px] text-foreground/50 uppercase">
          VARIABLES
        </p>
        {saving && <Loader size={20} />}
      </div>

      {/* Toolbar */}
      <Toolbar className="justify-between">
        <FilterInput
          placeholder="Filter..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          width="w-[300px]"
        />

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
      </Toolbar>

      {/* Table Content */}
      <div className="flex-1 overflow-hidden">
        {loading || (state.loadedEnvs.length === 0 && !state.envsError) ? (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        ) : state.envsError || error ? (
          <div className="flex items-center justify-center h-full px-[20px]">
            <p className="text-[12px] text-foreground/40 text-center">{state.envsError ?? error}</p>
          </div>
        ) : (
          <Table
            columns={columns}
            data={filteredVars}
            rowId={(v) => v.id}
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
        loadedEnvs={varSheetMode === 'create' ? state.loadedEnvs : undefined}
        currentEnvName={varSheetMode === 'create' ? state.activeEnvName : undefined}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteVar)}
        onOpenChange={(open) => { if (!open) setDeleteVar(null); }}
        title="Delete Variable"
        description={
          <>
            Delete <span className="text-foreground font-mono">{deleteVar?.label}</span>?
            This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={handleDeleteVar}
        requireText={deleteVar?.label}
      />

      {/* View value modal */}
      <Dialog open={Boolean(viewVar)} onOpenChange={(o) => { if (!o) setViewVar(null); }}>
        <DialogContent className="text-foreground p-0 gap-0 sm:max-w-[560px]">
          <DialogHeader className="px-[20px] py-[14px] border-b border-border">
            <div className="flex items-center gap-[10px]">
              <Icon icon="solar:eye-linear" className="text-brand text-xl" />
              <DialogTitle className="text-foreground font-mono text-[13px] font-bold">
                {viewVar?.label}
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="px-[20px] py-[16px] max-h-[400px] overflow-auto">
            <pre className="font-mono text-[12px] text-foreground/80 whitespace-pre-wrap break-all">
              {viewVar?.value}
            </pre>
          </div>
          <div className="px-[20px] py-[14px] border-t border-border flex justify-end gap-[8px]">
            <Button
              variant="secondary"
              className="h-[34px] px-[16px] text-[11px] font-bold uppercase"
              icon={<Icon icon="solar:copy-linear" className="text-xl" />}
              onClick={() => viewVar && navigator.clipboard.writeText(viewVar.value)}
            >
              Copy
            </Button>
            <Button
              variant="secondary"
              className="h-[34px] px-[16px] text-[11px] font-bold uppercase"
              onClick={() => setViewVar(null)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate modal */}
      <DuplicateVarModal
        open={Boolean(duplicateVar)}
        onOpenChange={(o) => { if (!o) setDuplicateVar(null); }}
        varLabel={duplicateVar?.label ?? ''}
        varValue={duplicateVar?.value ?? ''}
        sourceEnvName={state.activeEnvName}
        loadedEnvs={state.loadedEnvs}
      />
    </div>
  );
}
