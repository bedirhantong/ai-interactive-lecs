import { describe, expect, it } from "vitest";
import { loadContent } from "@/lib/content/loader";
import { isTestRow } from "@/lib/ml/data";

describe("authored content", () => {
  const content = loadContent();

  it("loads and validates every content file", () => {
    expect(content.lessons.size).toBeGreaterThanOrEqual(5);
    expect(content.paths.length).toBe(4);
    expect(content.datasets.get("geri-donusum")?.rows).toHaveLength(160);
  });

  it("marks every dataset as synthetic with provenance", () => {
    for (const ds of content.datasets.values()) {
      expect(ds.synthetic).toBe(true);
      expect(ds.provenance.length).toBeGreaterThan(20);
    }
  });

  it("gives the recycling project one lesson per level with a shared project id", () => {
    const project = content.projects.get("akilli-geri-donusum")!;
    for (const [level, lessonId] of Object.entries(project.modes)) {
      const lesson = content.lessons.get(lessonId)!;
      expect(lesson.level).toBe(level);
      expect(lesson.projectId).toBe(project.id);
    }
  });

  it("only asks students to label rows that end up in the training split", () => {
    const lesson = content.lessons.get("geri-donusum-kasif")!;
    const training = lesson.cells.find((c) => c.type === "training");
    for (const cell of lesson.cells) {
      if (cell.type !== "dataset" || !cell.labeling) continue;
      for (const id of cell.labeling.rowIds) {
        expect(isTestRow(id, 1, training?.type === "training" ? training.defaultTestPercent : 25)).toBe(false);
      }
    }
  });

  it("has at least one required, evidence-producing cell in every lesson", () => {
    for (const lesson of content.lessons.values()) {
      const required = lesson.cells.filter((c) => c.required);
      expect(required.length, lesson.id).toBeGreaterThan(0);
      expect(required.every((c) => c.type !== "explanation"), lesson.id).toBe(true);
    }
  });
});
