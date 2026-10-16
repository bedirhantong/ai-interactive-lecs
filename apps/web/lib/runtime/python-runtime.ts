/**
 * Browser Python runtime client.
 *
 * - Python (Pyodide) runs in a dedicated Web Worker, so the UI never blocks.
 * - Jobs run one at a time, in order. Cells share one Python namespace.
 * - Stop and timeouts terminate the worker and start a fresh one. This is the
 *   only reliable way to stop CPU-bound code; it also clears all variables,
 *   which the UI reports through `generation`.
 */
import type { FromWorker, RunError, TestCaseResult, ToWorker } from "./protocol";

export type RuntimeStatus = "idle" | "loading" | "ready" | "busy" | "error";

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  /** Increments every time the Python process is (re)started. */
  generation: number;
  message: string | null;
  version: string | null;
}

export type StopReason = "timeout" | "user" | "crash";

export interface RunResult {
  ok: boolean;
  value: string | null;
  error?: RunError;
  durationMs: number;
  truncated: boolean;
  stopped?: StopReason;
}

export interface TestRunResult {
  ok: boolean;
  error?: RunError;
  tests: TestCaseResult[];
  durationMs: number;
  stopped?: StopReason;
}

export interface JobCallbacks {
  onStream?: (stream: "stdout" | "stderr", text: string) => void;
  onPackage?: (message: string) => void;
}

export interface RuntimeOptions {
  indexURL: string;
  workerURL: string;
  files: { path: string; content: string }[];
  createWorker?: (url: string) => Worker;
}

interface PendingJob {
  id: number;
  callbacks: JobCallbacks;
  startedAt: number;
  timeoutMs: number;
  resolve: (msg: FromWorker | { type: "stopped"; reason: StopReason }) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Start-up was cancelled because the worker was stopped while Python was loading. */
class StartAborted extends Error {
  constructor(readonly reason: StopReason) {
    super("Python başlatılması durduruldu");
  }
}

export class PythonRuntime {
  private worker: Worker | null = null;
  private startPromise: Promise<void> | null = null;
  /** Settles a pending start when the worker is discarded mid-start, so queued jobs never hang. */
  private abortStart: ((reason: StopReason) => void) | null = null;
  private snapshot: RuntimeSnapshot = { status: "idle", generation: 0, message: null, version: null };
  private listeners = new Set<() => void>();
  private pending: PendingJob | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;

  constructor(private readonly options: RuntimeOptions) {}

  getSnapshot = (): RuntimeSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<RuntimeSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  /** Start the worker and load Python. Safe to call repeatedly. */
  start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    this.set({ status: "loading", message: "Python hazırlanıyor…", generation: this.snapshot.generation + 1 });
    const worker = (this.options.createWorker ?? ((url) => new Worker(url, { type: "module" })))(this.options.workerURL);
    this.worker = worker;
    this.startPromise = new Promise<void>((resolve, reject) => {
      this.abortStart = (reason) => reject(new StartAborted(reason));
      const onBoot = (event: MessageEvent<FromWorker>) => {
        const msg = event.data;
        if (msg.type === "status") this.set({ message: msg.message });
        else if (msg.type === "ready") {
          this.set({ version: msg.version, message: "Dosyalar hazırlanıyor…" });
          this.post({ type: "mount", files: this.options.files });
        } else if (msg.type === "mounted") {
          worker.removeEventListener("message", onBoot);
          worker.addEventListener("message", this.onMessage);
          this.abortStart = null;
          this.set({ status: "ready", message: null });
          resolve();
        } else if (msg.type === "init-error" || msg.type === "fatal") {
          worker.removeEventListener("message", onBoot);
          this.abortStart = null;
          this.failStart(msg.message);
          reject(new Error(msg.message));
        }
      };
      worker.addEventListener("message", onBoot);
      worker.addEventListener("error", (e) => {
        if (this.snapshot.status === "loading") {
          this.abortStart = null;
          this.failStart(e.message || "Python çalışma ortamı başlatılamadı.");
          reject(new Error(e.message));
        } else {
          this.finishPending({ type: "stopped", reason: "crash" });
          this.discardWorker();
        }
      });
      this.post({ type: "init", indexURL: this.options.indexURL });
    });
    return this.startPromise;
  }

  private failStart(message: string) {
    this.discardWorker();
    this.set({
      status: "error",
      message: `Python başlatılamadı: ${message}. İnternet bağlantını kontrol edip yeniden dene.`,
    });
  }

  private discardWorker(abortReason: StopReason = "user") {
    this.worker?.terminate();
    this.worker = null;
    this.startPromise = null;
    const abort = this.abortStart;
    this.abortStart = null;
    abort?.(abortReason);
  }

  private post(msg: ToWorker) {
    this.worker?.postMessage(msg);
  }

  private onMessage = (event: MessageEvent<FromWorker>) => {
    const msg = event.data;
    const job = this.pending;
    if (!job) return;
    if ("id" in msg && msg.id !== undefined && msg.id !== job.id) return;
    if (msg.type === "stream") job.callbacks.onStream?.(msg.stream, msg.text);
    else if (msg.type === "package") {
      // Downloading packages can be slow; it must not count as a runaway loop.
      this.armTimer(job);
      job.callbacks.onPackage?.(msg.message);
    }
    else if (msg.type === "result" || msg.type === "test-result" || msg.type === "fatal") this.finishPending(msg);
  };

