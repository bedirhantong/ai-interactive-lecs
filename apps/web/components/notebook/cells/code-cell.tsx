"use client";

import { Eraser, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CodeCell as Cell } from "@/lib/content/schema";
import { runCodeCell } from "@/lib/notebook/actions";
import type { CodeCellState } from "@/lib/notebook/types";
import { emptyExec } from "@/lib/notebook/types";
import { CellFrame, ComputeBadge } from "../cell-frame";
import { CodeEditor } from "../code-editor";
import { useCellState, useNotebookStore, useRuntime } from "../context";
import { Markdown } from "../markdown";
import { OutputView } from "../output-view";
import { RunBar } from "../run-bar";

export function CodeCell({ cell }: { cell: Cell }) {
  const store = useNotebookStore();
  const runtime = useRuntime();
  const state = useCellState<CodeCellState>(cell.id);
  const update = (patch: Partial<CodeCellState>) => store.getState().update<CodeCellState>(cell.id, (s) => ({ ...s, ...patch }));
  const run = () => {
    if (state.status !== "running") void runCodeCell(store, runtime, cell.id, cell.timeoutSeconds);
  };

  return (
    <CellFrame cell={cell} badges={<ComputeBadge kind="python" />}>
      {cell.instructions && <Markdown className="mb-3 text-[15px]">{cell.instructions}</Markdown>}
      <CodeEditor
        value={state.source}
        onChange={(source) => update({ source })}
        onRun={run}
        label={`${cell.title ?? "Kod hücresi"} için Python kodu`}
        errorLine={state.error?.line ?? null}
      />
      <RunBar exec={state} onRun={run}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => update({ source: cell.source })}
          disabled={state.source === cell.source || state.status === "running"}
          title="Başlangıç kodunu geri getirir"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Kodu sıfırla
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => update({ ...emptyExec() })}
          disabled={state.outputs.length === 0 && !state.error}
        >
          <Eraser aria-hidden className="size-3.5" />
          Çıktıyı temizle
        </Button>
      </RunBar>
      <OutputView exec={state} code={state.source} />
    </CellFrame>
  );
}
