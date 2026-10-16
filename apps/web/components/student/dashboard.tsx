"use client";

import { ArrowRight, Award, Compass, Hammer, Recycle, SquareTerminal } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { Catalog } from "@/lib/content/catalog";
import { LEVEL_DESCRIPTIONS, LEVEL_LABELS, LEVELS, type Level, STARTER_LESSON } from "@/lib/content/schema";
import { useProgressHydrated } from "@/lib/progress/hydration";
import { useProgress } from "@/lib/progress/store";
import { cn } from "@/lib/cn";
import { LessonCard, lessonState } from "./lesson-status";

const LEVEL_ICONS = { explorer: Compass, builder: Hammer, developer: SquareTerminal };

export function LevelPicker({ value, onPick, compact }: { value?: Level; onPick: (l: Level) => void; compact?: boolean }) {
  return (
    <div className={cn("grid gap-3", compact ? "sm:grid-cols-3" : "md:grid-cols-3")} role="radiogroup" aria-label="Deneyim seviyesi">
      {LEVELS.map((level) => {
        const Icon = LEVEL_ICONS[level];
        const selected = value === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onPick(level)}
            className={cn(
              "rounded-2xl border bg-surface p-4 text-left transition-colors",
              selected ? "border-brand ring-2 ring-brand/30" : "border-border hover:border-border-strong",
            )}
          >
            <Icon aria-hidden className="size-6 text-brand" />
            <div className="mt-2 font-bold">{LEVEL_LABELS[level]}</div>
            <p className="mt-1 text-sm text-muted">{LEVEL_DESCRIPTIONS[level]}</p>
          </button>
        );
      })}
    </div>
  );
}

export function Dashboard({ catalog }: { catalog: Catalog }) {
  const hydrated = useProgressHydrated();
  const { profile, lessons, recent, skills, lastLessonId, setProfile } = useProgress();

  if (!hydrated) return <div className="h-64 animate-pulse rounded-2xl bg-surface-2" aria-busy="true" />;

  const started = Object.keys(lessons).length > 0;
  const name = profile.displayName.trim();

  if (!started) {
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-extrabold tracking-tight">Hoş geldin{name ? `, ${name}` : ""}!</h1>
          <p className="mt-2 max-w-2xl text-muted">
            AI Atölye’de yapay zekâyı izleyerek değil, deneyerek öğrenirsin. Nereden başlamak istersin? Bu bir sınav değil; seviyeni istediğin zaman değiştirebilirsin.
          </p>
        </header>
        <LevelPicker value={profile.level} onPick={(level) => setProfile({ level })} />
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href={`/ders/${STARTER_LESSON[profile.level]}`} size="lg">
            Şimdi dene: {catalog.lessons[STARTER_LESSON[profile.level]].title}
            <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
          <ButtonLink href="/yollar" variant="secondary" size="lg">
            Öğrenme yollarına bak
          </ButtonLink>
        </div>
      </div>
    );
  }

  const continueId = lastLessonId && catalog.lessons[lastLessonId] && !lessons[lastLessonId]?.completedAt ? lastLessonId : null;
  const orderedLessons = catalog.paths.flatMap((p) =>
    p.modules.flatMap((m) =>
      m.items.flatMap((i) =>
        i.kind === "lesson" ? [i.lessonId] : i.kind === "project" ? [catalog.projects[i.projectId].modes[profile.level]] : [],
      ),
    ),
  );
  const recommended = orderedLessons.find((id) => id !== continueId && !lessons[id]?.completedAt && catalog.lessons[id]);
  const completedCount = Object.values(lessons).filter((l) => l.completedAt).length;
  const project = catalog.projects["akilli-geri-donusum"];
  const skillList = catalog.skills.filter((s) => skills[s.id]?.length);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Merhaba{name ? `, ${name}` : ""}!</h1>
          <p className="mt-1 text-muted">
            {completedCount > 0 ? `${completedCount} dersi tamamladın.` : "İlk dersin yolda."} Bugün ne deneyeceksin?
          </p>
        </div>
        <Badge tone="brand">Seviye: {LEVEL_LABELS[profile.level]}</Badge>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        {continueId ? (
          <div className="rounded-2xl border border-brand/30 bg-brand-soft p-6">
            <div className="text-xs font-bold uppercase tracking-wide text-brand-strong">Kaldığın yerden devam et</div>
            <h2 className="mt-2 text-xl font-bold">{catalog.lessons[continueId].title}</h2>
            <div className="mt-3 flex items-center gap-3">
              <ProgressBar
                value={lessonState(lessons[continueId], catalog.lessons[continueId].requiredCellIds.length).value}
                label="Ders ilerlemesi"
              />
              <span className="shrink-0 text-sm font-semibold">
                {lessons[continueId].completedRequired.length}/{catalog.lessons[continueId].requiredCellIds.length}
              </span>
            </div>
            <ButtonLink href={`/ders/${continueId}`} className="mt-4">
              Devam et <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          </div>
        ) : null}
        {recommended && (
          <div className={cn(!continueId && "lg:col-span-2")}>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Önerilen sonraki ders</div>
            <LessonCard lesson={catalog.lessons[recommended]} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Recycle aria-hidden className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Öne çıkan proje</div>
            <h2 className="text-xl font-bold">{project.title}</h2>
            <p className="mt-1 text-sm text-muted">{project.tagline}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {LEVELS.map((level) => {
                const id = project.modes[level];
                const st = lessonState(lessons[id], catalog.lessons[id].requiredCellIds.length);
                return (
                  <Link
                    key={level}
                    href={`/ders/${id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:border-border-strong"
                  >
                    <span className="font-semibold">{LEVEL_LABELS[level]}</span>
                    <span className={cn("text-xs", st.status === "done" ? "text-success" : "text-muted")}>{st.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-bold">Son yaptıkların</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">Bir görevi tamamladığında, kodundaki bir hatayı düzelttiğinde ya da bir model eğittiğinde burada görünür.</p>
          ) : (
            <ul className="space-y-2">
              {recent.slice(0, 6).map((e, i) => (
                <li key={`${e.at}-${i}`} className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
                  <div className="font-medium">{e.detail}</div>
                  <div className="text-xs text-muted">
                    {catalog.lessons[e.lessonId]?.title} · {new Date(e.at).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="mb-3 text-lg font-bold">Geliştirdiğin beceriler</h2>
          {skillList.length === 0 ? (
            <p className="text-sm text-muted">Beceriler, görevleri gerçekten yaptığında kazanılır. Sayfaları açmak yetmez.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {skillList.map((s) => (
                <Link key={s.id} href="/basarilarim" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:border-border-strong">
                  <Award aria-hidden className="size-4 text-accent" />
                  {s.title}
                  <span className="text-xs text-muted">{skills[s.id].length} kanıt</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
