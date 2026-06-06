interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  className?: string;
}

export function CodeBlock({ code, language = 'plaintext', title, className = '' }: CodeBlockProps) {
  return (
    <div className={`bg-[#1e1e1e] border border-[#464646] rounded-[4px] overflow-hidden ${className}`}>
      {title && (
        <div className="px-[12px] py-[6px] border-b border-[#464646] bg-[#2c2c2c]">
          <p className="text-[9px] text-[rgba(255,255,255,0.5)] uppercase font-bold font-['JetBrains_Mono',sans-serif]">
            {title}
          </p>
        </div>
      )}
      <pre className="p-[12px] overflow-x-auto">
        <code className={`text-[11px] leading-[1.6] text-[rgba(255,255,255,0.85)] font-['JetBrains_Mono',sans-serif] whitespace-pre`}>
          {code}
        </code>
      </pre>
    </div>
  );
}
