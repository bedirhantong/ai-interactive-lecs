/**
 * Typed, versioned content schema for AI Atölye.
 *
 * Content lives as JSON under /content and is validated with these schemas
 * at load time (and in tests). Long text fields accept either a string or an
 * array of lines so authors can write readable JSON.
 */
import { z } from "zod";
import { LAB_TYPES, labsOfCells } from "@/lib/labs";

export const LEVELS = ["explorer", "builder", "developer"] as const;
export const levelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof levelSchema>;

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "küçük harf, rakam ve tire");

/** A string, or an array of lines joined with "\n". */
const text = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v.join("\n") : v));

const hints = z.array(text).max(6).default([]);

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export const datasetMetaSchema = z.object({
  id: slug,
  title: z.string(),
  description: z.string(),
  file: z.string().regex(/^[a-z0-9-]+\.csv$/),
  synthetic: z.boolean(),
  provenance: z.string(),
  task: z.enum(["classification", "regression"]),
  idColumn: z.string(),
  nameColumn: z.string().optional(),
  target: z.string(),
  features: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      unit: z.string().optional(),
      description: z.string(),
    }),
  ),
  classes: z
    .array(z.object({ key: z.string(), label: z.string(), color: z.string() }))
    .optional(),
});
export type DatasetMeta = z.infer<typeof datasetMetaSchema>;

