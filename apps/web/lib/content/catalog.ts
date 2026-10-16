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
