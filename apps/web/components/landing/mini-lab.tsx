"use client";

import { useState } from "react";
import { ScatterRegression } from "@/components/charts/scatter-regression";
import { Slider } from "@/components/ui/slider";
import { meanSquaredError } from "@/lib/ml/linreg";
import { cn } from "@/lib/cn";

const fmt = (n: number, d = 0) => n.toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d });

/** A real, tiny regression lab for the landing page: every number is computed live. */
export function MiniLab({ points }: { points: { id: number; x: number; y: number }[] }) {
  const [slope, setSlope] = useState(1);
  const [intercept, setIntercept] = useState(50);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const mse = meanSquaredError(slope, intercept, xs, ys);
  const good = mse < 180;
  return (
    <div className="rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-bold">Şimdi dene: sıcaklık arttıkça kaç ayran satılır?</div>
        <span className="text-xs text-muted">Sentetik veri · gerçek hesaplama</span>
      </div>
      <ScatterRegression
        points={points}
        slope={slope}
        intercept={intercept}
        xDomain={[8, 40]}
        yDomain={[0, 220]}
        xLabel="Sıcaklık (°C)"
        yLabel="Satılan ayran"
        description={`Doğru: eğim ${slope}, sabit ${intercept}. Hata ${fmt(mse, 1)}.`}
      />
      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Slider label="Eğim" value={slope} min={0} max={8} step={0.1} format={(v) => fmt(v, 1)} onChange={setSlope} />
        <Slider label="Sabit" value={intercept} min={-40} max={120} step={1} onChange={setIntercept} />
        <div className={cn("rounded-xl px-4 py-2 text-right", good ? "bg-success-soft text-success" : "bg-surface-2")}>
          <div className="text-[11px] font-semibold uppercase tracking-wide">Hata (MSE)</div>
          <div className="font-mono text-2xl font-bold tabular-nums">{fmt(mse, 1)}</div>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted" aria-live="polite">
        {good
          ? "Harika! Doğruyu verilere çok yaklaştırdın. Laboratuvarda bilgisayarın bunu kendi kendine nasıl öğrendiğini göreceksin."
          : "Kaydırıcıları oynat: kırmızı hata çizgilerini kısaltmaya çalış. Hedef: 180'in altı."}
      </p>
    </div>
  );
}