export type DatasetRow = Record<string, string | number> & { id: number };
export interface Dataset extends DatasetMeta {
  rows: DatasetRow[];
  /** Raw CSV text, mounted into the Python runtime at /data/<file>. */
  csv: string;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

const cellBase = {
  id: slug,
  title: z.string().optional(),
  /** Outline section this cell belongs to. Consecutive cells share a section. */
  section: z.string().optional(),
  /** Required cells must be completed (with evidence) to finish the lesson. */
  required: z.boolean().default(false),
  /** Authored, progressive hints (shown one at a time). */
  hints,
  /** Skill ids demonstrated when this cell is completed. */
  skills: z.array(slug).default([]),
};

export const explanationCellSchema = z.object({
  ...cellBase,
  type: z.literal("explanation"),
  variant: z.enum(["default", "tip", "note", "warning", "data"]).default("default"),
  markdown: text,
});

export const codeCompletionSchema = z.discriminatedUnion("kind", [
  /** The cell ran without raising an exception. */
  z.object({ kind: z.literal("run-success") }),
  /** The cell ran and stdout matched the pattern. */
  z.object({ kind: z.literal("output-match"), pattern: z.string(), description: z.string() }),
]);

export const codeCellSchema = z.object({
  ...cellBase,
  type: z.literal("code"),
  source: text,
  instructions: text.optional(),
  completion: codeCompletionSchema.optional(),
  timeoutSeconds: z.number().int().min(1).max(120).default(20),
});

const rangeSchema = z.object({ min: z.number(), max: z.number(), step: z.number() });

export const linearRegressionExperimentSchema = z.object({
  kind: z.literal("linear-regression"),
  datasetId: slug,
  x: z.string(),
  y: z.string(),
  /** manual: the student moves the line. fit: the student can also train it from data. */
  modes: z.array(z.enum(["manual", "fit"])).min(1),
  slope: rangeSchema.extend({ initial: z.number() }),
  intercept: rangeSchema.extend({ initial: z.number() }),
  /** Show the prediction for a chosen x value. */
  predictAt: z.number().optional(),
  /** Goal for the manual mode (used by challenges & completion). */
  goal: z.object({ maxMse: z.number().positive() }).optional(),
});

export const knn2dExperimentSchema = z.object({
  kind: z.literal("knn-2d"),
  datasetId: slug,
  features: z.tuple([z.string(), z.string()]),
  k: rangeSchema.extend({ initial: z.number().int() }),
  /** Initial position of the movable "mystery item". */
  probe: z.object({ x: z.number(), y: z.number() }),
  showBoundaryByDefault: z.boolean().default(false),
});

export const experimentCellSchema = z.object({
  ...cellBase,
  type: z.literal("experiment"),
  instructions: text.optional(),
  experiment: z.discriminatedUnion("kind", [linearRegressionExperimentSchema, knn2dExperimentSchema]),
  /** Visual-to-code: show the generated Python for the current visual state. */
  showCode: z.boolean().default(true),
  /** Allow the student to fork the generated code into an editable copy. */
  allowEditableCode: z.boolean().default(false),
  /** Minimum number of distinct parameter changes before the cell counts as explored. */
  minChanges: z.number().int().min(0).default(3),
});

export const datasetCellSchema = z.object({
  ...cellBase,
  type: z.literal("dataset"),
  datasetId: slug,
  instructions: text.optional(),
  columns: z.array(z.string()).optional(),
  showDistribution: z.boolean().default(true),
  /**
   * Labeling activity: the listed rows are shown without their label and the
   * student assigns one. Student labels replace the true labels in this
   * notebook's working copy of the dataset, so labeling mistakes really do
   * affect any model trained later in the notebook.
   */
  labeling: z
    .object({
      rowIds: z.array(z.number().int().nonnegative()).min(1).max(30),
    })
    .optional(),
});

export const algorithmSchema = z.enum(["knn", "decision-tree"]);
export type Algorithm = z.infer<typeof algorithmSchema>;

export const trainingCellSchema = z.object({
  ...cellBase,
  type: z.literal("training"),
  datasetId: slug,
  instructions: text.optional(),
  algorithms: z.array(algorithmSchema).min(1),
  featureOptions: z.array(z.string()).min(1),
  defaultFeatures: z.array(z.string()).min(1),
  allowFeatureSelection: z.boolean().default(true),
  allowSplitControl: z.boolean().default(false),
  defaultTestPercent: z.number().int().min(10).max(50).default(25),
  k: rangeSchema.extend({ initial: z.number().int() }).default({ min: 1, max: 15, step: 1, initial: 3 }),
  maxDepth: rangeSchema.extend({ initial: z.number().int() }).default({ min: 1, max: 6, step: 1, initial: 2 }),
  standardize: z.boolean().default(false),
  /** Use student labels from this notebook's labeling cells. */
  useStudentLabels: z.boolean().default(false),
  showCode: z.boolean().default(false),
  allowEditableCode: z.boolean().default(false),
  /** What counts as completing this cell. */
  completion: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("trained") }),
      z.object({ kind: z.literal("compared"), minRuns: z.number().int().min(2).default(2) }),
      z.object({ kind: z.literal("min-accuracy"), minTestAccuracy: z.number().min(0).max(1) }),
    ])
    .default({ kind: "trained" }),
});

export const evaluationCellSchema = z.object({
  ...cellBase,
  type: z.literal("evaluation"),
  sourceCellId: slug,
  instructions: text.optional(),
  show: z.array(z.enum(["accuracy", "confusion", "per-class", "mistakes", "compare"])).min(1),
  /** The student must open at least this many mistakes to inspect them. */
  minInspectedMistakes: z.number().int().min(0).default(1),
});

const challengeTestSchema = z.object({
  name: z.string(),
  code: text,
  /** Hidden tests run but their code is not shown. They are not secret: grading happens in the browser. */
  hidden: z.boolean().default(false),
});

export const codeChallengeSchema = z.object({
  kind: z.literal("code"),
  starterCode: text,
  tests: z.array(challengeTestSchema).min(1),
  solution: text.optional(),
  followUp: text.optional(),
});

export const experimentGoalChallengeSchema = z.object({
  kind: z.literal("experiment-goal"),
  targetCellId: slug,
  goal: z.discriminatedUnion("metric", [
    z.object({ metric: z.literal("mse"), max: z.number().positive(), mode: z.enum(["manual", "any"]).default("manual") }),
    z.object({ metric: z.literal("test-accuracy"), min: z.number().min(0).max(1) }),
  ]),
});

