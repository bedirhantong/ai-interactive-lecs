import { Cloud, Code2, FlaskConical } from "lucide-react";
import { LAB_DESCRIPTIONS, LAB_LABELS, type LabType } from "@/lib/labs";

const ICONS = { visual: FlaskConical, python: Code2, colab: Cloud };

/** Shows which execution environments a lesson uses. */
export function LabBadges({ labs }: { labs: LabType[] }) {
  return (
    <>
      {labs.map((lab) => {
        const Icon = ICONS[lab];
        return (
          <span
            key={lab}
            title={LAB_DESCRIPTIONS[lab]}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[12px] font-semibold leading-5 text-muted"
          >
            <Icon aria-hidden className="size-3.5" />
            {LAB_LABELS[lab]}
          </span>
        );
      })}
    </>
  );
}
