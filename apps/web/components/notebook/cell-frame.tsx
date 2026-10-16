"use client";

import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { Cell } from "@/lib/content/schema";
import { cn } from "@/lib/cn";
import { CELL_META } from "./cell-meta";
import { useNotebook } from "./context";

/**
 * Honest labelling of what a cell computes. Nothing in AI Atölye is a canned
 * animation; this badge tells the student what kind of computation they see.
 */
export function ComputeBadge({ kind }: { kind: "training" | "computation" | "python" }) {
  const text = {
    training: "Gerçek eğitim",
    computation: "Gerçek hesaplama",
    python: "Gerçek Python",
  }[kind];
  const title = {
    training: "Model bu verilerle şu anda, tarayıcında gerçekten eğitiliyor. Sonuçlar önceden hazırlanmış değil.",
    computation: "Grafikteki her değer bu verilerden şu anda hesaplanıyor. Hazır bir animasyon değil.",
    python: "Bu kod tarayıcındaki Python ortamında (Pyodide) gerçekten çalışır.",
  }[kind];
  return (
    <Badge tone="info" className="cursor-help">
      <span title={title}>{text}</span>
    </Badge>
  );
}

export function CellFrame({
  cell,
  children,
  badges,
  className,
}: {
  cell: Cell;
  children: ReactNode;
  badges?: ReactNode;
  className?: string;
}) {
  const meta = CELL_META[cell.type];
  const Icon = meta.icon;
  const completed = useNotebook((s) => !!s.completions[cell.id]);
  const active = useNotebook((s) => s.activeCellId === cell.id);
  const setActive = useNotebook((s) => s.setActive);
  const plain = cell.type === "explanation";

  return (
    <section
      id={`cell-${cell.id}`}
      data-cell-id={cell.id}
      data-cell-type={cell.type}
      aria-labelledby={`cell-${cell.id}-title`}
      onPointerDownCapture={() => setActive(cell.id)}
      onFocusCapture={() => setActive(cell.id)}
      className={cn(
        "scroll-mt-4 rounded-2xl border bg-surface transition-shadow",
        plain ? "border-transparent bg-transparent" : "border-border shadow-card",
        active && !plain && "ring-2 ring-[color-mix(in_srgb,var(--brand)_35%,transparent)]",
        className,
      )}
      style={plain ? undefined : { borderLeft: `4px solid ${meta.color}` }}
    >
      {!plain && (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 sm:px-5">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: meta.color }}>
            <Icon aria-hidden className="size-4" />
            {meta.label}
          </span>
          <h3 id={`cell-${cell.id}-title`} className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            {cell.title ?? ""}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {badges}
            {cell.required && !completed && <Badge tone="warning">Görev</Badge>}
            {completed && (
              <Badge tone="success">
                <CheckCircle2 aria-hidden className="size-3.5" />
                Tamamlandı
              </Badge>
            )}
          </div>
        </header>
      )}
      {plain && <h3 id={`cell-${cell.id}-title`} className="sr-only">{cell.title ?? meta.label}</h3>}
      <div className={cn(plain ? "px-1" : "px-4 py-4 sm:px-5")}>{children}</div>
    </section>
  );
}
