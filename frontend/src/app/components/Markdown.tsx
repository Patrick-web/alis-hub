import { useMemo } from "react";
import { marked } from "marked";

/**
 * Renders markdown with the app's own typography rather than the browser's.
 *
 * Platform text arrives as markdown from several sources: skill documents, Ask
 * answers, codeblock docs. Shown raw it reads as noise, with literal asterisks
 * and backticks around the very words the author meant to emphasise, so it is
 * parsed and styled to match the surrounding UI.
 *
 * `compact` drops the heading sizes down for places where the markdown is a
 * short answer inside a larger page rather than a document in its own right.
 */
export function Markdown({ source, compact }: { source: string; compact?: boolean }) {
  const html = useMemo(() => (source ? (marked.parse(source) as string) : ""), [source]);

  if (!html) return null;

  return (
    <div
      className={`prose prose-invert prose-sm max-w-none break-words
        leading-[1.7] text-foreground/75 ${compact ? "text-[11px]" : "text-[12px]"}
        [&_h1]:font-mono [&_h1]:font-bold [&_h1]:uppercase [&_h1]:text-foreground [&_h1]:mb-[12px]
        [&_h2]:font-mono [&_h2]:font-bold [&_h2]:uppercase [&_h2]:text-foreground [&_h2]:mt-[20px] [&_h2]:mb-[8px]
        [&_h3]:font-mono [&_h3]:font-bold [&_h3]:text-foreground [&_h3]:mt-[16px] [&_h3]:mb-[6px]
        [&_h4]:font-semibold [&_h4]:text-foreground [&_h4]:mb-[4px]
        ${
          compact
            ? "[&_h1]:text-[13px] [&_h2]:text-[12px] [&_h3]:text-[11px] [&_h4]:text-[11px]"
            : "[&_h1]:text-[15px] [&_h2]:text-[13px] [&_h3]:text-[12px] [&_h4]:text-[12px]"
        }
        [&_p]:text-foreground/70 [&_p]:mb-[10px] [&_p:last-child]:mb-0
        [&_code]:text-brand [&_code]:bg-foreground/5 [&_code]:px-[4px] [&_code]:py-[1px] [&_code]:rounded [&_code]:text-[11px]
        [&_pre]:bg-card [&_pre]:border [&_pre]:border-border [&_pre]:rounded-[4px] [&_pre]:text-[11px] [&_pre]:p-[12px] [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words
        [&_pre_code]:bg-transparent [&_pre_code]:text-foreground/80 [&_pre_code]:p-0
        [&_a]:text-brand [&_a]:no-underline hover:[&_a]:underline
        [&_strong]:text-foreground
        [&_li]:text-foreground/70 [&_li]:mb-[4px]
        [&_ul]:mb-[10px] [&_ol]:mb-[10px] [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-[18px] [&_ol]:pl-[18px]
        [&_table]:w-full [&_table]:border-collapse [&_table]:mb-[12px] [&_table]:block [&_table]:overflow-x-auto
        [&_th]:border [&_th]:border-border [&_th]:bg-card [&_th]:px-[8px] [&_th]:py-[5px] [&_th]:text-left [&_th]:text-[10px] [&_th]:font-mono [&_th]:uppercase [&_th]:text-foreground/60
        [&_td]:border [&_td]:border-border [&_td]:px-[8px] [&_td]:py-[5px] [&_td]:text-[11px] [&_td]:align-top
        [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-[10px] [&_blockquote]:text-foreground/50
        [&_hr]:border-border [&_hr]:my-[20px]`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
