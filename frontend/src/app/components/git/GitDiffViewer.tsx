import { useMemo } from 'react';
import { useSourceControl } from '../../stores/sourceControl';
import { DiffFile, DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view-pure.css';
import { Columns2, AlignJustify } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { GitFileDiff } from './types';

interface Props {
  diff: GitFileDiff | null;
  filePath: string | null;
  staged: boolean;
  commitHash?: string | null;
}

export function GitDiffViewer({ diff, filePath, staged, commitHash }: Props) {
  const { state: scState, setDiffView } = useSourceControl();
  const splitMode = scState.diffView === 'split';

  const diffFile = useMemo(() => {
    if (!diff || !filePath) return null;
    const file = DiffFile.createInstance({
      oldFile: { fileName: filePath, fileLang: diff.language, content: diff.oldContent },
      newFile: { fileName: filePath, fileLang: diff.language, content: diff.newContent },
      hunks: diff.hunks,
    });
    file.init();
    file.buildUnifiedDiffLines();
    file.buildSplitDiffLines();
    return file;
  }, [diff, filePath]);

  if (!diffFile || !filePath) {
    return (
      <div className="flex items-center justify-center h-full text-foreground/20 text-sm select-none">
        Select a file to view changes
      </div>
    );
  }

  const allLines = diff!.hunks.flatMap(h => h.split('\n'));
  const addCount = allLines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
  const delCount = allLines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-foreground/10 text-xs text-foreground/60">
        <span className="truncate font-mono">{filePath}</span>
        <span className="shrink-0 text-foreground/30">
          {commitHash ? `@${commitHash.slice(0, 7)}` : staged ? '(staged)' : '(unstaged)'}
        </span>
        {diff!.hunks.length > 0 && (
          <span className="shrink-0 text-foreground/30">
            +{addCount} -{delCount}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setDiffView('unified')}
                className={`p-1 rounded transition-colors ${!splitMode ? 'text-foreground/80 bg-foreground/10' : 'text-foreground/30 hover:text-foreground/50'}`}
              >
                <AlignJustify size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Unified</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setDiffView('split')}
                className={`p-1 rounded transition-colors ${splitMode ? 'text-foreground/80 bg-foreground/10' : 'text-foreground/30 hover:text-foreground/50'}`}
              >
                <Columns2 size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Split</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-auto" style={{ '--diff-plain-content--': '#1e1e1e', '--diff-plain-lineNumber--': '#1e1e1e' } as React.CSSProperties}>
        <DiffView
          diffFile={diffFile}
          diffViewTheme="dark"
          diffViewMode={splitMode ? DiffModeEnum.Split : DiffModeEnum.Unified}
          diffViewHighlight
          diffViewFontSize={11}
        />
      </div>
    </div>
  );
}
