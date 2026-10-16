import "server-only";
/**
 * Reads and validates authored content from the repository's /content folder.
 *
 * Content is read synchronously with fs so Next.js can prerender lesson
 * pages at build time. Every file is validated against the zod schemas; an
 * invalid file fails loudly instead of rendering a broken lesson.
 */
import fs from "node:fs";
import path from "node:path";
import { csvToRows } from "./csv";
import {
  type ColabTemplate,
  type Dataset,
  type LearningPath,
  type Lesson,
  type Project,
  type Skill,
  colabTemplateSchema,
  datasetMetaSchema,
  learningPathSchema,
  lessonSchema,
  projectSchema,
  skillsFileSchema,
} from "./schema";

/**
 * Content is shipped explicitly via `outputFileTracingIncludes` in
 * next.config.ts, so these dynamic paths are excluded from file tracing.
 */
export function contentRoot(): string {
  return process.env.CONTENT_DIR ?? path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "..", "content");
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf-8"));
}

function jsonFiles(dir: string): string[] {
  const full = path.join(/* turbopackIgnore: true */ contentRoot(), dir);
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(full, f));
}

function parseOrThrow<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { message: string } } }, file: string): T {
  const result = schema.safeParse(readJson(file));
  if (!result.success) {
    throw new Error(`İçerik doğrulanamadı: ${path.relative(contentRoot(), file)}\n${result.error.message}`);
  }
  return result.data;
}

let cache: ContentBundle | null = null;

export interface ContentBundle {
  lessons: Map<string, Lesson>;
  paths: LearningPath[];
  projects: Map<string, Project>;
  datasets: Map<string, Dataset>;
  colabTemplates: Map<string, ColabTemplate>;
  skills: Skill[];
}

export function loadContent(): ContentBundle {
  if (cache && process.env.NODE_ENV === "production") return cache;

  const datasets = new Map<string, Dataset>();
  for (const file of jsonFiles("datasets")) {
    const meta = parseOrThrow(datasetMetaSchema, file);
    const csv = fs.readFileSync(path.join(/* turbopackIgnore: true */ contentRoot(), "datasets", meta.file), "utf-8");
    datasets.set(meta.id, { ...meta, csv, rows: csvToRows(csv, meta.idColumn) });
  }

  const lessons = new Map<string, Lesson>();
  for (const file of jsonFiles("notebooks")) {
    const lesson = parseOrThrow(lessonSchema, file);
    lessons.set(lesson.id, lesson);
  }

  const projects = new Map<string, Project>();
  for (const file of jsonFiles("projects")) {
    const project = parseOrThrow(projectSchema, file);
    projects.set(project.id, project);
  }

  const paths = jsonFiles("learning-paths")
    .map((file) => parseOrThrow(learningPathSchema, file))
    .sort((a, b) => a.order - b.order);

  const colabTemplates = new Map<string, ColabTemplate>();
  for (const file of jsonFiles("colab")) {
    const template = parseOrThrow(colabTemplateSchema, file);
    const notebook = readJson(path.join(/* turbopackIgnore: true */ contentRoot(), "colab", template.notebookFile)) as { nbformat?: number };
    if (notebook.nbformat !== 4) throw new Error(`${template.notebookFile}: nbformat 4 bekleniyor`);
    colabTemplates.set(template.id, template);
  }

  const skills = parseOrThrow(skillsFileSchema, path.join(/* turbopackIgnore: true */ contentRoot(), "skills.json"));

  const bundle: ContentBundle = { lessons, paths, projects, datasets, colabTemplates, skills };
  const problems = validateReferences(bundle);
  if (problems.length > 0) throw new Error(`İçerik referans hataları:\n${problems.join("\n")}`);
  cache = bundle;
  return bundle;
}

