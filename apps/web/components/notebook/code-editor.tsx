"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import { useProgress } from "@/lib/progress/store";
import { useIsDark, useMediaQuery } from "@/lib/use-media";

type MonacoEditor = Parameters<OnMount>[0];
type Monaco = Parameters<OnMount>[1];

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  label: string;
  readOnly?: boolean;
  errorLine?: number | null;
  minLines?: number;
}

const LINE_HEIGHT = 20;

/** Monaco needs a concrete font name, not a CSS variable. */
function codeFontFamily(): string {
  const loaded = getComputedStyle(document.documentElement).getPropertyValue("--font-code").trim();
  return `${loaded ? `${loaded}, ` : ""}ui-monospace, SFMono-Regular, Menlo, monospace`;
}

/**
 * Python editor. Monaco on desktop; a plain textarea on touch devices, when
 * the student prefers the simple editor, or if Monaco fails to load.
 * Shift+Enter (or Ctrl/Cmd+Enter) runs the cell in both.
 */
export function CodeEditor(props: EditorProps) {
  const preference = useProgress((s) => s.profile.editor);
  const coarse = useMediaQuery("(pointer: coarse)");
  const [failed, setFailed] = useState(false);
  if (preference === "basic" || coarse || failed) return <BasicEditor {...props} />;
  return <MonacoCodeEditor {...props} onFail={() => setFailed(true)} />;
}

function MonacoCodeEditor({ value, onChange, onRun, label, readOnly, errorLine, minLines = 4, onFail }: EditorProps & { onFail: () => void }) {
  const dark = useIsDark();
  const runRef = useRef(onRun);
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorations = useRef<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    runRef.current = onRun;
  }, [onRun]);

  // Fall back to the simple editor if Monaco (loaded from a CDN) never arrives.
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(onFail, 12000);
    return () => clearTimeout(timer);
  }, [ready, onFail]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    decorations.current = editor.deltaDecorations(
      decorations.current,
      errorLine
        ? [{ range: new monaco.Range(errorLine, 1, errorLine, 1), options: { isWholeLine: true, className: "atolye-error-line", glyphMarginClassName: "atolye-error-glyph" } }]
        : [],
    );
  }, [errorLine, ready]);

  const lines = Math.min(28, Math.max(minLines, value.split("\n").length + 1));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-code-bg" style={{ height: lines * LINE_HEIGHT + 16 }}>
      <Editor
        language="python"
        value={value}
        theme={dark ? "vs-dark" : "vs"}
        onChange={(v) => onChange(v ?? "")}
        loading={<div className="p-3 font-mono text-xs text-muted">Editör yükleniyor…</div>}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
          editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => runRef.current?.());
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());
          setReady(true);
        }}
        options={{
          readOnly,
          ariaLabel: label,
          minimap: { enabled: false },
          fontSize: 14,
          lineHeight: LINE_HEIGHT,
          fontFamily: codeFontFamily(),
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: true,
          padding: { top: 8, bottom: 8 },
          renderLineHighlight: "line",
          overviewRulerLanes: 0,
          scrollbar: { alwaysConsumeMouseWheel: false },
          lineNumbersMinChars: 3,
          folding: false,
          stickyScroll: { enabled: false },
          accessibilitySupport: "auto",
          // Turkish letters such as "ı" are not suspicious characters here.
          unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: true, nonBasicASCII: false },
        }}
      />
    </div>
  );
}

function BasicEditor({ value, onChange, onRun, label, readOnly, errorLine, minLines = 4 }: EditorProps) {
  const lines = Math.min(28, Math.max(minLines, value.split("\n").length + 1));
  return (
    <div className="rounded-lg border border-border bg-code-bg">
      <textarea
        aria-label={label}
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        rows={lines}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onRun?.();
          } else if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: start, selectionEnd: end } = el;
            const next = value.slice(0, start) + "    " + value.slice(end);
            onChange(next);
            requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4));
          }
        }}
        className="block w-full resize-y bg-transparent p-3 font-mono text-[14px] leading-5 text-text outline-none"
      />
      {errorLine ? <p className="border-t border-border px-3 py-1 text-xs text-danger">Hata satır {errorLine} civarında.</p> : null}
    </div>
  );
}
