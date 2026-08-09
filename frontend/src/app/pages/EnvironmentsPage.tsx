import { useEffect, useState, useCallback } from "react";

/** Last path segment of a resource name, e.g. ".../environments/abc" -> "abc". */
function lastSegment(name: string): string {
  const i = name.lastIndexOf("/");
  return i === -1 ? name : name.slice(i + 1);
}

function parseError(err: unknown): string {
  const s = String(err);
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj.message === "string") return obj.message;
  } catch {
    /* not JSON */
  }
  return s;
}
import { Icon } from "@iconify/react";
import { FilterInput } from "../components/FilterInput";
import { Toolbar } from "../components/Toolbar";
import { Button } from "../components/Button";
import { ActionButton } from "../components/ActionButton";
import { Table } from "../components/Table";
import { VarFormSheet, type PropagationTarget } from "../components/VarFormSheet";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DuplicateVarModal } from "../components/DuplicateVarModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip";
import { notify } from "../lib/notify";
import { useWorkspace } from "../stores/workspace";
import * as ProductService from "../../../bindings/alis-hub-v3/productservice";
import { Loader } from "../components/Loader";
import { ApprovalGateDialog, useApprovalGate } from "../components/ApprovalGate";

interface EnvVar {
  id: string;
  label: string;
  value: string;
}

