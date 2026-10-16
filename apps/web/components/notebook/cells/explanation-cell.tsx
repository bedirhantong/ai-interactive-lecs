import { Callout } from "@/components/ui/callout";
import type { ExplanationCell as Cell } from "@/lib/content/schema";
import { CellFrame } from "../cell-frame";
import { Markdown } from "../markdown";

const tones = { tip: "tip", note: "info", warning: "warning", data: "data" } as const;

export function ExplanationCell({ cell }: { cell: Cell }) {
  return (
    <CellFrame cell={cell}>
      {cell.variant === "default" ? (
        <Markdown>{cell.markdown}</Markdown>
      ) : (
        <Callout tone={tones[cell.variant]}>
          <Markdown className="[&_p]:my-0.5">{cell.markdown}</Markdown>
        </Callout>
      )}
    </CellFrame>
  );
}
