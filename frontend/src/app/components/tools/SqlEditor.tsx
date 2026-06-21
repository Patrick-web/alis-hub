import { useMemo } from 'react';
import { useTheme } from 'next-themes';
import CodeMirror, { EditorView, keymap, Prec } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const darkHighlight = HighlightStyle.define([
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

const lightHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#c2185b' },
  { tag: t.string, color: '#388e3c' },
  { tag: t.number, color: '#e65100' },
  { tag: t.comment, color: 'rgba(0,0,0,0.35)', fontStyle: 'italic' },
  { tag: t.operator, color: '#0277bd' },
  { tag: t.punctuation, color: 'rgba(0,0,0,0.45)' },
  { tag: [t.name, t.variableName], color: 'rgba(0,0,0,0.8)' },
  { tag: t.function(t.name), color: '#1565c0' },
  { tag: t.typeName, color: '#6a1e9a' },
]);

const darkTheme = EditorView.theme({
  '&': { height: '100%', background: 'var(--background)', color: 'rgba(255,255,255,0.85)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' },
  '.cm-content': { padding: '8px 4px', caretColor: 'var(--brand)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--brand)' },
  '.cm-selectionBackground, ::selection': { background: 'rgba(248,129,169,0.15)' },
  '.cm-activeLine': { background: 'rgba(255,255,255,0.02)' },
  '.cm-selectionMatch': { background: 'rgba(248,129,169,0.08)' },
  '.cm-gutters': {
    background: 'var(--background)',
    color: 'rgba(255,255,255,0.18)',
    border: 'none',
    borderRight: '1px solid rgba(255,255,255,0.06)',
  },
  '.cm-lineNumbers .cm-gutterElement': { paddingRight: '10px', fontSize: '9px' },
  '.cm-placeholder': { color: 'rgba(255,255,255,0.2)' },
}, { dark: true });

const lightTheme = EditorView.theme({
  '&': { height: '100%', background: 'var(--card)', color: 'rgba(0,0,0,0.85)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' },
  '.cm-content': { padding: '8px 4px', caretColor: 'var(--brand)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--brand)' },
  '.cm-selectionBackground, ::selection': { background: 'rgba(194,24,91,0.15)' },
  '.cm-activeLine': { background: 'rgba(0,0,0,0.03)' },
  '.cm-selectionMatch': { background: 'rgba(194,24,91,0.08)' },
  '.cm-gutters': {
    background: 'var(--muted)',
    color: 'rgba(0,0,0,0.3)',
    border: 'none',
    borderRight: '1px solid rgba(0,0,0,0.08)',
  },
  '.cm-lineNumbers .cm-gutterElement': { paddingRight: '10px', fontSize: '9px' },
  '.cm-placeholder': { color: 'rgba(0,0,0,0.3)' },
}, { dark: false });

interface Props {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  placeholder?: string;
}

export function SqlEditor({ value, onChange, onRun, placeholder }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const extensions = useMemo(() => [
    sql(),
    isDark ? darkTheme : lightTheme,
    syntaxHighlighting(isDark ? darkHighlight : lightHighlight),
    Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { onRun(); return true; } }])),
  ], [isDark, onRun]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
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
