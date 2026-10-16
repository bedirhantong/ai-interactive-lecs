import { describe, expect, it } from "vitest";
import type { FromWorker, ToWorker } from "@/lib/runtime/protocol";
import { PythonRuntime } from "@/lib/runtime/python-runtime";

/** Minimal Worker stand-in. `boot` decides whether start-up completes. */
class FakeWorker extends EventTarget {
  terminated = false;
  constructor(private readonly behaviour: { boot: boolean; answerRuns: boolean }) {
    super();
  }
  postMessage(msg: ToWorker) {
    const reply = (data: FromWorker) => queueMicrotask(() => !this.terminated && this.dispatchEvent(new MessageEvent("message", { data })));
    if (msg.type === "init" && this.behaviour.boot) reply({ type: "ready", version: "test" });
    if (msg.type === "mount") reply({ type: "mounted" });
    if (msg.type === "run" && this.behaviour.answerRuns) {
      reply({ type: "stream", id: msg.id, stream: "stdout", text: "merhaba\n" });
      reply({ type: "result", id: msg.id, ok: true, value: null, truncated: false });
    }
  }
  terminate() {
    this.terminated = true;
  }
}

function runtime(behaviour: { boot: boolean; answerRuns: boolean }) {
  const workers: FakeWorker[] = [];
  const rt = new PythonRuntime({
    indexURL: "x",
    workerURL: "x",
    files: [],
    createWorker: () => {
      const w = new FakeWorker(behaviour);
      workers.push(w);
      return w as unknown as Worker;
    },
  });
  return { rt, workers };
}

describe("PythonRuntime", () => {
  it("streams output and resolves a run", async () => {
    const { rt } = runtime({ boot: true, answerRuns: true });
    const out: string[] = [];
    const result = await rt.run("print('merhaba')", { onStream: (_s, t) => out.push(t) });
    expect(result.ok).toBe(true);
    expect(out.join("")).toBe("merhaba\n");
  });

  it("stopping while Python is still starting settles the run instead of hanging", async () => {
    const { rt, workers } = runtime({ boot: false, answerRuns: false });
    const pending = rt.run("x = 1");
    await new Promise((r) => setTimeout(r, 10));
    rt.stop("user");
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error?.type).toBe("Durduruldu");
    expect(workers[0].terminated).toBe(true);
  });

  it("a runaway job times out, the worker is terminated, and the next job gets a fresh worker", async () => {
    const { rt, workers } = runtime({ boot: true, answerRuns: false });
    const result = await rt.run("while True: pass", { timeoutMs: 30 });
    expect(result.stopped).toBe("timeout");
    expect(workers[0].terminated).toBe(true);
    void rt.run("print(1)", { timeoutMs: 30 });
    await new Promise((r) => setTimeout(r, 10));
    expect(workers.length).toBe(2);
  });
});