export const predictionChallengeSchema = z.object({
  kind: z.literal("prediction"),
  datasetId: slug,
  items: z
    .array(
      z.object({
        rowId: z.number().int().nonnegative(),
        explanation: text,
      }),
    )
    .min(1),
});

export const challengeCellSchema = z.object({
  ...cellBase,
  type: z.literal("challenge"),
  instructions: text,
  challenge: z.discriminatedUnion("kind", [
    codeChallengeSchema,
    experimentGoalChallengeSchema,
    predictionChallengeSchema,
  ]),
});

export const reflectionCellSchema = z.object({
  ...cellBase,
  type: z.literal("reflection"),
  prompt: text,
  guidingQuestions: z.array(z.string()).default([]),
  minLength: z.number().int().min(10).max(2000).default(60),
});

/**
 * Colab Lab: an advanced notebook that runs in the student's own Google Colab
 * session. AI Atölye launches it and imports the exported training report.
 * Opening the notebook never completes the cell; a valid report does.
 */
export const colabCellSchema = z.object({
  ...cellBase,
  type: z.literal("colab"),
  templateId: slug,
  instructions: text,
  /** Optional training cell in the same lesson whose browser model is compared with the Colab result. */
  compareWithCellId: slug.optional(),
});

export const cellSchema = z.discriminatedUnion("type", [
  explanationCellSchema,
  codeCellSchema,
  experimentCellSchema,
  datasetCellSchema,
  trainingCellSchema,
  evaluationCellSchema,
  challengeCellSchema,
  reflectionCellSchema,
  colabCellSchema,
]);

export type Cell = z.infer<typeof cellSchema>;
export type CellType = Cell["type"];
export type ExplanationCell = z.infer<typeof explanationCellSchema>;
export type CodeCell = z.infer<typeof codeCellSchema>;
export type ExperimentCell = z.infer<typeof experimentCellSchema>;
export type LinearRegressionExperiment = z.infer<typeof linearRegressionExperimentSchema>;
export type Knn2dExperiment = z.infer<typeof knn2dExperimentSchema>;
export type DatasetCell = z.infer<typeof datasetCellSchema>;
export type TrainingCell = z.infer<typeof trainingCellSchema>;
export type EvaluationCell = z.infer<typeof evaluationCellSchema>;
export type ChallengeCell = z.infer<typeof challengeCellSchema>;
export type CodeChallenge = z.infer<typeof codeChallengeSchema>;
export type ReflectionCell = z.infer<typeof reflectionCellSchema>;
export type ColabCell = z.infer<typeof colabCellSchema>;

// ---------------------------------------------------------------------------
// Lessons, paths, projects, skills
// ---------------------------------------------------------------------------

export const lessonSchema = z
  .object({
    id: slug,
    /** Bump when cells change in a way that affects saved student state. */
    version: z.number().int().positive(),
    title: z.string(),
    summary: z.string(),
    level: levelSchema,
    estimatedMinutes: z.number().int().positive(),
    objectives: z.array(z.string()).min(1),
    prerequisites: z.array(slug).default([]),
    projectId: slug.optional(),
    /** Execution environments this lesson uses. Must match its cells (validated). */
    labs: z.array(z.enum(LAB_TYPES)).min(1),
    /** Datasets mounted into the Python runtime under /data. */
    datasets: z.array(slug).default([]),
    concepts: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
    cells: z.array(cellSchema).min(1),
  })
  .superRefine((lesson, ctx) => {
    const ids = new Set<string>();
    for (const cell of lesson.cells) {
      if (ids.has(cell.id)) {
        ctx.addIssue({ code: "custom", message: `Tekrarlanan hücre kimliği: ${cell.id}` });
      }
      ids.add(cell.id);
    }
    const derived = labsOfCells(lesson.cells);
    if ([...lesson.labs].sort().join() !== [...derived].sort().join()) {
      ctx.addIssue({ code: "custom", message: `labs alanı hücrelerle uyuşmuyor: beyan ${lesson.labs.join(", ")}, hücreler ${derived.join(", ")}` });
    }
    for (const cell of lesson.cells) {
      const ref =
        cell.type === "evaluation"
          ? cell.sourceCellId
          : cell.type === "challenge" && cell.challenge.kind === "experiment-goal"
            ? cell.challenge.targetCellId
            : cell.type === "colab"
              ? (cell.compareWithCellId ?? null)
              : null;
      if (ref && !ids.has(ref)) {
        ctx.addIssue({ code: "custom", message: `${cell.id}: bilinmeyen hücre referansı ${ref}` });
      }
    }
  });
