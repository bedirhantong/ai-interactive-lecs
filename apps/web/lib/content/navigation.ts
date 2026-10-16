import type { NotebookNav } from "@/components/notebook/notebook-layout";
import { type ContentBundle, loadContent } from "./loader";

export const lessonHref = (id: string) => `/ders/${id}`;
export const projectHref = (id: string) => `/projeler/${id}`;
export const pathHref = (id: string) => `/yollar/${id}`;

/** Where a lesson sits in the curriculum: exit target, breadcrumb and prev/next lessons. */
export function lessonNav(lessonId: string, content: ContentBundle = loadContent()): NotebookNav {
  const lesson = content.lessons.get(lessonId);
  if (lesson?.projectId) {
    const project = content.projects.get(lesson.projectId)!;
    return {
      exitHref: projectHref(project.id),
      exitLabel: "Projeye dön",
      context: `Proje · ${project.title}`,
      portfolioHref: "/projelerim",
    };
  }
  for (const path of content.paths) {
    const lessonIds = path.modules.flatMap((m) => m.items.flatMap((i) => (i.kind === "lesson" ? [i.lessonId] : [])));
    const idx = lessonIds.indexOf(lessonId);
    if (idx === -1) continue;
    const at = (i: number) => {
      const id = lessonIds[i];
      const l = id ? content.lessons.get(id) : undefined;
      return l ? { href: lessonHref(l.id), title: l.title } : undefined;
    };
    return { exitHref: pathHref(path.id), exitLabel: "Yola dön", context: path.title, prev: at(idx - 1), next: at(idx + 1) };
  }
  return { exitHref: "/ana-sayfa", exitLabel: "Ana sayfa" };
}
