"use client";

import { Award, CircleDashed } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Catalog } from "@/lib/content/catalog";
import { useProgressHydrated } from "@/lib/progress/hydration";
import { useProgress } from "@/lib/progress/store";

/**
 * Skills are earned only through completed, evidence-producing tasks. Every
 * skill lists the evidence behind it, so progress is auditable.
 */
export function Achievements({ catalog }: { catalog: Catalog }) {
  const hydrated = useProgressHydrated();
  const skills = useProgress((s) => s.skills);
  if (!hydrated) return <div className="h-48 animate-pulse rounded-2xl bg-surface-2" />;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {catalog.skills.map((skill) => {
        const evidence = skills[skill.id] ?? [];
        const earned = evidence.length > 0;
        return (
          <section
            key={skill.id}
            className={earned ? "rounded-2xl border border-border bg-surface p-5 shadow-card" : "rounded-2xl border border-dashed border-border p-5"}
            data-testid={`skill-${skill.id}`}
          >
            <div className="flex items-start gap-3">
              {earned ? (
                <Award aria-hidden className="mt-0.5 size-6 shrink-0 text-accent" />
              ) : (
                <CircleDashed aria-hidden className="mt-0.5 size-6 shrink-0 text-subtle" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">{skill.title}</h2>
                <p className="text-sm text-muted">{skill.description}</p>
              </div>
              {earned && <Badge tone="success">{evidence.length} kanıt</Badge>}
            </div>
            {earned ? (
              <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                {evidence.map((e) => (
                  <li key={`${e.lessonId}:${e.cellId}`}>
                    <Link href={`/ders/${e.lessonId}#cell-${e.cellId}`} className="font-medium hover:text-brand">
                      {catalog.lessons[e.lessonId]?.title ?? e.lessonId}
                    </Link>
                    <div className="text-xs text-muted">
                      {e.evidence} · {new Date(e.at).toLocaleDateString("tr-TR")}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-subtle">Henüz kanıt yok.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