export function EnvironmentsPage() {
  const { state } = useWorkspace();
  const [filterText, setFilterText] = useState("");
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Variable CRUD sheet state
  const [varSheetOpen, setVarSheetOpen] = useState(false);
  const [varSheetMode, setVarSheetMode] = useState<"create" | "edit">("create");
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

  // Whether this caller holds roles/environment.admin on the active
  // environment. Only `alis environment variables` reports it; without it the
  // edit controls stay enabled and a write fails server-side instead.
  // Defaults to true so a missing CLI never locks a working page.
  const [canUpdate, setCanUpdate] = useState(true);

  // Which git branches may deploy to the active environment. Empty means no
  // designation, i.e. any branch — the state --allow-branch-mismatch overrides.
  const [branches, setBranches] = useState<string[] | null>(null);
  const [branchesOpen, setBranchesOpen] = useState(false);
  const [branchesDraft, setBranchesDraft] = useState("");

  const envId = lastSegment(state.activeEnvName);
  const cliReady = Boolean(state.organisation && state.product && envId);

  useEffect(() => {
    const others = state.loadedEnvs.filter((e) => e.name !== state.activeEnvName);
    if (others.length === 0) {
      setOtherEnvLabels({});
      return;
    }
    Promise.all(
      others.map((e) =>
        (ProductService.GetEnvironmentVariables as (n: string) => Promise<any[]>)(e.name)
          .then((vars) => ({
            name: e.name,
            labels: new Set<string>(vars.map((v: any) => v.label as string)),
          }))
          .catch(() => ({ name: e.name, labels: new Set<string>() })),
      ),
    ).then((results) => {
      setOtherEnvLabels(Object.fromEntries(results.map((r) => [r.name, r.labels])));
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

  // Permission and branch designation come from the CLI; both are additive, so
  // a failure leaves the page exactly as it was before.
  const loadBranches = useCallback(async () => {
    if (!cliReady) return;
    try {
      const b = await ProductService.GetEnvironmentBranchesCLI(
        state.organisation,
        state.product,
        envId,
      );
      setBranches(b?.allowedBranches ?? []);
    } catch {
      setBranches(null);
    }
  }, [cliReady, state.organisation, state.product, envId]);

  useEffect(() => {
    if (!cliReady) return;
    // Only ever set from an async result. The no-CLI case is handled by
    // deriving at render instead, so nothing is set synchronously here.
    ProductService.ListEnvironmentVariablesCLI(state.organisation, state.product)
      .then((envs) => {
        const match = (envs ?? []).find((e) => e.environmentId === envId);
        setCanUpdate(match ? match.canUpdate : true);
      })
      .catch(() => setCanUpdate(true));
    void loadBranches();
  }, [cliReady, state.organisation, state.product, envId, loadBranches]);

  // Without a CLI context there is no permission signal, so the page stays
  // fully editable rather than locking on a value it never received.
  const editable = !cliReady || canUpdate;

  // Persist vars array to API
  const persistVars = useCallback(
    async (updated: EnvVar[]) => {
      if (!state.activeEnvName) return;
      setSaving(true);
      try {
        await (
          ProductService.SetEnvironmentVariables as (envName: string, vars: any[]) => Promise<void>
        )(
          state.activeEnvName,
          updated.map((v) => ({ label: v.label, value: v.value })),
        );
      } finally {
        setSaving(false);
      }
    },
    [state.activeEnvName],
  );

  const handleCreateVar = async (
    label: string,
    value: string,
    propagations?: PropagationTarget[],
  ) => {
    if (vars.some((v) => v.label === label)) {
      throw new Error(`Variable "${label}" already exists`);
    }
    const newId = String(Date.now());
    const previous = vars;
    const updated = [...vars, { id: newId, label, value }];
    setVars(updated);
    try {
      await persistVars(updated);
    } catch (err) {
      // The platform rejected the write, so drop the optimistic row. Keeping it
      // would leave a variable on screen that does not exist in the
      // environment, and it survives until the page is reloaded.
      setVars(previous);
      throw err;
    }

    // Propagate to other environments
    if (propagations && propagations.length > 0) {
      for (const target of propagations) {
        const existing = await (
          ProductService.GetEnvironmentVariables as (envName: string) => Promise<any[]>
        )(target.envName);
        const merged = [
          ...existing
            .filter((v: any) => v.label !== label)
            .map((v: any) => ({ label: v.label as string, value: v.value as string })),
          { label, value: target.value },
        ];
        await (
          ProductService.SetEnvironmentVariables as (envName: string, vars: any[]) => Promise<void>
        )(target.envName, merged);
      }
    }
  };

  const handleEditVar = async (_label: string, value: string) => {
    if (!editVar) return;
    const previous = vars;
    const updated = vars.map((v) => (v.id === editVar.id ? { ...v, value } : v));
    setVars(updated);
    try {
      await persistVars(updated);
    } catch (err) {
      // Same rollback as create: a rejected write must not leave the new value
      // showing as though it had been saved.
      setVars(previous);
      throw err;
    }
  };

  // Deleting a variable goes through `alis environment unset` rather than the
  // Console API's whole-array replace.
  //
  // That matters beyond tidiness: removing a variable is destructive, and the
  // platform gates it on the default automation tier. Rewriting the array
  // without the removed entry produces the same end state while bypassing that
  // gate entirely — and bypasses the production gate too. Going through unset
  // means the user sees what they are about to lose and approves it, which is
  // what the gate is for.
  //
  // The Console path stays as the fallback for when the CLI is unavailable.
  const deleteGate = useApprovalGate(() => {
    if (!deleteVar) return;
    setVars((prev) => prev.filter((v) => v.id !== deleteVar.id));
    setDeleteVar(null);
    notify.success(`Removed ${deleteVar.label}`);
  });

  const branchGate = useApprovalGate(() => {
    notify.success("Deploy branches updated");
  });

  // Saving a designation is gated like other environment writes, so it goes
  // through the same approval flow rather than a bare call.
  const saveBranches = async () => {
    const allow = branchesDraft
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    setBranchesOpen(false);
    const clear = allow.length === 0;
    await branchGate.run(
      (approval) =>
        ProductService.SetEnvironmentBranchesCLI(
          state.organisation,
          state.product,
          envId,
          allow,
          clear,
          approval,
        ),
      clear
        ? `Allow any branch to deploy to ${envId}`
        : `Restrict ${envId} to ${allow.join(", ")}`,
    );
    await loadBranches();
  };

  const handleDeleteVar = async () => {
    if (!deleteVar) return;
    const target = deleteVar;
    setDeleteLoading(true);
    setError(null);
    try {
      const envId = lastSegment(state.activeEnvName);
      const canUseCLI = Boolean(state.organisation && state.product && envId);

      if (canUseCLI) {
        const result = await deleteGate.run(
          (approval) =>
            ProductService.UnsetEnvironmentVariablesCLI(
              state.organisation,
              state.product,
              envId,
              [target.label],
              false,
              approval,
            ),
          `Remove ${target.label} from ${envId}`,
        );
        // A gate leaves the dialog open; the row is removed once it clears.
        if (!result) return;
        return;
      }

      const updated = vars.filter((v) => v.id !== target.id);
      setVars(updated);
      await persistVars(updated);
      setDeleteVar(null);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredVars = vars.filter(
    (v) =>
      v.label.toLowerCase().includes(filterText.toLowerCase()) ||
      v.value.toLowerCase().includes(filterText.toLowerCase()),
  );

  const columns = [
    {
      header: "LABEL",
      render: (item: EnvVar) => <span className="font-mono text-[11px]">{item.label}</span>,
      className: "w-[220px]",
    },
    {
      header: "VALUE",
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
                notify.success("Value copied to clipboard");
              }}
            >
              Copy
            </ActionButton>
          </div>
        </div>
      ),
      className: "w-[260px]",
    },
    {
      header: "Actions",
      render: (item: EnvVar) => {
        const others = state.loadedEnvs.filter((e) => e.name !== state.activeEnvName);
        const missingIn = others.filter((e) => !otherEnvLabels[e.name]?.has(item.label));
        const existsInAll = others.length > 0 && missingIn.length === 0;

        return (
          <div className="flex gap-[5px] items-center">
            <ActionButton
              onClick={() => {
                setEditVar(item);
                setVarSheetMode("edit");
                setVarSheetOpen(true);
              }}
            >
              Edit
            </ActionButton>

            {others.length > 0 &&
              (existsInAll ? (
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
                    Missing in: {missingIn.map((e) => e.displayName).join(", ")}
                  </TooltipContent>
                </Tooltip>
              ))}

            <ActionButton onClick={() => setDeleteVar(item)}>Delete</ActionButton>
          </div>
        );
      },
      className: "w-[210px]",
    },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-background">
      {/* Page Title Header */}
      <div className="px-[20px] py-[6px] border-b border-border flex items-center justify-between">
        <p className="font-mono font-bold text-[10px] text-foreground/50 uppercase">VARIABLES</p>
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
            disabled={!editable}
            title={editable ? undefined : "You need roles/environment.admin to change variables"}
            onClick={() => {
              setVarSheetMode("create");
              setEditVar(null);
              setVarSheetOpen(true);
            }}
          >
            New Variable
          </Button>
        </div>
      </Toolbar>

      {/* Deploy-branch designation. No Console API equivalent — this is what a
          build or deploy is checked against, and what --allow-branch-mismatch
          overrides. */}
      {cliReady && branches !== null && (
        <div className="flex items-center gap-[10px] px-[20px] py-[7px] border-b border-border bg-card/40">
          <Icon icon="solar:branch-linear" className="text-foreground/30 text-[13px]" />
          <span className="text-[9px] text-foreground/30 font-mono uppercase tracking-[0.1em]">
            Deploys from
          </span>
          {branches.length === 0 ? (
            <span className="text-[10px] text-foreground/45 font-mono">any branch</span>
          ) : (
            <div className="flex items-center gap-[5px] flex-wrap">
              {branches.map((b) => (
                <span
                  key={b}
                  className="text-[9px] font-mono px-[6px] py-[1px] bg-card border border-border text-foreground/70"
                >
                  {b}
                </span>
              ))}
            </div>
          )}
          <div className="flex-1" />
          <button
            onClick={() => {
              setBranchesDraft(branches.join(", "));
              setBranchesOpen(true);
            }}
            className="text-[9px] text-foreground/35 hover:text-brand font-mono transition-colors"
          >
            Edit
          </button>
        </div>
      )}

      {!editable && (
        <div className="flex items-center gap-[7px] px-[20px] py-[7px] border-b border-border bg-amber-400/5">
          <Icon icon="solar:lock-keyhole-linear" className="text-amber-400 text-[12px]" />
          <span className="text-[10px] text-amber-300/80 font-mono">
            Read-only — changing variables needs roles/environment.admin
          </span>
        </div>
      )}

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
          <Table columns={columns} data={filteredVars} rowId={(v) => v.id} />
        )}
      </div>

      {/* Variable create/edit sheet */}
      <VarFormSheet
        open={varSheetOpen}
        onOpenChange={setVarSheetOpen}
        mode={varSheetMode}
        initialLabel={varSheetMode === "edit" ? (editVar?.label ?? "") : ""}
        initialValue={varSheetMode === "edit" ? (editVar?.value ?? "") : ""}
        onSubmit={varSheetMode === "create" ? handleCreateVar : handleEditVar}
        loadedEnvs={varSheetMode === "create" ? state.loadedEnvs : undefined}
        currentEnvName={varSheetMode === "create" ? state.activeEnvName : undefined}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteVar)}
        onOpenChange={(open) => {
          if (!open) setDeleteVar(null);
        }}
        title="Delete Variable"
        description={
          <>
            Delete <span className="text-foreground font-mono">{deleteVar?.label}</span>? This
            cannot be undone.
          </>
        }
        confirmLabel="Delete"
        loading={deleteLoading}
        onConfirm={handleDeleteVar}
        requireText={deleteVar?.label}
      />

      {/* Branch designation editor. Setting a designation REPLACES the list
          rather than adding to it, so the dialog always submits the complete
          set — which is why it edits the whole list as text. */}
      <Dialog open={branchesOpen} onOpenChange={setBranchesOpen}>
        <DialogContent className="text-foreground p-0 gap-0 sm:max-w-[480px]">
          <DialogHeader className="px-[20px] py-[14px] border-b border-border">
            <div className="flex items-center gap-[10px]">
              <Icon icon="solar:branch-linear" className="text-brand text-xl" />
              <DialogTitle className="text-foreground font-mono text-[13px] font-bold">
                Deploy Branches
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="px-[20px] py-[16px] flex flex-col gap-[10px]">
            <p className="text-[10px] leading-[1.6] text-foreground/50 font-mono">
              Only these branches may deploy to this environment. Leave empty to allow any
              branch. A deploy from another branch fails unless it is run with
              --allow-branch-mismatch.
            </p>
            <input
              value={branchesDraft}
              onChange={(e) => setBranchesDraft(e.target.value)}
              placeholder="master, release"
              className="bg-card border border-border px-[10px] py-[7px] text-[11px] text-foreground font-mono outline-none focus:border-brand-fill/40 placeholder:text-foreground/25"
            />
            <span className="text-[9px] text-foreground/25 font-mono">
              Comma-separated. This replaces the current designation.
            </span>
          </div>

          <div className="flex items-center justify-end gap-[8px] px-[20px] py-[12px] border-t border-border">
            <Button variant="ghost" onClick={() => setBranchesOpen(false)} className="text-[10px]">
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void saveBranches()} className="text-[10px]">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approval gate. `alis environment unset` is destructive, so the default
          automation tier stops it and asks; production environments always do. */}
      <ApprovalGateDialog {...deleteGate.dialogProps} />
      <ApprovalGateDialog {...branchGate.dialogProps} />

      {/* View value modal */}
      <Dialog
        open={Boolean(viewVar)}
        onOpenChange={(o) => {
          if (!o) setViewVar(null);
        }}
      >
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
              onClick={() => {
                if (viewVar) {
                  navigator.clipboard.writeText(viewVar.value);
                  notify.success("Value copied to clipboard");
                }
              }}
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
        onOpenChange={(o) => {
          if (!o) setDuplicateVar(null);
        }}
        varLabel={duplicateVar?.label ?? ""}
        varValue={duplicateVar?.value ?? ""}
        sourceEnvName={state.activeEnvName}
        loadedEnvs={state.loadedEnvs}
      />
    </div>
  );
}
