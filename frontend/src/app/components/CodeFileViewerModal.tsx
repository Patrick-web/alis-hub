import { useState, useEffect } from "react";
import { codeToHtml } from "shiki";
import { Icon } from "@iconify/react";
import { Loader } from "./Loader";

export function extToLang(filename: string): string {
  const name = filename.split("/").pop() ?? filename;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (name === "Dockerfile" || name.startsWith("Dockerfile.")) return "dockerfile";
  if (name === "Makefile" || name === "makefile") return "makefile";
  if (name === "go.mod" || name === "go.sum") return "go";
  const map: Record<string, string> = {
    go: "go",
    proto: "protobuf",
    tf: "hcl",
    hcl: "hcl",
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    sh: "bash",
    md: "markdown",
    py: "python",
    rs: "rust",
    sql: "sql",
    toml: "toml",
    xml: "xml",
    html: "html",
    css: "css",
  };
  return map[ext] ?? "text";
}

export function FileViewerModal({
  file,
  onClose,
}: {
  file: { name: string; content: string };
  onClose: () => void;
}) {
  const [html, setHtml] = useState<string>("");
  const [hlLoading, setHlLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const lang = extToLang(file.name);
    codeToHtml(file.content || " ", { lang, theme: "github-dark" })
      .then((result) => {
        if (!cancelled) {
          setHtml(result);
          setHlLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          codeToHtml(file.content || " ", {
            lang: "text",
            theme: "github-dark",
          })
            .then((r) => {
              if (!cancelled) {
                setHtml(r);
                setHlLoading(false);
              }
            })
            .catch(() => {
              if (!cancelled) setHlLoading(false);
            });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file.name, file.content]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const shortName = file.name.split("/").pop() ?? file.name;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-muted/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-[20px] py-[12px] border-b border-border shrink-0">
        <div className="flex items-center gap-[10px]">
          <Icon icon="solar:file-code-linear" className="text-foreground/50 text-base" />
          <span className="font-mono text-[13px] text-foreground">{shortName}</span>
          {shortName !== file.name && (
            <span className="text-[11px] text-foreground/30 font-mono">{file.name}</span>
          )}
          <span className="text-[10px] font-bold uppercase text-foreground/30 border border-foreground/15 rounded px-[6px] py-[1px]">
            {extToLang(file.name)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-[6px] text-[11px] text-foreground/50 hover:text-foreground/80 transition-colors border border-foreground/15 hover:border-foreground/30 rounded px-[10px] py-[4px]"
        >
          <Icon icon="solar:close-circle-linear" className="text-xs" />
          Close
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {hlLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        ) : html ? (
          <div
            className="shiki-container p-[24px] text-[12px] leading-[1.6] font-mono min-h-full"
            dangerouslySetInnerHTML={{ __html: html }}
            style={{ "--shiki-dark-bg": "#1a1a1a" } as React.CSSProperties}
          />
        ) : (
          <pre className="p-[24px] text-[12px] text-foreground/70 font-mono whitespace-pre-wrap leading-[1.6]">
            {file.content}
          </pre>
        )}
      </div>
    </div>
  );
}
