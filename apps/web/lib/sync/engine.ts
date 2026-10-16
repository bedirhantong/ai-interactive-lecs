/**
 * Offline-first sync between this browser and the API (see docs/SENKRONIZASYON.md).
 *
 * - Notebooks: always saved locally first. Each lesson has sync metadata
 *   {serverRevision, localSeq, syncedSeq}; "dirty" = localSeq > syncedSeq.
 *   Pushes use If-None-Match: * (first save) or If-Match: "<revision>".
 *   A 412 means another device saved in between: the server version is kept as
 *   a conflict and the student chooses which one to keep. Nothing is overwritten silently.
 * - Progress events and Colab reports: an outbox in local storage, sent in
 *   batches. Retries are safe because the API ignores duplicates.
 *
 * Dependencies (API, storage, time) are injected so the logic is unit-tested.
 */
import type { ApiResult } from "@/lib/api/client";
import { ApiError } from "@/lib/api/client";
import type { EvidenceEvent, SavedNotebook } from "@/lib/notebook/types";

export interface SyncMeta {
  serverRevision: number | null;
  localSeq: number;
  syncedSeq: number;
}

export interface Conflict {
  lessonId: string;
  serverRevision: number;
  serverUpdatedAt: string;
  serverState: SavedNotebook;
  detectedAt: string;
}

export interface OutboxEvent {
  client_event_id: string;
  lesson_id: string;
  cell_id: string;
  kind: string;
  detail: string;
  occurred_at: string;
}

export interface OutboxReport {
  id: string;
  lessonId: string;
  json: string;
}

/** Lesson structure needed to rebuild progress from a downloaded notebook. */
export interface LessonIndexEntry {
  version: number;
  requiredIds: string[];
  cells: Record<string, { required: boolean; skills: string[] }>;
}
export type LessonIndex = Record<string, LessonIndexEntry>;

export interface NotebookSummary {
  lesson_id: string;
  lesson_version: number;
  revision: number;
  updated_at: string;
}

interface NotebookOut extends NotebookSummary {
  state: SavedNotebook;
}

export interface SyncDeps {
  api: <T>(path: string, init?: { method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> }) => Promise<ApiResult<T>>;
  read: <T>(key: string) => T | null;
  write: (key: string, value: unknown) => boolean;
  remove: (key: string) => void;
  keys: (start: string) => string[];
  now: () => string;
  newId: () => string;
  /** Called with a downloaded notebook so the progress views can be rebuilt. */
  onNotebookDownloaded: (lessonId: string, state: SavedNotebook) => void;
  /** The session is no longer valid (401) or cannot sync (403). */
  onUnauthorized: (err: ApiError) => void;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "conflict" | "error";

/** Evidence kinds that are useful for teachers. Noisy ones (each slider move, each run) stay local. */
export const SYNCED_EVENT_KINDS = new Set([
  "cell-completed",
  "lesson-completed",
  "challenge-passed",
  "challenge-attempt",
  "error-fixed",
  "model-trained",
  "reflection-submitted",
  "labels-completed",
  "mistake-inspected",
  "hint-revealed",
  "solution-revealed",
  "colab-opened",
  "report-imported",
]);

const OUTBOX_EVENTS = "outbox:events";
const OUTBOX_REPORTS = "outbox:reports";
const CONFLICTS = "sync:conflicts";
const MAX_OUTBOX_EVENTS = 5000;
const EVENT_BATCH = 100;

const metaKey = (lessonId: string) => `sync:${lessonId}`;
const notebookKey = (lessonId: string) => `notebook:${lessonId}`;
const etag = (revision: number) => `"${revision}"`;

export class SyncEngine {
  constructor(private readonly deps: SyncDeps) {}

  // --- metadata -----------------------------------------------------------------------

  meta(lessonId: string): SyncMeta {
    return this.deps.read<SyncMeta>(metaKey(lessonId)) ?? { serverRevision: null, localSeq: 0, syncedSeq: 0 };
  }

  private setMeta(lessonId: string, meta: SyncMeta) {
    this.deps.write(metaKey(lessonId), meta);
  }

  isDirty(lessonId: string): boolean {
    const m = this.meta(lessonId);
    return m.localSeq > m.syncedSeq;
  }

  conflicts(): Record<string, Conflict> {
    return this.deps.read<Record<string, Conflict>>(CONFLICTS) ?? {};
  }

  private setConflict(conflict: Conflict | null, lessonId: string) {
    const all = this.conflicts();
    if (conflict) all[lessonId] = conflict;
    else delete all[lessonId];
    this.deps.write(CONFLICTS, all);
  }

