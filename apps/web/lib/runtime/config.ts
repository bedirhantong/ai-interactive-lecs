/** Pyodide distribution used by the browser runtime (override for self-hosting). */
export const PYODIDE_INDEX_URL =
  process.env.NEXT_PUBLIC_PYODIDE_INDEX_URL ?? "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

export const PYTHON_WORKER_URL = "/python-worker.js";
