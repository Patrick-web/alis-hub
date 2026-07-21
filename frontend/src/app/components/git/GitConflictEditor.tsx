import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import * as GitService from "../../../../bindings/alis-hub-v3/gitservice";
import { Loader } from "../Loader";

interface ConflictHunk {
  index: number;
  before: string[];
  current: string[];
  incoming: string[];
  after: string[];
}

interface ConflictFileContent {
  path: string;
  hunks: ConflictHunk[];
}

interface Props {
  repoPath: string;
  conflictFiles: string[];
  initialFile?: string;
  onComplete: () => void;
  onAbort: () => void;
}

export function GitConflictEditor({
  repoPath,
  conflictFiles,
  initialFile,
  onComplete,
  onAbort,
}: Props) {
  const startFile =
    initialFile && conflictFiles.includes(initialFile) ? initialFile : (conflictFiles[0] ?? "");
  const [selectedFile, setSelectedFile] = useState(startFile);
  const [conflictContent, setConflictContent] = useState<ConflictFileContent | null>(null);
  const [hunkResolutions, setHunkResolutions] = useState<Record<string, (string[] | null)[]>>({});
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [aborting, setAborting] = useState(false);

  useEffect(() => {
    if (startFile) loadFile(startFile);
  }, []);

  function loadFile(fp: string) {
    setSelectedFile(fp);
    setConflictContent(null);
    (GitService.GetConflictContent as (rp: string, fp: string) => Promise<ConflictFileContent>)(
      repoPath,
      fp,
    )
      .then((content) => {
        setConflictContent(content);
        setHunkResolutions((prev) => {
          if (prev[fp]) return prev;
          return { ...prev, [fp]: Array(content.hunks.length).fill(null) };
        });
      })
      .catch((e) => setError(String(e)));
  }

  function resolveHunk(fp: string, idx: number, lines: string[] | null) {
    setHunkResolutions((prev) => {
      const arr = [...(prev[fp] ?? [])];
      arr[idx] = lines;
      return { ...prev, [fp]: arr };
    });
  }

  function acceptAllCurrent() {
    if (!conflictContent) return;
    conflictContent.hunks.forEach((h, i) => resolveHunk(selectedFile, i, h.current));
  }

  function acceptAllIncoming() {
    if (!conflictContent) return;
    conflictContent.hunks.forEach((h, i) => resolveHunk(selectedFile, i, h.incoming));
  }

  function saveFile(fp: string) {
    const resolutions = hunkResolutions[fp];
    if (!resolutions?.every((r) => r !== null)) return;
    const hunkStrings = resolutions.map((r) => (r ?? []).join("\n"));
    (GitService.SaveConflictResolution as (rp: string, fp: string, res: string[]) => Promise<void>)(
      repoPath,
      fp,
      hunkStrings,
    )
      .then(() => setResolvedFiles((prev) => new Set([...prev, fp])))
      .catch((e) => setError(String(e)));
  }

  function handleComplete() {
    setCompleting(true);
    (GitService.CompleteMerge as (rp: string) => Promise<void>)(repoPath)
      .then(onComplete)
      .catch((e) => {
        setError(String(e));
        setCompleting(false);
      });
  }

  function handleAbort() {
    setAborting(true);
    (GitService.AbortMerge as (rp: string) => Promise<void>)(repoPath)
      .then(onAbort)
      .catch((e) => {
        setError(String(e));
        setAborting(false);
      });
  }

  const fileResolutions = hunkResolutions[selectedFile] ?? [];
  const allHunksResolved =
    conflictContent !== null &&
    fileResolutions.length === conflictContent.hunks.length &&
    fileResolutions.every((r) => r !== null);
  const isFileSaved = resolvedFiles.has(selectedFile);
  const allFilesResolved = resolvedFiles.size >= conflictFiles.length;

  return (
    <div className="flex flex-col border-t border-border" style={{ minHeight: 360 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-amber-500/5">
        <div className="flex items-center gap-2">
          <Icon icon="solar:danger-triangle-linear" className="text-amber-400 text-sm" />
          <span className="text-[11px] font-semibold text-amber-400">
            Merge Conflicts — {conflictFiles.length} file{conflictFiles.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAbort}
            disabled={aborting || completing}
            className="text-[10px] px-[8px] py-[2px] rounded-[3px] border border-red-400/30 hover:border-red-400/60 text-red-400 transition-colors disabled:opacity-40"
          >
            {aborting ? "Aborting…" : "Abort Merge"}
          </button>
          <button
            onClick={handleComplete}
            disabled={!allFilesResolved || completing || aborting}
            className="text-[10px] px-[8px] py-[2px] rounded-[3px] border border-green-400/30 hover:border-green-400/60 text-green-400 transition-colors disabled:opacity-40"
          >
            {completing ? "Completing…" : "Complete Merge"}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-[10px] text-red-400 font-mono">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: file list */}
        <div className="w-[160px] shrink-0 border-r border-border flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto py-1">
            {conflictFiles.map((fp) => {
              const saved = resolvedFiles.has(fp);
              const res = hunkResolutions[fp] ?? [];
              const unresolved = res.filter((r) => r === null).length;
              const isActive = fp === selectedFile;
              const fileName = fp.split("/").pop() ?? fp;
              return (
                <button
                  key={fp}
                  onClick={() => loadFile(fp)}
                  className={`w-full flex items-center gap-1.5 px-3 py-[6px] text-left transition-colors ${isActive ? "bg-foreground/8 text-foreground" : "text-foreground/60 hover:bg-foreground/4 hover:text-foreground/80"}`}
                >
                  {saved ? (
                    <Icon
                      icon="solar:check-circle-bold"
                      className="text-green-400 text-xs shrink-0"
                    />
                  ) : (
                    <span className="w-4 h-4 shrink-0 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold leading-none">
                      {unresolved > 0 ? unresolved : "!"}
                    </span>
                  )}
                  <span className="text-[11px] font-mono truncate">{fileName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: hunk editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-[6px] border-b border-border shrink-0 gap-2">
            <span className="text-[10px] font-mono text-foreground/40 truncate">
              {selectedFile}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={acceptAllCurrent}
                className="text-[10px] px-[7px] py-[2px] rounded-[3px] bg-green-900/30 text-green-300 hover:bg-green-900/50 transition-colors border border-green-700/30"
              >
                Accept All Current
              </button>
              <button
                onClick={acceptAllIncoming}
                className="text-[10px] px-[7px] py-[2px] rounded-[3px] bg-blue-900/30 text-blue-300 hover:bg-blue-900/50 transition-colors border border-blue-700/30"
              >
                Accept All Incoming
              </button>
              {allHunksResolved && !isFileSaved && (
                <button
                  onClick={() => saveFile(selectedFile)}
                  className="text-[10px] px-[7px] py-[2px] rounded-[3px] bg-brand-fill/20 text-brand hover:bg-brand-fill/30 transition-colors border border-brand-fill/30"
                >
                  Save File
                </button>
              )}
              {isFileSaved && (
                <span className="text-[10px] text-green-400 flex items-center gap-1">
                  <Icon icon="solar:check-circle-bold" className="text-xs" /> Saved
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto font-mono text-[11px]">
            {!conflictContent ? (
              <div className="flex items-center justify-center h-full text-foreground/30">
                <Loader size={20} />
              </div>
            ) : (
              <ConflictHunkView
                content={conflictContent}
                resolutions={fileResolutions}
                onResolve={(idx, lines) => resolveHunk(selectedFile, idx, lines)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConflictHunkView({
  content,
  resolutions,
  onResolve,
}: {
  content: ConflictFileContent;
  resolutions: (string[] | null)[];
  onResolve: (idx: number, lines: string[] | null) => void;
}) {
  const parts: React.ReactNode[] = [];

  content.hunks.forEach((hunk, idx) => {
    const resolved = resolutions[idx];

    if (hunk.before.length > 0) {
      parts.push(
        <div key={`before-${idx}`}>
          {hunk.before.map((line, i) => (
            <div key={i} className="px-3 py-[1px] text-foreground/50 leading-[1.6]">
              {line || " "}
            </div>
          ))}
        </div>,
      );
    }

    if (resolved !== null) {
      parts.push(
        <div key={`resolved-${idx}`} className="border-l-2 border-foreground/20 my-[2px]">
          <div className="flex items-center gap-2 px-3 py-1 bg-foreground/5">
            <Icon icon="solar:check-circle-bold" className="text-green-400 text-xs" />
            <span className="text-[10px] text-foreground/40">Resolved</span>
            <button
              onClick={() => onResolve(idx, null)}
              className="text-[10px] text-foreground/30 hover:text-foreground/60 transition-colors ml-auto"
            >
              Undo
            </button>
          </div>
          {resolved.map((line, i) => (
            <div key={i} className="px-3 py-[1px] text-foreground/70 leading-[1.6]">
              {line || " "}
            </div>
          ))}
        </div>,
      );
    } else {
      parts.push(
        <div key={`hunk-${idx}`} className="my-[2px]">
          <div className="flex items-center gap-1.5 px-3 py-[5px] bg-muted border-y border-border">
            <button
              onClick={() => onResolve(idx, hunk.current)}
              className="text-[10px] px-[7px] py-[2px] rounded-[3px] bg-green-900/40 text-green-300 hover:bg-green-900/60 transition-colors border border-green-700/30"
            >
              Accept Current
            </button>
            <button
              onClick={() => onResolve(idx, hunk.incoming)}
              className="text-[10px] px-[7px] py-[2px] rounded-[3px] bg-blue-900/40 text-blue-300 hover:bg-blue-900/60 transition-colors border border-blue-700/30"
            >
              Accept Incoming
            </button>
            <button
              onClick={() => onResolve(idx, [...hunk.current, ...hunk.incoming])}
              className="text-[10px] px-[7px] py-[2px] rounded-[3px] bg-foreground/5 text-foreground/50 hover:bg-foreground/10 transition-colors border border-foreground/15"
            >
              Accept Both
            </button>
          </div>
          <div className="bg-green-950/30 border-l-[3px] border-green-500">
            <div className="flex items-center gap-1.5 px-3 py-[3px] bg-green-900/20">
              <Icon icon="solar:arrow-up-linear" className="text-green-400 text-xs" />
              <span className="text-[10px] text-green-400 font-bold">Current Change (HEAD)</span>
            </div>
            {hunk.current.map((line, i) => (
              <div key={i} className="px-3 py-[1px] text-green-100/80 leading-[1.6]">
                {line || " "}
              </div>
            ))}
          </div>
          <div className="flex items-center px-3 py-[2px] bg-muted">
            <div className="flex-1 h-[1px] bg-foreground/10" />
            <span className="px-2 text-[9px] text-foreground/20 uppercase tracking-widest">
              =======
            </span>
            <div className="flex-1 h-[1px] bg-foreground/10" />
          </div>
          <div className="bg-blue-950/30 border-l-[3px] border-blue-500">
            <div className="flex items-center gap-1.5 px-3 py-[3px] bg-blue-900/20">
              <Icon icon="solar:arrow-down-linear" className="text-blue-400 text-xs" />
              <span className="text-[10px] text-blue-400 font-bold">Incoming Change</span>
            </div>
            {hunk.incoming.map((line, i) => (
              <div key={i} className="px-3 py-[1px] text-blue-100/80 leading-[1.6]">
                {line || " "}
              </div>
            ))}
          </div>
        </div>,
      );
    }

    if (idx === content.hunks.length - 1 && hunk.after.length > 0) {
      parts.push(
        <div key={`after-${idx}`}>
          {hunk.after.map((line, i) => (
            <div key={i} className="px-3 py-[1px] text-foreground/50 leading-[1.6]">
              {line || " "}
            </div>
          ))}
        </div>,
      );
    }
  });

  return <div className="py-1">{parts}</div>;
}
