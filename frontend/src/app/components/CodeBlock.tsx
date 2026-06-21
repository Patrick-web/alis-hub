interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  className?: string;
}

export function CodeBlock({ code, language = 'plaintext', title, className = '' }: CodeBlockProps) {
  return (
    <div className={`bg-background border border-border rounded-[4px] overflow-hidden ${className}`}>
      {title && (
        <div className="px-[12px] py-[6px] border-b border-border bg-card">
          <p className="text-[9px] text-foreground/50 uppercase font-bold font-mono">
            {title}
          </p>
        </div>
      )}
      <pre className="p-[12px] overflow-x-auto">
        <code className={`text-[11px] leading-[1.6] text-foreground/85 font-mono whitespace-pre`}>
          {code}
        </code>
      </pre>
    </div>
  );
}
