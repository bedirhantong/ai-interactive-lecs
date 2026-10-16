import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResult } from "@/lib/api/client";
import type { EvidenceEvent, SavedNotebook } from "@/lib/notebook/types";
import { SyncEngine, completionsFromNotebook } from "@/lib/sync/engine";

/** In-memory imitation of the API's sync rules (revisions, 412/428, idempotent events). */
class FakeServer {
  notebooks = new Map<string, { revision: number; state: SavedNotebook; updated_at: string }>();
  events = new Map<string, unknown>();
  reports: string[] = [];
  offline = false;
  sessionValid = true;
  calls: string[] = [];

  handle = async <T,>(path: string, init: { method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}): Promise<ApiResult<T>> => {
    const method = init.method ?? "GET";
    this.calls.push(`${method} ${path}`);
    if (this.offline) throw new ApiError(0, "network", "offline");
    if (!this.sessionValid) throw new ApiError(401, "session_expired", "expired");
    const ok = (data: unknown, status = 200) => ({ data: data as T, status, headers: new Headers(), pagination: null });
    const nb = path.match(/^\/notebooks\/(.+)$/);
    if (method === "GET" && path === "/notebooks") {
      return ok([...this.notebooks].map(([lesson_id, n]) => ({ lesson_id, lesson_version: 1, revision: n.revision, updated_at: n.updated_at })));
    }
    if (nb && method === "GET") {
      const n = this.notebooks.get(nb[1]);
      if (!n) throw new ApiError(404, "notebook_not_found", "yok");
      return ok({ lesson_id: nb[1], lesson_version: 1, ...n });
    }
    if (nb && method === "PUT") {
      const current = this.notebooks.get(nb[1]);
      const ifMatch = init.headers?.["if-match"];
      const ifNone = init.headers?.["if-none-match"];
      if (ifNone === "*") {
        if (current) throw new ApiError(412, "notebook_revision_conflict", "çakışma");
        this.notebooks.set(nb[1], { revision: 1, state: init.body as SavedNotebook, updated_at: "t1" });
      } else if (ifMatch) {
        if (!current) throw new ApiError(404, "notebook_not_found", "yok");
        if (Number(ifMatch.replaceAll('"', "")) !== current.revision) throw new ApiError(412, "notebook_revision_conflict", "çakışma");
        this.notebooks.set(nb[1], { revision: current.revision + 1, state: init.body as SavedNotebook, updated_at: `t${current.revision + 1}` });
      } else throw new ApiError(428, "precondition_required", "başlık");
      const n = this.notebooks.get(nb[1])!;
      return ok({ lesson_id: nb[1], lesson_version: 1, ...n });
    }
    if (path === "/progress/events") {
      let stored = 0;
      for (const e of init.body as { client_event_id: string }[]) {
        if (this.events.has(e.client_event_id)) continue;
        this.events.set(e.client_event_id, e);
        stored++;
      }
      return ok({ stored }, 201);
    }
    if (path.startsWith("/reports")) {
      this.reports.push(init.rawBody!);
      return ok({}, 201);
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
}

/** One browser: its own local storage, talking to the shared server. */
function device(server: FakeServer) {
  const store = new Map<string, unknown>();
  let id = 0;
  const downloaded: string[] = [];
  const unauthorized = vi.fn();
  const engine = new SyncEngine({
    api: server.handle,
    read: <T,>(k: string) => (store.has(k) ? (structuredClone(store.get(k)) as T) : null),
    write: (k, v) => (store.set(k, structuredClone(v)), true),
    remove: (k) => void store.delete(k),
    keys: (start) => [...store.keys()].filter((k) => k.startsWith(start)),
    now: () => "2026-10-16T12:00:00Z",
    newId: () => `id-${++id}-${Math.random().toString(36).slice(2, 8)}`,
    onNotebookDownloaded: (lessonId) => downloaded.push(lessonId),
    onUnauthorized: unauthorized,
  });
  const save = (lessonId: string, source: string) => {
    store.set(`notebook:${lessonId}`, notebook(lessonId, source));
    engine.noteLocalChange(lessonId);
  };
  const local = (lessonId: string) => (store.get(`notebook:${lessonId}`) as SavedNotebook | undefined)?.cells["c"];
  return { engine, save, local, store, downloaded, unauthorized };
}

function notebook(lessonId: string, source: string): SavedNotebook {
  return {
    schema: 1,
    lessonId,
    lessonVersion: 1,
    savedAt: "",
    cells: { c: { kind: "code", source } as never },
    completions: { c: { at: "2026-10-16T10:00:00Z", evidence: "çalıştı", verification: "client" } },
    hintLevels: {},
    evidence: [],
  };
}

const L = "python-ilk-adimlar";

describe("notebook sync", () => {
  it("creates on the server, then updates with the revision it knows", async () => {
    const server = new FakeServer();
    const a = device(server);
    a.save(L, "v1");
    expect(await a.engine.pushNotebook(L)).toBe(true);
    expect(server.notebooks.get(L)?.revision).toBe(1);
    a.save(L, "v2");
    await a.engine.pushNotebook(L);
    expect(server.notebooks.get(L)).toMatchObject({ revision: 2 });
    expect(a.engine.isDirty(L)).toBe(false);
    expect(server.calls.filter((c) => c.startsWith("PUT"))).toHaveLength(2);
  });

  it("a second device downloads the notebook and its progress", async () => {
    const server = new FakeServer();
    const a = device(server);
    a.save(L, "dizüstü");
    await a.engine.pushNotebook(L);
    const b = device(server);
    await b.engine.pullAll();
    expect(b.local(L)).toMatchObject({ source: "dizüstü" });
    expect(b.downloaded).toEqual([L]);
    expect(b.engine.meta(L).serverRevision).toBe(1);
  });

  it("never overwrites: concurrent edits on two devices become a conflict the student resolves", async () => {
    const server = new FakeServer();
    const a = device(server);
    const b = device(server);
    a.save(L, "ortak");
    await a.engine.pushNotebook(L);
    await b.engine.pullAll();
    a.save(L, "dizüstü değişikliği");
    await a.engine.pushNotebook(L);
    b.save(L, "tablet değişikliği");
    expect(await b.engine.pushNotebook(L)).toBe(false);
    const conflict = b.engine.conflicts()[L];
    expect(conflict.serverRevision).toBe(2);
    expect(conflict.serverState.cells.c).toMatchObject({ source: "dizüstü değişikliği" });
    expect(server.notebooks.get(L)?.state.cells.c).toMatchObject({ source: "dizüstü değişikliği" }); // untouched
    // Blocked until resolved:
    b.save(L, "tablet ikinci değişiklik");
    expect(await b.engine.pushNotebook(L)).toBe(false);

    await b.engine.resolveConflict(L, "local");
    expect(server.notebooks.get(L)).toMatchObject({ revision: 3 });
    expect(server.notebooks.get(L)?.state.cells.c).toMatchObject({ source: "tablet ikinci değişiklik" });
    expect(b.engine.conflicts()[L]).toBeUndefined();
  });

  it("resolving with the server version replaces the local copy", async () => {
    const server = new FakeServer();
    const a = device(server);
    const b = device(server);
    a.save(L, "ilk");
    await a.engine.pushNotebook(L);
    await b.engine.pullAll();
    a.save(L, "diğer cihaz");
    await a.engine.pushNotebook(L);
    b.save(L, "bu cihaz");
    await b.engine.pushNotebook(L);
    await b.engine.resolveConflict(L, "server");
    expect(b.local(L)).toMatchObject({ source: "diğer cihaz" });
    expect(b.engine.isDirty(L)).toBe(false);
    expect(b.engine.meta(L).serverRevision).toBe(2);
  });

  it("opening a lesson with unsynced local work and a newer server copy raises a conflict instead of downloading", async () => {
    const server = new FakeServer();
    const a = device(server);
    const b = device(server);
    a.save(L, "ilk");
    await a.engine.pushNotebook(L);
    await b.engine.pullAll();
    a.save(L, "dizüstü");
    await a.engine.pushNotebook(L);
    server.offline = true;
    b.save(L, "çevrimdışı çalışma");
    await b.engine.pushNotebook(L);
    server.offline = false;
    expect(await b.engine.refreshNotebook(L)).toBe("conflict");
    expect(b.local(L)).toMatchObject({ source: "çevrimdışı çalışma" });
  });

  it("works offline and uploads later; local notebooks from before sign-in are uploaded too", async () => {
    const server = new FakeServer();
    const a = device(server);
    server.offline = true;
    a.save(L, "çevrimdışı");
    expect(await a.engine.pushNotebook(L)).toBe(false);
    a.store.set("notebook:tahmin-modeli-laboratuvari", notebook("tahmin-modeli-laboratuvari", "eski"));
    server.offline = false;
    await a.engine.syncAll();
    expect(server.notebooks.get(L)?.state.cells.c).toMatchObject({ source: "çevrimdışı" });
    expect(server.notebooks.has("tahmin-modeli-laboratuvari")).toBe(true);
  });

  it("reports an expired session", async () => {
    const server = new FakeServer();
    const a = device(server);
    server.sessionValid = false;
    a.save(L, "x");
    await a.engine.pushNotebook(L);
    expect(a.unauthorized).toHaveBeenCalledOnce();
    expect(a.engine.isDirty(L)).toBe(true);
  });
});

describe("outbox", () => {
  const ev = (kind: string, cellId = "c"): EvidenceEvent => ({ at: "2026-10-16T10:00:00Z", lessonId: L, cellId, kind: kind as EvidenceEvent["kind"], detail: "x".repeat(400) });

  it("queues only teacher-relevant events, trims details, and sends each exactly once", async () => {
    const server = new FakeServer();
    const a = device(server);
    a.engine.enqueueEvent(ev("experiment-changed")); // noisy: stays local
    a.engine.enqueueEvent(ev("challenge-passed"));
    a.engine.enqueueEvent(ev("model-trained"));
    expect(a.engine.pendingEvents()).toBe(2);
    server.offline = true;
    await a.engine.flushEvents();
    expect(a.engine.pendingEvents()).toBe(2);
    server.offline = false;
    await a.engine.flushEvents();
    expect(a.engine.pendingEvents()).toBe(0);
    expect(server.events.size).toBe(2);
    expect([...server.events.values()].every((e) => (e as { detail: string }).detail.length === 300)).toBe(true);
  });

  it("sends large queues in batches of 100", async () => {
    const server = new FakeServer();
    const a = device(server);
    for (let i = 0; i < 230; i++) a.engine.enqueueEvent(ev("challenge-attempt", `c${i}`));
    await a.engine.flushEvents();
    expect(server.calls.filter((c) => c.includes("/progress/events"))).toHaveLength(3);
    expect(server.events.size).toBe(230);
  });

  it("uploads queued Colab reports", async () => {
    const server = new FakeServer();
    const a = device(server);
    a.engine.enqueueReport("geri-donusum-yapici", '{"rapor":1}');
    await a.engine.flushReports();
    expect(server.reports).toEqual(['{"rapor":1}']);
    await a.engine.flushReports();
    expect(server.reports).toHaveLength(1);
  });
});

describe("progress rebuild", () => {
  it("maps completions to the lesson's required cells and skills", () => {
    const rows = completionsFromNotebook(notebook(L, "x"), { version: 1, requiredIds: ["c"], cells: { c: { required: true, skills: ["python-temelleri"] } } });
    expect(rows).toEqual([{ cellId: "c", at: "2026-10-16T10:00:00Z", evidence: "çalıştı", required: true, skills: ["python-temelleri"] }]);
  });
});