  /** The local snapshot changed (autosave). */
  noteLocalChange(lessonId: string) {
    const m = this.meta(lessonId);
    this.setMeta(lessonId, { ...m, localSeq: m.localSeq + 1 });
  }

  // --- notebooks: push ----------------------------------------------------------------

  /** Send the local snapshot if it has unsynced changes. Returns false if blocked (conflict, offline, auth). */
  async pushNotebook(lessonId: string): Promise<boolean> {
    if (this.conflicts()[lessonId]) return false;
    const snapshot = this.deps.read<SavedNotebook>(notebookKey(lessonId));
    const meta = this.meta(lessonId);
    if (!snapshot || meta.localSeq <= meta.syncedSeq) return true;
    const seq = meta.localSeq;
    const headers: Record<string, string> = meta.serverRevision === null ? { "if-none-match": "*" } : { "if-match": etag(meta.serverRevision) };
    try {
      const { data } = await this.deps.api<NotebookOut>(`/notebooks/${lessonId}`, { method: "PUT", body: snapshot, headers });
      const latest = this.meta(lessonId); // more local changes may have happened while the request was in flight
      this.setMeta(lessonId, { serverRevision: data.revision, localSeq: latest.localSeq, syncedSeq: seq });
      return true;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.status === 412) {
        await this.recordConflictFromServer(lessonId);
        return false;
      }
      if (err.status === 404 && err.code === "notebook_not_found") {
        // The server copy is gone (e.g. data was reset): create it again from this device.
        this.setMeta(lessonId, { ...this.meta(lessonId), serverRevision: null });
        return this.pushNotebook(lessonId);
      }
      this.handleError(err);
      return false;
    }
  }

  private async recordConflictFromServer(lessonId: string) {
    const { data } = await this.deps.api<NotebookOut>(`/notebooks/${lessonId}`);
    this.setConflict(
      { lessonId, serverRevision: data.revision, serverUpdatedAt: data.updated_at, serverState: data.state, detectedAt: this.deps.now() },
      lessonId,
    );
  }

  // --- notebooks: pull ----------------------------------------------------------------

  private acceptServer(lessonId: string, nb: NotebookOut) {
    this.deps.write(notebookKey(lessonId), nb.state);
    const m = this.meta(lessonId);
    this.setMeta(lessonId, { serverRevision: nb.revision, localSeq: m.localSeq, syncedSeq: m.localSeq });
    this.deps.onNotebookDownloaded(lessonId, nb.state);
  }

  /** Bring one lesson up to date before it is opened. Never overwrites unsynced local work. */
  async refreshNotebook(lessonId: string): Promise<"current" | "downloaded" | "conflict" | "absent"> {
    let nb: NotebookOut;
    try {
      nb = (await this.deps.api<NotebookOut>(`/notebooks/${lessonId}`)).data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return "absent";
      if (err instanceof ApiError) this.handleError(err);
      throw err;
    }
    const meta = this.meta(lessonId);
    if (meta.serverRevision === nb.revision) return "current";
    const local = this.deps.read<SavedNotebook>(notebookKey(lessonId));
    if (!local || !this.isDirty(lessonId)) {
      this.acceptServer(lessonId, nb);
      return "downloaded";
    }
    this.setConflict({ lessonId, serverRevision: nb.revision, serverUpdatedAt: nb.updated_at, serverState: nb.state, detectedAt: this.deps.now() }, lessonId);
    return "conflict";
  }

  /** On sign-in / app start: download what changed elsewhere, then upload local changes. */
  async pullAll(): Promise<void> {
    const { data: summaries } = await this.deps.api<NotebookSummary[]>("/notebooks");
    for (const s of summaries) {
      const meta = this.meta(s.lesson_id);
      if (meta.serverRevision === s.revision) continue;
      await this.refreshNotebook(s.lesson_id);
    }
  }

  /** Lessons with local changes that the server has not seen. */
  dirtyLessons(): string[] {
    return this.deps
      .keys("notebook:")
      .map((k) => k.slice("notebook:".length))
      .filter((id) => this.isDirty(id) || this.meta(id).serverRevision === null);
  }

  async pushAll(): Promise<void> {
    for (const lessonId of this.dirtyLessons()) {
      const m = this.meta(lessonId);
      if (m.serverRevision === null && m.localSeq === m.syncedSeq) this.noteLocalChange(lessonId); // never uploaded: mark for upload
      await this.pushNotebook(lessonId);
    }
  }