export type Lesson = z.infer<typeof lessonSchema>;

export const learningPathSchema = z.object({
  id: slug,
  order: z.number().int(),
  title: z.string(),
  description: z.string(),
  levels: z.array(levelSchema).min(1),
  modules: z.array(
    z.object({
      id: slug,
      title: z.string(),
      description: z.string(),
      items: z.array(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("lesson"), lessonId: slug }),
          z.object({ kind: z.literal("project"), projectId: slug }),
          /** Planned content: listed in the overview, no page is generated. */
          z.object({ kind: z.literal("planned"), title: z.string(), level: levelSchema }),
        ]),
      ),
    }),
  ),
});
export type LearningPath = z.infer<typeof learningPathSchema>;

export const projectSchema = z.object({
  id: slug,
  title: z.string(),
  tagline: z.string(),
  problem: text,
  objective: z.string(),
  datasetId: slug,
  hypothesisPrompt: z.string(),
  /** One lesson per experience level; all share the same learning objective. */
  modes: z.object({ explorer: slug, builder: slug, developer: slug }),
  completionCriteria: z.array(z.string()).min(1),
  skills: z.array(slug),
  limitations: z.array(z.string()).default([]),
});
export type Project = z.infer<typeof projectSchema>;

/** Manifest of a versioned Colab notebook template stored in content/colab/. */
export const colabTemplateSchema = z.object({
  id: slug,
  /** Semantic version of the notebook; embedded in exported reports. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string(),
  description: z.string(),
  projectId: slug,
  notebookFile: z.string().regex(/^[a-z0-9-]+\.ipynb$/),
  /** Training report schema the notebook exports (major must match the app). */
  reportSchemaVersion: z.string().regex(/^\d+\.\d+$/),
  estimatedMinutes: z.number().int().positive(),
  /** GPU is never required. "optional" means a GPU runtime speeds it up but CPU works. */
  accelerator: z.enum(["none", "optional"]),
  datasetNote: z.string(),
  steps: z.array(z.string()).min(1),
});
export type ColabTemplate = z.infer<typeof colabTemplateSchema>;

export const skillSchema = z.object({
  id: slug,
  title: z.string(),
  description: z.string(),
});
export const skillsFileSchema = z.array(skillSchema);
export type Skill = z.infer<typeof skillSchema>;

export const LEVEL_LABELS: Record<Level, string> = {
  explorer: "Kâşif",
  builder: "Yapıcı",
  developer: "Geliştirici",
};

export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  explorer: "Görsel deneyler, etiketleme ve kaydırıcılarla öğren. Kod bilgisi gerekmez.",
  builder: "Görsel deneyleri Python koduyla birleştir, model ayarlarını değiştir.",
  developer: "Python hücrelerinde gerçek kod yaz, modeli kendin kur ve değerlendir.",
};

/** Recommended first lesson for each level. */
export const STARTER_LESSON: Record<Level, string> = {
  explorer: "geri-donusum-kasif",
  builder: "tahmin-modeli-laboratuvari",
  developer: "geri-donusum-gelistirici",
};