  private armTimer(job: PendingJob) {
    if (job.timer) clearTimeout(job.timer);
    job.timer = setTimeout(() => this.stop("timeout"), job.timeoutMs);
  }

  private finishPending(msg: FromWorker | { type: "stopped"; reason: StopReason }) {
    const job = this.pending;
    if (!job) return;
    if (job.timer) clearTimeout(job.timer);
    this.pending = null;
    job.resolve(msg);
  }

  /** Serialize jobs: each waits for the previous one. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private dispatch(msg: ToWorker & { id: number }, callbacks: JobCallbacks, timeoutMs: number) {
    return new Promise<FromWorker | { type: "stopped"; reason: StopReason }>((resolve) => {
      const job: PendingJob = { id: msg.id, callbacks, startedAt: performance.now(), timeoutMs, resolve, timer: null };
      this.armTimer(job);
      this.pending = job;
      this.set({ status: "busy" });
      this.post(msg);
    }).finally(() => {
      if (this.worker && this.snapshot.status === "busy") this.set({ status: "ready" });
    });
  }

  run(code: string, opts: JobCallbacks & { timeoutMs?: number; silent?: boolean } = {}): Promise<RunResult> {
    return this.enqueue(async () => {
      const startError = await this.tryStart();
      if (startError) return { ok: false, value: null, durationMs: 0, truncated: false, error: startError };
      const started = performance.now();
      const id = this.nextId++;
      const msg = await this.dispatch({ type: "run", id, code, silent: opts.silent }, opts, opts.timeoutMs ?? 20000);
      const durationMs = Math.round(performance.now() - started);
      if (msg.type === "result") {
        return { ok: msg.ok, value: msg.value ?? null, error: msg.error, durationMs, truncated: msg.truncated };
      }
      return { ok: false, value: null, durationMs, truncated: false, ...this.failure(msg) };
    });
  }

  runTests(
    code: string,
    tests: { name: string; code: string }[],
    opts: JobCallbacks & { timeoutMs?: number } = {},
  ): Promise<TestRunResult> {
    return this.enqueue(async () => {
      const startError = await this.tryStart();
      if (startError) return { ok: false, tests: [], durationMs: 0, error: startError };
      const started = performance.now();
      const id = this.nextId++;
      const msg = await this.dispatch({ type: "test", id, code, tests }, opts, opts.timeoutMs ?? 20000);
      const durationMs = Math.round(performance.now() - started);
      if (msg.type === "test-result") return { ok: msg.ok, error: msg.error, tests: msg.tests, durationMs };
      return { ok: false, tests: [], durationMs, ...this.failure(msg) };
    });
  }

  /** Start the runtime; a failure becomes a readable error instead of a hung cell. */
  private async tryStart(): Promise<RunError | null> {
    try {
      await this.start();
      return null;
    } catch (err) {
      if (err instanceof StartAborted) return this.failure({ type: "stopped", reason: err.reason }).error;
      const message = this.snapshot.message ?? "Python başlatılamadı.";
      return { type: "Başlatma hatası", message, line: null, traceback: message };
    }
  }

  private failure(msg: FromWorker | { type: "stopped"; reason: StopReason }): { error: RunError; stopped?: StopReason } {
    if (msg.type === "stopped") {
      const text =
        msg.reason === "timeout"
          ? "Kod çok uzun sürdü ve durduruldu. Sonsuz bir döngü olabilir mi?"
          : msg.reason === "user"
            ? "Çalışma senin isteğinle durduruldu."
            : "Python çalışma ortamı beklenmedik şekilde kapandı (bellek yetmemiş olabilir).";
      return {
        stopped: msg.reason,
        error: { type: msg.reason === "timeout" ? "Zaman aşımı" : "Durduruldu", message: text, line: null, traceback: text },
      };
    }
    const message = msg.type === "fatal" ? msg.message : "Bilinmeyen hata";
    return { error: { type: "RuntimeError", message, line: null, traceback: message } };
  }

  /**
   * Stop whatever is running by terminating the worker. All Python variables
   * are lost; the runtime restarts on the next job (or immediately if asked).
   */
  stop(reason: StopReason = "user") {
    const wasRunning = this.pending !== null || this.abortStart !== null;
    this.discardWorker(reason);
    this.finishPending({ type: "stopped", reason });
    this.set({
      status: "idle",
      message: wasRunning
        ? "Python ortamı yeniden başlatıldı. Önceki hücrelerdeki değişkenler silindi; gerekirse onları tekrar çalıştır."
        : null,
    });
  }

  /** Restart with a clean Python namespace. */
  async restart(): Promise<void> {
    this.stop("user");
    this.set({ message: "Python ortamı sıfırlandı. Tüm değişkenler silindi." });
    await this.start();
  }

  /**
   * Shut the worker down (e.g. when the notebook is hidden or closed). The
   * runtime can be started again later; Python state is not preserved.
   */
  dispose() {
    this.discardWorker();
    this.finishPending({ type: "stopped", reason: "user" });
    this.set({ status: "idle", message: null });
  }
}
