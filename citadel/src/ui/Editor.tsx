// Experten-Texteditor (CodeMirror 6): Syntaxhervorhebung für KeyValues/cfg, Suche, Zeilennummern.
// Arbeitet direkt auf dem Entwurfstext – Formular und Textansicht teilen denselben Zustand.

import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { StreamLanguage, syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const kvLang = StreamLanguage.define<{ expectValue: boolean }>({
  startState: () => ({ expectValue: false }),
  token(stream, state) {
    if (stream.eatSpace()) return null;
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match(/^[{}]/)) {
      state.expectValue = false;
      return 'bracket';
    }
    if (stream.match(/^\[\$[^\]]*\]/)) return 'meta';
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^[^\s{}"]+/)) {
      const cur = stream.current().replace(/"/g, '');
      const isValue = state.expectValue;
      state.expectValue = !state.expectValue;
      if (stream.eol()) state.expectValue = false;
      if (isValue) return /^-?\d+(\.\d+)?$/.test(cur) ? 'number' : /^(true|false)$/i.test(cur) ? 'bool' : 'string';
      return 'propertyName';
    }
    stream.next();
    return null;
  },
  blankLine(state) {
    state.expectValue = false;
  },
});

const cfgLang = StreamLanguage.define<{ first: boolean }>({
  startState: () => ({ first: true }),
  token(stream, state) {
    if (stream.sol()) state.first = true;
    if (stream.eatSpace()) return null;
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.eat(';')) {
      state.first = true;
      return 'punctuation';
    }
    if (stream.match(/^"[^"]*"?/)) {
      state.first = false;
      return 'string';
    }
    if (stream.match(/^[^\s;"]+/)) {
      const w = stream.current();
      if (state.first) {
        state.first = false;
        return /^(bind|unbind|alias|exec|echo)$/i.test(w) ? 'keyword' : 'propertyName';
      }
      return /^-?\d+(\.\d+)?$/.test(w) ? 'number' : 'string';
    }
    stream.next();
    return null;
  },
});

const hl = HighlightStyle.define([
  { tag: t.comment, color: '#7d766b', fontStyle: 'italic' },
  { tag: t.propertyName, color: '#cfc7b6' },
  { tag: t.string, color: '#7fd6b8' },
  { tag: t.number, color: '#d6b27a' },
  { tag: t.bool, color: '#d6b27a' },
  { tag: t.keyword, color: '#86a8d6' },
  { tag: t.bracket, color: '#8d8578' },
  { tag: t.meta, color: '#86a8d6' },
]);

const theme = EditorView.theme(
  {
    '&': { color: '#efe9dc', backgroundColor: '#161718', fontSize: '12.5px' },
    '.cm-content': { fontFamily: "'Cascadia Code', Consolas, monospace", caretColor: '#7fd6b8' },
    '.cm-gutters': { backgroundColor: '#1c1d1f', color: '#6f685e', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(95,191,159,0.10)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'rgba(95,191,159,0.28) !important' },
    '.cm-searchMatch': { backgroundColor: 'rgba(176,141,87,0.35)' },
    '.cm-panels': { backgroundColor: '#222120', color: '#efe9dc', borderColor: '#3a3733' },
    '.cm-textfield': { backgroundColor: '#161718', border: '1px solid #3a3733', color: '#efe9dc' },
    '.cm-button': { backgroundImage: 'none', backgroundColor: '#2a2826', border: '1px solid #3a3733', color: '#efe9dc' },
  },
  { dark: true },
);

export function CodeEditor({ value, onChange, kind, readOnly }: { value: string; onChange: (v: string) => void; kind: 'kv' | 'cfg'; readOnly?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          search({ top: true }),
          highlightSelectionMatches(),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          kind === 'kv' ? kvLang : cfgLang,
          syntaxHighlighting(hl),
          theme,
          EditorState.readOnly.of(Boolean(readOnly)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) cb.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, readOnly]);

  // Externe Änderungen (Formular) in den Editor übernehmen
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return <div className="cm-host" ref={host} />;
}