  // --- conflicts ----------------------------------------------------------------------

  /** "local": keep this device's version (uploaded on top of the server's). "server": take the other device's. */
  async resolveConflict(lessonId: string, keep: "local" | "server"): Promise<void> {
    const conflict = this.conflicts()[lessonId];
    if (!conflict) return;
    if (keep === "server") {
      this.setConflict(null, lessonId);
      this.acceptServer(lessonId, {
        lesson_id: lessonId,
        lesson_version: conflict.serverState.lessonVersion,
        revision: conflict.serverRevision,
        updated_at: conflict.serverUpdatedAt,
        state: conflict.serverState,
      });
      return;
    }
    const m = this.meta(lessonId);
    this.setMeta(lessonId, { serverRevision: conflict.serverRevision, localSeq: Math.max(m.localSeq, m.syncedSeq + 1), syncedSeq: m.syncedSeq });
    this.setConflict(null, lessonId);
    await this.pushNotebook(lessonId);
  }

  // --- outbox: progress events and reports ----------------------------------------------

  enqueueEvent(event: EvidenceEvent) {
    if (!SYNCED_EVENT_KINDS.has(event.kind)) return;
    const outbox = this.deps.read<OutboxEvent[]>(OUTBOX_EVENTS) ?? [];
    outbox.push({
      client_event_id: this.deps.newId(),
      lesson_id: event.lessonId,
      cell_id: event.cellId,
      kind: event.kind,
      detail: event.detail.slice(0, 300),
      occurred_at: event.at,
    });
    this.deps.write(OUTBOX_EVENTS, outbox.slice(-MAX_OUTBOX_EVENTS));
  }

  pendingEvents(): number {
    return (this.deps.read<OutboxEvent[]>(OUTBOX_EVENTS) ?? []).length;
  }

  async flushEvents(): Promise<void> {
    for (;;) {
      const outbox = this.deps.read<OutboxEvent[]>(OUTBOX_EVENTS) ?? [];
      if (outbox.length === 0) return;
      const batch = outbox.slice(0, EVENT_BATCH);
      try {
        await this.deps.api("/progress/events", { method: "POST", body: batch });
      } catch (err) {
        if (err instanceof ApiError && err.status === 422) {
          // A malformed event would block the queue forever: drop this batch (they are self-reported evidence only).
          console.warn("[sync] dropped invalid progress events", err.details);
        } else {
          if (err instanceof ApiError) this.handleError(err);
          return;
        }
      }
      const sent = new Set(batch.map((e) => e.client_event_id));
      const remaining = (this.deps.read<OutboxEvent[]>(OUTBOX_EVENTS) ?? []).filter((e) => !sent.has(e.client_event_id));
      this.deps.write(OUTBOX_EVENTS, remaining);
    }
  }

  enqueueReport(lessonId: string, json: string) {
    const outbox = this.deps.read<OutboxReport[]>(OUTBOX_REPORTS) ?? [];
    outbox.push({ id: this.deps.newId(), lessonId, json });
    this.deps.write(OUTBOX_REPORTS, outbox);
  }

  async flushReports(): Promise<void> {
    for (const item of this.deps.read<OutboxReport[]>(OUTBOX_REPORTS) ?? []) {
      try {
        await this.deps.api(`/reports?lesson_id=${encodeURIComponent(item.lessonId)}`, { method: "POST", rawBody: item.json });
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 422) {
          if (err instanceof ApiError) this.handleError(err);
          return;
        }
        console.warn("[sync] report rejected by the server", err.code);
      }
      const remaining = (this.deps.read<OutboxReport[]>(OUTBOX_REPORTS) ?? []).filter((r) => r.id !== item.id);
      this.deps.write(OUTBOX_REPORTS, remaining);
    }
  }

  // --- all ----------------------------------------------------------------------------

  async syncAll(): Promise<void> {
    await this.pushAll();
    await this.flushEvents();
    await this.flushReports();
  }

  private handleError(err: ApiError) {
    if (err.status === 401 || err.status === 403) this.deps.onUnauthorized(err);
  }
}

/** Rebuild progress entries from a notebook snapshot using the lesson index. */
export function completionsFromNotebook(state: SavedNotebook, entry: LessonIndexEntry) {
  return Object.entries(state.completions ?? {})
    .filter(([cellId]) => entry.cells[cellId])
    .map(([cellId, c]) => ({ cellId, at: c.at, evidence: c.evidence, required: entry.cells[cellId].required, skills: entry.cells[cellId].skills }));
}
