"use client";

import type { ExperimentCell as Cell } from "@/lib/content/schema";
import type { Knn2dState, LinregState } from "@/lib/notebook/types";
import { CellFrame, ComputeBadge } from "../cell-frame";
import { useCellState, useNotebook } from "../context";
import { Markdown } from "../markdown";
import { Knn2dExperiment } from "./knn2d-experiment";
import { LinregExperiment } from "./linreg-experiment";

export function ExperimentCell({ cell }: { cell: Cell }) {
  const dataset = useNotebook((s) => s.datasets[cell.experiment.datasetId]);
  const state = useCellState<LinregState | Knn2dState>(cell.id);
  const exp = cell.experiment;
  const training = exp.kind === "linear-regression" && exp.modes.includes("fit");

  return (
    <CellFrame cell={cell} badges={<ComputeBadge kind={training ? "training" : "computation"} />}>
      {cell.instructions && <Markdown className="mb-4 text-[15px]">{cell.instructions}</Markdown>}
      {exp.kind === "linear-regression" && state.kind === "linreg" && (
        <LinregExperiment cell={cell} exp={exp} dataset={dataset} state={state} />
      )}
      {exp.kind === "knn-2d" && state.kind === "knn2d" && <Knn2dExperiment cell={cell} exp={exp} dataset={dataset} state={state} />}
    </CellFrame>
  );
}
