"use client";

import { Send } from "lucide-react";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReflectionCell as Cell } from "@/lib/content/schema";
import type { ReflectionState } from "@/lib/notebook/types";
import { CellFrame } from "../cell-frame";
import { useCellState, useNotebookStore } from "../context";
import { Markdown } from "../markdown";

export function ReflectionCell({ cell }: { cell: Cell }) {
  const store = useNotebookStore();
  const state = useCellState<ReflectionState>(cell.id);
  const id = useId();
  const length = state.text.trim().length;
  const changed = state.submittedText !== null && state.submittedText !== state.text;
  const update = (patch: Partial<ReflectionState>) => store.getState().update<ReflectionState>(cell.id, (s) => ({ ...s, ...patch }));

  return (
    <CellFrame cell={cell}>
      <Markdown className="text-[15px] font-medium">{cell.prompt}</Markdown>
      {cell.guidingQuestions.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">
          {cell.guidingQuestions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      )}
      <label htmlFor={id} className="sr-only">
        Cevabın
      </label>
      <textarea
        id={id}
        value={state.text}
        onChange={(e) => update({ text: e.target.value })}
        rows={5}
        placeholder="Düşüncelerini kendi cümlelerinle yaz…"
        className="mt-3 block w-full resize-y rounded-lg border border-border-strong bg-surface p-3 text-[15px] leading-6 outline-none focus:border-brand"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={length < cell.minLength || (state.submittedAt !== null && !changed)}
          onClick={() => {
            update({ submittedText: state.text, submittedAt: new Date().toISOString() });
            store.getState().addEvidence(cell.id, "reflection-submitted", `${length} karakter`);
          }}
        >
          <Send aria-hidden className="size-3.5" />
          {state.submittedAt ? "Güncelle" : "Gönder"}
        </Button>
        <span className="text-xs text-muted">
          {length < cell.minLength ? `En az ${cell.minLength} karakter (${length}/${cell.minLength})` : `${length} karakter`}
        </span>
        {state.submittedAt && !changed && <Badge tone="info">Gönderildi · öğretmen değerlendirmesi bekliyor</Badge>}
      </div>
      <p className="mt-2 text-xs text-subtle">
        Bu yazı otomatik olarak puanlanmaz; doğru ya da yanlış cevap yoktur. Sınıf modunda öğretmenin okur. Demo modunda yalnızca bu tarayıcıda saklanır.
      </p>
    </CellFrame>
  );
}
