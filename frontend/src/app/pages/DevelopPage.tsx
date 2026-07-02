import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '@iconify/react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { EmptyState } from '../components/EmptyState';
import { useWorkspace } from '../stores/workspace';
import { useNotifications } from '../stores/notifications';
import { useDevelopTabs } from '../stores/developTabs';
import * as ProductService from '../../../bindings/alis-hub-v3/productservice';
import * as BuildService from '../../../bindings/alis-hub-v3/buildservice';
import { useDevelopSettings } from '../stores/developSettings';
import { Loader } from '../components/Loader';

export function DevelopPage() {
  const { state, setNeurons } = useWorkspace();
  const { focusTaskId, setFocusTaskId, pendingOpen, setPendingOpen, state: notifState } = useNotifications();
  const { tabs, openTab, activateTab } = useDevelopTabs();
  const { settings: devSettings } = useDevelopSettings();

  const [neuronFilter, setNeuronFilter] = useState('');
  const [selectedNeurons, setSelectedNeurons] = useState<Set<string>>(new Set());
  const [commitTimes, setCommitTimes] = useState<Record<string, string>>({});
  const [commitTimesLoading, setCommitTimesLoading] = useState(false);
  const commitTimesBranchRef = useRef<string>('');

  useEffect(() => {
    if (!state.organisation || !state.product) return;
    (async () => {
      try {
        const overview = await ProductService.GetServicesOverview(state.organisation, state.product);
        if (overview && Array.isArray(overview.neurons) && overview.neurons.length > 0) {
          setNeurons(overview.neurons.map((n: { id: string; state: number; version: string }) => ({
            id: n.id, name: n.id, type: 2, state: n.state, latestBuild: n.version, envs: [],
          })));
        }
      } catch {
        // fall back to workspace neurons
      }
    })();
  }, [state.organisation, state.product]);

  // Activate or restore the correct tab when navigating back via a notification action
  useEffect(() => {
    if (!focusTaskId) return;
    setFocusTaskId(null);
    const n = notifState.notifications.find(notif => notif.id === focusTaskId);
    if (!n?.task) return;
    const existing = tabs.find(t => t.notificationId === focusTaskId);
    if (existing) { activateTab(existing.id); return; }
    openTab(n.task.type, n.task.neuronId, n);
  }, [focusTaskId]);

  // Open a tab when navigated here via a notification action button (e.g. "Deploy")
  useEffect(() => {
    if (!pendingOpen) return;
    setPendingOpen(null);
    openTab(pendingOpen.type, pendingOpen.neuron);
  }, [pendingOpen]);

  // Fetch commit times from the build repo whenever smart sort is enabled.
  // Used as primary data for 'committed' and as fallback for the other keys.
  useEffect(() => {
    if (!devSettings.smartSortEnabled) return;
    if (!state.organisation || !state.product) return;

    (async () => {
      setCommitTimesLoading(true);
      try {
        const branch = devSettings.defaultBranch === 'local'
          ? await BuildService.GetCurrentBranch(state.organisation, state.product).catch(() => 'master')
          : (devSettings.defaultBranch || 'master');
        commitTimesBranchRef.current = branch as string;
        const times = await BuildService.GetNeuronLastCommitTimes(state.organisation, state.product, branch as string);
        console.log('[smart-sort] fetched commit times', { branch, defaultBranchSetting: devSettings.defaultBranch, times });
        setCommitTimes((times as Record<string, string>) ?? {});
      } catch (err) {
        console.log('[smart-sort] failed to fetch commit times', err);
      } finally {
        setCommitTimesLoading(false);
      }
    })();
  }, [devSettings.smartSortEnabled, devSettings.defaultBranch, state.organisation, state.product]);

  const visibleNeurons = state.neurons.filter(n =>
    !neuronFilter || (n.name || n.id).toLowerCase().includes(neuronFilter.toLowerCase())
  );

  const sortedNeurons = useMemo(() => {
    if (!devSettings.smartSortEnabled) return visibleNeurons;

    const key = devSettings.smartSortKey;

    // Helper: convert an ISO-8601 string from commitTimes to a ms timestamp (0 if missing).
    const commitMs = (neuronName: string): number => {
      const iso = commitTimes[neuronName];
      if (!iso) return 0;
      const t = Date.parse(iso);
      return isNaN(t) ? 0 : t;
    };

    if (key === 'committed') {
      const sorted = [...visibleNeurons].sort((a, b) => {
        const ta = commitMs(a.name || a.id);
        const tb = commitMs(b.name || b.id);
        return tb - ta;
      });
      console.log('[smart-sort] key=committed', {
        neuronNames: visibleNeurons.map(n => n.name || n.id),
        commitTimeKeys: Object.keys(commitTimes),
        perNeuron: visibleNeurons.map(n => ({ name: n.name || n.id, ms: commitMs(n.name || n.id) })),
        sortedOrder: sorted.map(n => n.name || n.id),
      });
      return sorted;
    }

    // For defined/built/deployed: use notification timestamps as the primary signal,
    // with build-repo commit times as a reliable fallback so the sort always has data.
    const taskType = key === 'defined' ? 'define' : key === 'built' ? 'build' : 'deploy';
    const notifTimestamps = new Map<string, number>();
    for (const n of notifState.notifications) {
      if (n.task?.type === taskType && n.task.startedAt) {
        const existing = notifTimestamps.get(n.task.neuronId) ?? 0;
        if (n.task.startedAt > existing) notifTimestamps.set(n.task.neuronId, n.task.startedAt);
      }
    }

    const sorted = [...visibleNeurons].sort((a, b) => {
      const name_a = a.name || a.id;
      const name_b = b.name || b.id;
      // Prefer notification timestamp; fall back to git commit time.
      const ta = Math.max(notifTimestamps.get(name_a) ?? 0, commitMs(name_a));
      const tb = Math.max(notifTimestamps.get(name_b) ?? 0, commitMs(name_b));
      return tb - ta;
    });
    console.log(`[smart-sort] key=${key} taskType=${taskType}`, {
      neuronNames: visibleNeurons.map(n => n.name || n.id),
      notifTimestamps: Object.fromEntries(notifTimestamps),
      commitTimeKeys: Object.keys(commitTimes),
      perNeuron: visibleNeurons.map(n => {
        const name = n.name || n.id;
        return { name, notifMs: notifTimestamps.get(name) ?? 0, commitMs: commitMs(name) };
      }),
      sortedOrder: sorted.map(n => n.name || n.id),
    });
    return sorted;
  }, [visibleNeurons, devSettings.smartSortEnabled, devSettings.smartSortKey, notifState.notifications, commitTimes]);
  const allVisibleSelected = sortedNeurons.length > 0 && sortedNeurons.every(n => selectedNeurons.has(n.name || n.id));
  const someVisibleSelected = sortedNeurons.some(n => selectedNeurons.has(n.name || n.id));

  const toggleNeuron = (name: string) => setSelectedNeurons(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedNeurons(prev => {
        const next = new Set(prev);
        sortedNeurons.forEach(n => next.delete(n.name || n.id));
        return next;
      });
    } else {
      setSelectedNeurons(prev => {
        const next = new Set(prev);
        sortedNeurons.forEach(n => next.add(n.name || n.id));
        return next;
      });
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-background">
      {/* Page header */}
      <div className="px-[20px] py-[6px] border-b border-border flex items-center justify-between">
        <p className="font-mono font-bold text-[10px] text-foreground/50 uppercase">
          SERVICES
        </p>
        {devSettings.smartSortEnabled && (
          <div className="flex items-center gap-[5px]">
            {commitTimesLoading && <Loader size={10} />}
            <span className="text-[9px] font-mono text-foreground/30 uppercase tracking-wide">
              ↑ {devSettings.smartSortKey}
            </span>
          </div>
        )}
      </div>

      {/* Filter toolbar */}
      <div className="border-b border-border px-[20px] py-[8px] flex items-center gap-[8px] shrink-0">
        <div className="flex items-center h-[34px]">
          <div className="bg-card border border-border px-[12px] h-full flex items-center justify-center border-r-0 rounded-l-[4px]">
            <p className="text-[12px] text-foreground">/</p>
          </div>
          <Input
            placeholder="Filter services..."
            value={neuronFilter}
            onChange={(e) => setNeuronFilter(e.target.value)}
            className="w-[260px] border-l-0 rounded-l-none h-full"
            containerClassName="h-full"
          />
        </div>
        <div className="ml-auto">
          {selectedNeurons.size > 0 && (
            <button
              onClick={() => {
                openTab('packages', Array.from(selectedNeurons).join(','));
                setSelectedNeurons(new Set());
              }}
              className="flex items-center gap-[6px] px-[12px] h-[34px] bg-[rgba(248,129,169,0.1)] border border-[rgba(248,129,169,0.3)] rounded-[4px] text-brand hover:bg-[rgba(248,129,169,0.15)] transition-colors text-[11px] font-bold font-mono uppercase"
            >
              <Icon icon="solar:box-linear" className="text-base" />
              Packages · {selectedNeurons.size}
            </button>
          )}
        </div>
      </div>

      {/* Services table */}
      <div className="flex-1 overflow-y-auto">
        {state.neurons.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState icon="solar:server-minimalistic-linear" title="No services found" />
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b border-border">
                <th className="px-[16px] py-[8px] w-[40px]">
                  <button
                    onClick={toggleAllVisible}
                    className={`size-[14px] rounded-[3px] border flex items-center justify-center transition-colors ${
                      allVisibleSelected
                        ? 'bg-brand border-brand'
                        : someVisibleSelected
                          ? 'border-brand bg-[rgba(248,129,169,0.15)]'
                          : 'border-border hover:border-[rgba(248,129,169,0.5)]'
                    }`}
                  >
                    {allVisibleSelected && <Icon icon="solar:check-linear" className="text-black text-[8px]" />}
                    {someVisibleSelected && !allVisibleSelected && <span className="block w-[6px] h-[2px] bg-brand rounded-full" />}
                  </button>
                </th>
                <th className="text-left px-[20px] py-[8px]">
                  <span className="text-[10px] font-bold font-mono text-foreground/40 uppercase">Service</span>
                </th>
                <th className="text-left px-[16px] py-[8px] w-[100px]">
                  <span className="text-[10px] font-bold font-mono text-foreground/40 uppercase">Version</span>
                </th>
                <th className="text-left px-[16px] py-[8px] w-[260px]">
                  <span className="text-[10px] font-bold font-mono text-foreground/40 uppercase">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedNeurons.map(neuron => {
                const name = neuron.name || neuron.id;
                const isSelected = selectedNeurons.has(name);
                return (
                  <tr
                    key={name}
                    className={`border-b border-border transition-colors ${isSelected ? 'bg-[rgba(248,129,169,0.04)]' : 'hover:bg-foreground/[2%]'}`}
                  >
                    <td className="px-[16px] py-[10px]">
                      <button
                        onClick={() => toggleNeuron(name)}
                        className={`size-[14px] rounded-[3px] border flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-brand border-brand'
                            : 'border-border hover:border-[rgba(248,129,169,0.5)]'
                        }`}
                      >
                        {isSelected && <Icon icon="solar:check-linear" className="text-black text-[8px]" />}
                      </button>
                    </td>
                    <td className="px-[20px] py-[10px]">
                      <div className="flex items-center gap-[8px]">
                        <div className={`size-[7px] rounded-full shrink-0 ${neuron.state === 1 ? 'bg-success' : neuron.state === 4 ? 'bg-warning' : 'bg-destructive'}`} />
                        <span className="text-[12px] font-bold font-mono text-foreground">{name}</span>
                      </div>
                    </td>
                    <td className="px-[16px] py-[10px]">
                      {neuron.latestBuild ? (
                        <span className="text-[10px] font-mono text-foreground/40 bg-card border border-border px-[6px] py-[2px]">
                          {neuron.latestBuild}
                        </span>
                      ) : (
                        <span className="text-[10px] text-foreground/20">—</span>
                      )}
                    </td>
                    <td className="px-[16px] py-[10px]">
                      <div className="flex items-center gap-[6px]">
                        <Button
                          variant="secondary"
                          className="px-[10px] py-[5px] h-[28px] uppercase text-[9px] font-bold"
                          icon={<Icon icon="solar:document-text-linear" className="text-sm" />}
                          onClick={() => openTab('define', name)}
                        >
                          Define
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-[10px] py-[5px] h-[28px] uppercase text-[9px] font-bold"
                          icon={<Icon icon="solar:code-linear" className="text-sm" />}
                          onClick={() => openTab('build', name)}
                        >
                          Build
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-[10px] py-[5px] h-[28px] uppercase text-[9px] font-bold"
                          icon={<Icon icon="solar:cloud-upload-linear" className="text-sm" />}
                          onClick={() => openTab('deploy', name)}
                        >
                          Deploy
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-[10px] py-[5px] h-[28px] uppercase text-[9px] font-bold"
                          icon={<Icon icon="solar:box-linear" className="text-sm" />}
                          onClick={() => openTab('packages', name)}
                        >
                          Packages
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
