/** Message protocol between the main thread and public/python-worker.js. */

export interface RunError {
  type: string;
  message: string;
  /** 1-based line in the cell, when known. */
  line: number | null;
  /** Traceback trimmed to the student's own code. */
  traceback: string;
}

export interface TestCaseResult {
  name: string;
  passed: boolean;
  message: string;
}

export type ToWorker =
  | { type: "init"; indexURL: string }
  | { type: "mount"; files: { path: string; content: string }[] }
  | { type: "run"; id: number; code: string; silent?: boolean }
  | { type: "test"; id: number; code: string; tests: { name: string; code: string }[] };

export type FromWorker =
  | { type: "status"; message: string }
  | { type: "ready"; version: string }
  | { type: "init-error"; message: string }
  | { type: "mounted" }
  | { type: "stream"; id: number; stream: "stdout" | "stderr"; text: string }
  | { type: "package"; id: number; message: string }
  | { type: "result"; id: number; ok: boolean; value?: string | null; error?: RunError; truncated: boolean }
  | {
      type: "test-result";
      id: number;
      ok: boolean;
      error?: RunError;
      tests: TestCaseResult[];
      truncated: boolean;
    }
  | { type: "fatal"; id?: number; message: string };
