import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { HammerIcon, RocketIcon, FileCodeIcon, PackageIcon } from 'lucide-react';
import { useWorkspace } from '../../stores/workspace';
import { useDevelopTabs } from '../../stores/developTabs';
import { useCommandPalette, type CommandItem } from '../../stores/commandPalette';
import type { TaskType } from '../../stores/notifications';

const TASK_TYPES: TaskType[] = ['define', 'build', 'deploy', 'packages'];

// 'workflow' is excluded from TASK_TYPES below (workflows aren't opened as Develop
// tabs), but TYPE_META is keyed on the full TaskType union so TS stays exhaustive.
const TYPE_META: Record<TaskType, { label: string; groupOrder: number; icon: React.ComponentType<{ className?: string }> }> = {
  define:   { label: 'Define',   groupOrder: 10, icon: FileCodeIcon },
  build:    { label: 'Build',    groupOrder: 11, icon: HammerIcon },
  deploy:   { label: 'Deploy',   groupOrder: 12, icon: RocketIcon },
  packages: { label: 'Packages', groupOrder: 13, icon: PackageIcon },
  workflow: { label: 'Workflow', groupOrder: 14, icon: FileCodeIcon },
};

export function DevelopCommandsExtension() {
  const { state } = useWorkspace();
  const { openTab } = useDevelopTabs();
  const { registerExtension, unregisterExtension } = useCommandPalette();
  const navigate = useNavigate();

  useEffect(() => {
    const neurons = state.neurons ?? [];
    const commands: CommandItem[] = neurons.flatMap(n =>
      TASK_TYPES.map(type => {
        const meta = TYPE_META[type];
        const neuronName = n.name || n.id;
        return {
          id: `develop-${type}-${neuronName}`,
          title: `${meta.label} · ${neuronName}`,
          group: meta.label,
          groupOrder: meta.groupOrder,
          icon: meta.icon,
          keywords: [type, neuronName, 'service', 'develop'],
          onSelect: (ctx) => {
            openTab(type, neuronName);
            ctx.showResult({
              title: `${meta.label} · ${neuronName} triggered`,
              subtitle: 'Running in background',
              actions: [
                {
                  label: 'Go to Develop',
                  variant: 'primary',
                  onAction: () => { navigate('/develop'); ctx.close(); },
                },
                {
                  label: 'Dismiss',
                  variant: 'secondary',
                  onAction: () => ctx.close(),
                },
              ],
            });
          },
        };
      })
    );
    registerExtension({ id: 'develop-actions', commands });
    return () => unregisterExtension('develop-actions');
  }, [state.neurons, openTab, navigate, registerExtension, unregisterExtension]);

  return null;
}
