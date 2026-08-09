import { useState, useCallback, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";
import { Loader } from "../components/Loader";
import { Button } from "../components/Button";
import { Markdown } from "../components/Markdown";
import { useNavigate } from "react-router";
import * as CLI from "../../../bindings/alis-hub-v3/cliservice";
import type { AskCitation } from "../../../bindings/alis-hub-v3/models";

/**
 * Ask questions across your own platform content — coding sessions, support
 * conversations and shared skills.
 *
 * Access is enforced at retrieval, so answers can only ever draw on what this
 * user can already see. Conversations are multi-turn: the session id returned
 * with an answer is passed back on the next question so follow-ups resolve
 * against earlier turns.
 */

interface Turn {
  question: string;
  answer: string;
  citations: AskCitation[];
  related: string[];
}

function CitationChip({
  citation,
  onOpenSkill,
}: {
  citation: AskCitation;
  onOpenSkill: (id: string) => void;
}) {
  // A SKILL citation names a bare skill id, which the skills page can load
  // directly. SESSION and TICKET refs are resource names with no local view.
  const isSkill = citation.kind === "SKILL";
  const icon =
    citation.kind === "SKILL"
      ? "solar:book-bookmark-linear"
      : citation.kind === "TICKET"
        ? "solar:ticket-linear"
        : "solar:chat-round-line-linear";

  return (
    <button
      disabled={!isSkill}
      onClick={() => isSkill && onOpenSkill(citation.name)}
      className={`flex items-center gap-[5px] px-[8px] py-[3px] bg-card border border-border text-[9px] font-mono transition-colors ${
        isSkill ? "hover:border-brand-fill/40 hover:text-brand cursor-pointer" : "cursor-default"
      }`}
      title={isSkill ? "Open this skill" : citation.name}
    >
      <Icon icon={icon} className="text-[11px]" />
      <span className="truncate max-w-[200px]">{citation.title || citation.name}</span>
    </button>
  );
}

export function AskPage() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [session, setSession] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setLoading(true);
      setError("");
      setQuestion("");
      try {
        // Passing the previous session id is what makes this a conversation
        // rather than a series of unrelated questions.
        const res = await CLI.Ask(trimmed, session);
        if (!res) throw new Error("empty response");
        setTurns((prev) => [
          ...prev,
          {
            question: trimmed,
            answer: res.answer,
            citations: res.citations ?? [],
            related: res.relatedQuestions ?? [],
          },
        ]);
        if (res.session) setSession(res.session);
      } catch (e) {
        // `no_answer` means the question needs rephrasing, not retrying.
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [loading, session],
  );

  const reset = useCallback(() => {
    setTurns([]);
    setSession("");
    setError("");
  }, []);

  const openSkill = useCallback(
    (id: string) => {
      navigate(`/skills?open=${encodeURIComponent(id)}`);
    },
    [navigate],
  );

  return (
    <div className="flex flex-1 flex-col h-full min-w-0 min-h-0">
      <div className="flex items-center gap-[12px] px-[20px] py-[14px] border-b border-border shrink-0">
        <Icon icon="solar:chat-square-call-linear" className="text-brand text-[20px]" />
        <div className="flex flex-col">
          <span className="text-[13px] text-foreground font-mono">Ask</span>
          <span className="text-[10px] text-foreground/40 font-mono">
            Answers from your sessions, support history and shared skills
          </span>
        </div>
        <div className="flex-1" />
        {turns.length > 0 && (
          <Button variant="ghost" onClick={reset} className="text-[10px]">
            New conversation
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-[20px] py-[16px] min-h-0">
        {turns.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-[10px] text-foreground/25">
            <Icon icon="solar:chat-round-dots-linear" className="text-[32px]" />
            <span className="text-[10px] font-mono">
              Ask about something you or your team have worked on
            </span>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className="mb-[24px]">
            <div className="flex items-start gap-[8px] mb-[10px]">
              <Icon
                icon="solar:round-arrow-right-linear"
                className="text-brand text-[14px] mt-[2px] shrink-0"
              />
              <span className="text-[12px] text-foreground font-mono">{turn.question}</span>
            </div>

            <div className="pl-[22px]">
              {/* Answers come back as markdown: emphasis, inline code for
                  identifiers, and the occasional list. Rendered raw, the
                  asterisks and backticks land on exactly the words they were
                  meant to mark up. */}
              <Markdown source={turn.answer} compact />

              {turn.citations.length > 0 && (
                <div className="mt-[12px]">
                  <span className="text-[9px] text-foreground/25 font-mono uppercase tracking-[0.12em]">
                    Sources
                  </span>
                  <div className="flex flex-wrap gap-[6px] mt-[6px]">
                    {turn.citations.map((c, j) => (
                      <CitationChip key={j} citation={c} onOpenSkill={openSkill} />
                    ))}
                  </div>
                </div>
              )}

              {turn.related.length > 0 && (
                <div className="mt-[12px]">
                  <span className="text-[9px] text-foreground/25 font-mono uppercase tracking-[0.12em]">
                    Ask next
                  </span>
                  <div className="flex flex-col gap-[4px] mt-[6px] items-start">
                    {turn.related.map((q, j) => (
                      <button
                        key={j}
                        onClick={() => void ask(q)}
                        className="text-[10px] text-foreground/50 hover:text-brand font-mono text-left transition-colors"
                      >
                        → {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-[10px] py-[10px]">
            <Loader size={20} />
            <span className="text-[10px] text-foreground/40 font-mono">Searching your content…</span>
          </div>
        )}

        {error && <div className="text-[10px] text-red-400 font-mono py-[8px]">{error}</div>}

        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-[8px] px-[20px] py-[12px] border-t border-border shrink-0">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
          disabled={loading}
          placeholder={
            session ? "Ask a follow-up…" : "How did we fix the failing deploy last week?"
          }
          className="flex-1 bg-card border border-border px-[10px] py-[7px] text-[11px] text-foreground font-mono outline-none focus:border-brand-fill/40 placeholder:text-foreground/25 disabled:opacity-50"
        />
        <Button
          variant="primary"
          disabled={loading || !question.trim()}
          onClick={() => void ask(question)}
          className="text-[10px]"
        >
          Ask
        </Button>
      </div>
    </div>
  );
}
