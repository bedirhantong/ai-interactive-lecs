import "server-only";
import type { LessonSummary } from "./loader";
import { lessonSummaries, loadContent } from "./loader";
import type { LearningPath, Project, Skill } from "./schema";

/** Serializable content metadata for list pages (no cells, no datasets). */
export interface Catalog {
  paths: LearningPath[];
  lessons: Record<string, LessonSummary>;
  projects: Record<string, Project>;
  skills: Skill[];
}

export function getCatalog(): Catalog {
  const content = loadContent();
  return {
    paths: content.paths,
    lessons: lessonSummaries(),
    projects: Object.fromEntries(content.projects),
    skills: content.skills,
  };
}

/** Lesson titles and reflection prompts for the teacher pages. */
export function getTeacherCatalog() {
  const { lessons } = loadContent();
  const reflectionPrompts: Record<string, string> = {};
  for (const lesson of lessons.values()) {
    for (const cell of lesson.cells) if (cell.type === "reflection") reflectionPrompts[`${lesson.id}:${cell.id}`] = cell.prompt;
  }
  return {
    lessons: [...lessons.values()].map((l) => ({ id: l.id, title: l.title, level: l.level })),
    reflectionPrompts,
  };
}