/** Cross-file checks that a single-file schema cannot express. */
export function validateReferences(bundle: ContentBundle): string[] {
  const problems: string[] = [];
  const skillIds = new Set(bundle.skills.map((s) => s.id));
  for (const lesson of bundle.lessons.values()) {
    for (const id of lesson.datasets) {
      if (!bundle.datasets.has(id)) problems.push(`${lesson.id}: bilinmeyen veri seti ${id}`);
    }
    if (lesson.projectId && !bundle.projects.has(lesson.projectId)) {
      problems.push(`${lesson.id}: bilinmeyen proje ${lesson.projectId}`);
    }
    for (const cell of lesson.cells) {
      for (const s of cell.skills) if (!skillIds.has(s)) problems.push(`${lesson.id}/${cell.id}: bilinmeyen beceri ${s}`);
      const datasetId =
        "datasetId" in cell
          ? cell.datasetId
          : cell.type === "experiment"
            ? cell.experiment.datasetId
            : cell.type === "challenge" && cell.challenge.kind === "prediction"
              ? cell.challenge.datasetId
              : null;
      if (datasetId && !bundle.datasets.has(datasetId)) {
        problems.push(`${lesson.id}/${cell.id}: bilinmeyen veri seti ${datasetId}`);
      }
      if (datasetId && cell.type !== "explanation" && !lesson.datasets.includes(datasetId)) {
        problems.push(`${lesson.id}/${cell.id}: ${datasetId} dersin datasets listesinde yok`);
      }
      if (cell.type === "colab") {
        const template = bundle.colabTemplates.get(cell.templateId);
        if (!template) problems.push(`${lesson.id}/${cell.id}: bilinmeyen Colab şablonu ${cell.templateId}`);
        else if (template.projectId !== lesson.projectId) {
          problems.push(`${lesson.id}/${cell.id}: Colab şablonu başka bir projeye ait (${template.projectId})`);
        }
        const compare = cell.compareWithCellId ? lesson.cells.find((c) => c.id === cell.compareWithCellId) : null;
        if (compare && compare.type !== "training") problems.push(`${lesson.id}/${cell.id}: compareWithCellId bir eğitim hücresi olmalı`);
      }
    }
  }
  for (const p of bundle.paths) {
    for (const m of p.modules) {
      for (const item of m.items) {
        if (item.kind === "lesson" && !bundle.lessons.has(item.lessonId)) problems.push(`${p.id}: bilinmeyen ders ${item.lessonId}`);
        if (item.kind === "project" && !bundle.projects.has(item.projectId)) problems.push(`${p.id}: bilinmeyen proje ${item.projectId}`);
      }
    }
  }
  for (const template of bundle.colabTemplates.values()) {
    if (!bundle.projects.has(template.projectId)) problems.push(`Colab şablonu ${template.id}: bilinmeyen proje ${template.projectId}`);
  }
  for (const project of bundle.projects.values()) {
    for (const lessonId of Object.values(project.modes)) {
      if (!bundle.lessons.has(lessonId)) problems.push(`${project.id}: bilinmeyen ders ${lessonId}`);
    }
    for (const s of project.skills) if (!skillIds.has(s)) problems.push(`${project.id}: bilinmeyen beceri ${s}`);
  }
  return problems;
}

/** Lightweight lesson metadata for lists (no cells). */
export interface LessonSummary {
  id: string;
  title: string;
  summary: string;
  level: Lesson["level"];
  estimatedMinutes: number;
  projectId?: string;
  labs: Lesson["labs"];
  requiredCellIds: string[];
  skills: string[];
}

export function summarizeLesson(lesson: Lesson): LessonSummary {
  return {
    id: lesson.id,
    title: lesson.title,
    summary: lesson.summary,
    level: lesson.level,
    estimatedMinutes: lesson.estimatedMinutes,
    projectId: lesson.projectId,
    labs: lesson.labs,
    requiredCellIds: lesson.cells.filter((c) => c.required).map((c) => c.id),
    skills: [...new Set(lesson.cells.flatMap((c) => c.skills))],
  };
}

export function lessonSummaries(): Record<string, LessonSummary> {
  return Object.fromEntries([...loadContent().lessons.values()].map((l) => [l.id, summarizeLesson(l)]));
}

/** Colab templates referenced by a lesson's cells. */
export function colabTemplatesForLesson(lesson: Lesson): Record<string, ColabTemplate> {
  const { colabTemplates } = loadContent();
  const ids = lesson.cells.flatMap((c) => (c.type === "colab" ? [c.templateId] : []));
  return Object.fromEntries(ids.map((id) => [id, colabTemplates.get(id)!]));
}

/** Datasets a lesson needs, without the CSV text for datasets the lesson doesn't use. */
export function datasetsForLesson(lesson: Lesson): Record<string, Dataset> {
  const { datasets } = loadContent();
  return Object.fromEntries(lesson.datasets.map((id) => [id, datasets.get(id)!]));
}
