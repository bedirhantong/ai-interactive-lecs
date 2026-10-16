"use client";

/**
 * Student progress for demo mode, stored only in this browser.
 *
 * All progress here is self-reported: it is computed in the browser and
 * could be altered by the student. It is good for motivation and
 * self-tracking, not as proof for grading. See ARCHITECTURE.md.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Level } from "@/lib/content/schema";
import type { EvidenceEvent } from "@/lib/notebook/types";
import { STORAGE_PREFIX } from "@/lib/storage";

export type AgeBand = "11-13" | "14-15" | "16-18";
export type EditorPreference = "monaco" | "basic";

export interface Profile {
  displayName: string;
  level: Level;
  ageBand: AgeBand | null;
  editor: EditorPreference;
}

export interface LessonProgress {
  lessonVersion: number;
  startedAt: string;
  lastOpenedAt: string;
  requiredTotal: number;
  completedRequired: string[];
  completedAt: string | null;
}

export interface SkillEvidence {
  lessonId: string;
  cellId: string;
  at: string;
  evidence: string;
}

export interface PortfolioEntry {
  projectId: string;
  lessonId: string;
  level: Level;
  completedAt: string;
  bestTestAccuracy: number | null;
  bestFeatures: string[];
  experiments: number;
  reflection: string | null;
  skills: string[];
  /** Imported Colab report summary (self-reported, unverified). */
  colab?: { algorithm: string; testAccuracy: number; nTest: number; nTrain: number };
}

interface ProgressState {
  profile: Profile;
  lessons: Record<string, LessonProgress>;
  skills: Record<string, SkillEvidence[]>;
  recent: EvidenceEvent[];
  portfolio: Record<string, PortfolioEntry>;
  lastLessonId: string | null;
  setProfile: (patch: Partial<Profile>) => void;
  openLesson: (lessonId: string, lessonVersion: number, requiredTotal: number) => void;
  recordCompletion: (args: {
    lessonId: string;
    cellId: string;
    required: boolean;
    evidence: string;
    skills: string[];
    at: string;
    requiredIds: string[];
  }) => { lessonCompleted: boolean };
  recordEvent: (event: EvidenceEvent) => void;
  upsertPortfolio: (entry: PortfolioEntry) => void;
  resetAll: () => void;
}

const defaultProfile: Profile = { displayName: "", level: "explorer", ageBand: null, editor: "monaco" };

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      profile: defaultProfile,
      lessons: {},
      skills: {},
      recent: [],
      portfolio: {},
      lastLessonId: null,

      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),

      openLesson: (lessonId, lessonVersion, requiredTotal) =>
        set((s) => {
          const now = new Date().toISOString();
          const existing = s.lessons[lessonId];
          return {
            lastLessonId: lessonId,
            lessons: {
              ...s.lessons,
              [lessonId]: existing
                ? { ...existing, lessonVersion, requiredTotal, lastOpenedAt: now }
                : { lessonVersion, requiredTotal, startedAt: now, lastOpenedAt: now, completedRequired: [], completedAt: null },
            },
          };
        }),

      recordCompletion: ({ lessonId, cellId, required, evidence, skills, at, requiredIds }) => {
        const s = get();
        const lesson = s.lessons[lessonId];
        if (!lesson) return { lessonCompleted: false };
        const completedRequired =
          required && !lesson.completedRequired.includes(cellId)
            ? [...lesson.completedRequired, cellId]
            : lesson.completedRequired;
        const allDone = requiredIds.every((id) => completedRequired.includes(id));
        const lessonCompleted = allDone && !lesson.completedAt;
        const nextSkills = { ...s.skills };
        for (const skill of skills) {
          const list = nextSkills[skill] ?? [];
          if (!list.some((e) => e.lessonId === lessonId && e.cellId === cellId)) {
            nextSkills[skill] = [...list, { lessonId, cellId, at, evidence }];
          }
        }
        set({
          skills: nextSkills,
          lessons: {
            ...s.lessons,
            [lessonId]: { ...lesson, completedRequired, completedAt: lesson.completedAt ?? (allDone ? at : null) },
          },
        });
        return { lessonCompleted };
      },

      recordEvent: (event) => set((s) => ({ recent: [event, ...s.recent].slice(0, 40) })),

      upsertPortfolio: (entry) =>
        set((s) => ({ portfolio: { ...s.portfolio, [`${entry.projectId}:${entry.lessonId}`]: entry } })),

      resetAll: () =>
        set({ profile: defaultProfile, lessons: {}, skills: {}, recent: [], portfolio: {}, lastLessonId: null }),
    }),
    {
      name: `${STORAGE_PREFIX}progress`,
      version: 1,
      storage: createJSONStorage(() => window.localStorage),
      skipHydration: true,
      partialize: ({ profile, lessons, skills, recent, portfolio, lastLessonId }) => ({
        profile,
        lessons,
        skills,
        recent,
        portfolio,
        lastLessonId,
      }),
    },
  ),
);
