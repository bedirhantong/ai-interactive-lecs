/* AI Atölye — Python runtime worker (Pyodide). Runs as a module worker.
 *
 * Runs student Python off the main thread. The main thread enforces timeouts
 * and "stop" by terminating this worker and starting a fresh one: that is the
 * only reliable way to stop CPU-bound code such as an infinite loop.
 *
 * Network: after start-up, fetch is restricted to the Pyodide package CDN and
 * other network APIs are removed. This is defence in depth, NOT a security
 * sandbox. See ARCHITECTURE.md ("Security boundaries").
 *
 * Message protocol is mirrored in lib/runtime/protocol.ts.
 */
const MAX_OUTPUT_CHARS = 100000;
const CELL_FILENAME = "<hucre>";

let pyodide = null;
let helpers = null;
let currentJob = null; // { id, silent, chars, truncated }

const HELPER_SOURCE = `
import traceback
from pyodide.code import eval_code_async

CELL = "${CELL_FILENAME}"

def _format_error(exc, source, filename):
    lines = source.split("\\n")
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == filename]
    line = None
    out = []
    if frames:
        out.append("Traceback (most recent call last):")
        for f in frames:
            text = lines[f.lineno - 1].strip() if f.lineno and 0 < f.lineno <= len(lines) else ""
            where = "" if f.name == "<module>" else f" ({f.name} içinde)"
            out.append(f"  Satır {f.lineno}{where}: {text}")
        line = frames[-1].lineno
    if isinstance(exc, SyntaxError):
        msg = exc.msg
        if exc.filename == filename and exc.lineno:
            line = exc.lineno
            out.append(f"  Satır {exc.lineno}: {(exc.text or '').strip()}")
    else:
        msg = str(exc)
    out.append(f"{type(exc).__name__}: {msg}" if msg else type(exc).__name__)
    return {"type": type(exc).__name__, "message": msg, "line": line, "traceback": "\\n".join(out)}

async def run_cell(source, globs, filename=CELL):
    try:
        result = await eval_code_async(source, globs, filename=filename)
    except BaseException as exc:
        return {"ok": False, "error": _format_error(exc, source, filename)}
    if result is None:
        return {"ok": True, "value": None}
    try:
        text = repr(result)
    except Exception as exc:
        text = f"<repr hatası: {exc}>"
    return {"ok": True, "value": text[:10000]}

async def run_tests(source, tests):
    globs = {"__name__": "__main__"}
    res = await run_cell(source, globs)
    if not res["ok"]:
        return {"ok": False, "error": res["error"], "tests": []}
    results = []
    for name, code in tests:
        try:
            await eval_code_async(code, globs, filename="<test>")
            results.append({"name": name, "passed": True, "message": ""})
        except AssertionError as exc:
            results.append({"name": name, "passed": False, "message": str(exc)})
        except BaseException as exc:
            results.append({"name": name, "passed": False, "message": f"{type(exc).__name__}: {exc}"})
    return {"ok": True, "tests": results}
`;

function post(message) {
  self.postMessage(message);
}

function emit(stream, text) {
  const job = currentJob;
  if (!job || job.silent || job.truncated) return;
  const remaining = MAX_OUTPUT_CHARS - job.chars;
  if (text.length > remaining) {
    post({ type: "stream", id: job.id, stream, text: text.slice(0, Math.max(0, remaining)) });
    post({ type: "stream", id: job.id, stream: "stderr", text: "\n[Çıktı çok uzun olduğu için kesildi.]\n" });
    job.truncated = true;
    job.chars = MAX_OUTPUT_CHARS;
    return;
  }
  job.chars += text.length;
  post({ type: "stream", id: job.id, stream, text });
}

function toJs(proxy) {
  const value = proxy.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false });
  proxy.destroy();
  return value;
}

function restrictNetwork(indexURL) {
  const nativeFetch = self.fetch.bind(self);
  const guardedFetch = (input, init) => {
    const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
    const absolute = new URL(url, self.location.href).href;
    if (absolute.startsWith(indexURL)) return nativeFetch(input, init);
    return Promise.reject(new TypeError("Ağ erişimi bu Python ortamında kapalı."));
  };
  for (const target of [self, Object.getPrototypeOf(self)]) {
    try {
      Object.defineProperty(target, "fetch", { value: guardedFetch, writable: false, configurable: false });
    } catch {
      /* best effort */
    }
  }
  for (const name of ["XMLHttpRequest", "WebSocket", "EventSource"]) {
    try {
      Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false });
    } catch {
      /* best effort */
    }
  }
}

async function init(indexURL) {
  post({ type: "status", message: "Python indiriliyor…" });
  const { loadPyodide } = await import(indexURL + "pyodide.mjs");
  pyodide = await loadPyodide({ indexURL });
  restrictNetwork(indexURL);
  pyodide.setStdout({ batched: (text) => emit("stdout", text + "\n") });
  pyodide.setStderr({ batched: (text) => emit("stderr", text + "\n") });
  pyodide.setStdin({ error: true });
  const ns = pyodide.globals.get("dict")();
  pyodide.runPython(HELPER_SOURCE, { globals: ns });
  helpers = { runCell: ns.get("run_cell"), runTests: ns.get("run_tests") };
  post({ type: "ready", version: pyodide.version });
}

async function loadPackages(id, code) {
  try {
    await pyodide.loadPackagesFromImports(code, {
      messageCallback: (message) => post({ type: "package", id, message }),
      errorCallback: (message) => post({ type: "package", id, message }),
    });
  } catch (err) {
    post({ type: "package", id, message: "Paket yüklenemedi: " + String(err && err.message ? err.message : err) });
  }
}

async function handle(msg) {
  switch (msg.type) {
    case "init":
      try {
        await init(msg.indexURL);
      } catch (err) {
        post({ type: "init-error", message: String(err && err.message ? err.message : err) });
      }
      return;
    case "mount":
      pyodide.FS.mkdirTree("/data");
      for (const file of msg.files) pyodide.FS.writeFile(file.path, file.content, { encoding: "utf8" });
      post({ type: "mounted" });
      return;
    case "run": {
      currentJob = { id: msg.id, silent: !!msg.silent, chars: 0, truncated: false };
      await loadPackages(msg.id, msg.code);
      const result = toJs(await helpers.runCell(msg.code, pyodide.globals));
      post({ type: "result", id: msg.id, ...result, truncated: currentJob.truncated });
      currentJob = null;
      return;
    }
    case "test": {
      currentJob = { id: msg.id, silent: false, chars: 0, truncated: false };
      await loadPackages(msg.id, msg.code);
      const tests = pyodide.toPy(msg.tests.map((t) => [t.name, t.code]));
      const result = toJs(await helpers.runTests(msg.code, tests));
      tests.destroy();
      post({ type: "test-result", id: msg.id, ...result, truncated: currentJob.truncated });
      currentJob = null;
      return;
    }
  }
}

// Messages are handled strictly one at a time.
let chain = Promise.resolve();
self.onmessage = (event) => {
  chain = chain.then(() =>
    handle(event.data).catch((err) => {
      const id = event.data && event.data.id;
      post({ type: "fatal", id, message: String(err && err.message ? err.message : err) });
      currentJob = null;
    }),
  );
};
