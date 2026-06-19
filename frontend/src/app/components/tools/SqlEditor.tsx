import { useMemo } from 'react';
import CodeMirror, { EditorView, keymap, Prec } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const sqlHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#f881a9' },
  { tag: t.string, color: '#98c379' },
  { tag: t.number, color: '#d19a66' },
  { tag: t.comment, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' },
  { tag: t.operator, color: '#56b6c2' },
  { tag: t.punctuation, color: 'rgba(255,255,255,0.5)' },
  { tag: [t.name, t.variableName], color: 'rgba(255,255,255,0.85)' },
  { tag: t.function(t.name), color: '#61afef' },
  { tag: t.typeName, color: '#e5c07b' },
]);

const baseTheme = EditorView.theme({
  '&': { height: '100%', background: '#151515', color: 'rgba(255,255,255,0.85)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' },
  '.cm-content': { padding: '8px 4px', caretColor: '#f881a9' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#f881a9' },
  '.cm-selectionBackground, ::selection': { background: 'rgba(248,129,169,0.15)' },
  '.cm-activeLine': { background: 'rgba(255,255,255,0.02)' },
  '.cm-selectionMatch': { background: 'rgba(248,129,169,0.08)' },
  '.cm-gutters': {
    background: '#151515',
    color: 'rgba(255,255,255,0.18)',
    border: 'none',
    borderRight: '1px solid rgba(255,255,255,0.06)',
  },
  '.cm-lineNumbers .cm-gutterElement': { paddingRight: '10px', fontSize: '9px' },
  '.cm-placeholder': { color: 'rgba(255,255,255,0.2)' },
}, { dark: true });

interface Props {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  placeholder?: string;
}

export function SqlEditor({ value, onChange, onRun, placeholder }: Props) {
  const extensions = useMemo(() => [
    sql(),
    syntaxHighlighting(sqlHighlight),
    Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { onRun(); return true; } }])),
  ], [onRun]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={baseTheme}
      placeholder={placeholder}
      height="100%"
      style={{ height: '100%' }}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        dropCursor: false,
        allowMultipleSelections: true,
        indentOnInput: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        autocompletion: false,
        closeBrackets: false,
        bracketMatching: true,
        syntaxHighlighting: false,
      }}
    />
  );
}
