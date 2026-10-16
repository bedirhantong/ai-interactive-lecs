# AI Atölye — Architecture

```
                       ┌──────────────── Student's browser ─────────────────┐
 content/ (JSON, CSV,  │  Next.js app (prerendered lessons, client notebook) │
 .ipynb) ── build ───▶ │   ├─ Görsel Lab   TypeScript ML + SVG charts        │
                       │   ├─ Python Lab   Pyodide in a module Web Worker    │──▶ jsDelivr (Pyodide, Monaco)
                       │   └─ Colab Lab    launcher + report import          │──▶ Google Colab (student's account)
                       │  localStorage: notebooks, progress, portfolio       │
                       └──────────────────────────────┬─────────────────────┘
                                                      │ (not wired yet)
                                   FastAPI ── PostgreSQL: users, sessions, snapshots,
                                   progress events, training reports, classrooms
```

The server never runs student code. It stores and authorizes data.

## 1. Content model (`content/`, `apps/web/lib/content/schema.ts`)

Hierarchy: **learning path → module → lesson / project → notebook cells**. Everything is JSON validated with zod at build time (`loadContent`) and in `tests/unit/content.test.ts`, including cross-file references: datasets, skills, projects, Colab templates and cell references.

A lesson declares `id`, `version`, `level` (`explorer` | `builder` | `developer`), `labs`, `objectives`, `datasets`, `concepts` and an ordered list of `cells`. Cell types:

| Cell | Lab | What it does |
|---|---|---|
| `explanation` | content | Safe Markdown (no raw HTML) with KaTeX and callout variants |
| `experiment` | visual | `linear-regression` (manual + real gradient descent) or `knn-2d` (draggable probe, decision regions) |
| `dataset` | visual | Sort/filter/distribution, or a **labeling** activity whose labels really feed later training |
| `training` | visual | KNN / decision tree on chosen features; experiment history for model comparison |
| `evaluation` | visual | Accuracy, comparison table, confusion matrix, precision/recall, mistake inspection with neighbours |
| `code` | python | Monaco editor, real execution, streamed output, Turkish error explanations |
| `challenge` | python / visual | `code` (tests in an isolated namespace), `experiment-goal`, `prediction` |
| `colab` | colab | Template launcher, report import, evaluation and comparison |
| `reflection` | content | Free text, minimum length, flagged for teacher review, never auto-graded |

`labs` must equal the labs derived from the cells (`lib/labs`); a mismatch fails validation. One lesson can span several labs. The flagship *Yapıcı* lesson goes Visual → Python → Colab.

**Versioning.** Saved notebooks record `lessonVersion`. On load, `restoreCells` keeps the state of every cell that still exists with the same type, drops removed cells, settles interrupted runs and shows a "this lesson was updated" notice. Student work in unchanged cells is never discarded.

## 2. Visual Lab (`lib/ml`, `components/charts`, experiment/training/evaluation cells)

Pure, deterministic TypeScript: KNN (ties broken by id, then by the nearest tied neighbour), CART tree (Gini; first strictly better split wins), OLS and batch gradient descent on standardized x. The train/test split is a fixed arithmetic hash of the row id, so it can be reproduced exactly in Python.

Every number shown is computed live from the lesson's dataset. Badges say what kind of computation a cell performs ("Gerçek eğitim", "Gerçek hesaplama", "Gerçek Python"). Nothing is a canned animation. Manual line fitting is explicitly labelled as *not* training.

## 3. Visual-to-code (`lib/ml/codegen.ts`, `components/notebook/generated-code.tsx`)

1. Visual state → deterministic Python (standard library only).
2. **Code reveal:** a read-only Python tab that updates with the controls.
3. **Editable copy:** forked from the generated code. While unedited, it follows the controls. After the first edit it is *detached*: visual changes never overwrite it, a banner says so, and only an explicit, confirmed "Üretilen koda dön" resets it. Switching tabs never destroys custom code.
4. **Independent programming:** code challenges without visual help.

There is deliberately no parsing of student Python back into visual controls. `tests/unit/ml.test.ts` runs the generated programs with CPython and asserts they reproduce the browser results exactly (KNN accuracy including standardized variants, regression MSE, the KNN probe, and every decision-tree prediction).

## 4. Python Lab (`public/python-worker.js`, `lib/runtime`)

- Pyodide 314 (Python 3.14) in a **module** worker, using `import(pyodide.mjs)`. The classic `importScripts` build does not load in Chrome; this was verified.
- One shared namespace per notebook (Jupyter-like). Challenges run student code and tests in a fresh, isolated dict. After a pass, the code is re-run silently in the shared namespace so later cells can use it.
- Jobs are serialized. **Stop and timeout terminate the worker** and start a new one; this is the only reliable way to stop CPU-bound loops. Starting up and package downloads re-arm the timeout. Stopping during start-up settles the job (regression-tested).
- Output is capped at 100k characters per run. `input()` raises a clear error. Tracebacks are trimmed to the student's lines, and errors get authored Turkish explanations (`lib/tutor/error-explainer.ts`).
- Datasets are mounted at `/data/<file>.csv`. Packages load on demand via `loadPackagesFromImports` (numpy, pandas and scikit-learn are available).
- The runtime starts only for lessons that use Python (`lessonNeedsPythonRuntime`), preloaded about 600 ms after the notebook opens.

## 5. Colab Lab (`content/colab`, `scripts/*colab*`, `lib/labs/colab`, `colab-cell.tsx`)

- **Templates** are standard nbformat-4 notebooks generated from `scripts/build_colab_notebooks.py`, with a manifest (`<id>.json`) carrying the semver `version`, project, report schema version, CPU/GPU expectation and steps. The notebooks are in Turkish, run on CPU, use no network and no `pip install`, and finish in about 10–30 s.
- **Launch:** an official `colab.research.google.com/github/<repo>/blob/<branch>/content/colab/<file>` link when `NEXT_PUBLIC_COLAB_GITHUB_REPO` is set; otherwise a download from `/colab/<file>` plus upload instructions. Opening never completes a task.
- **Report contract `1.0`** (`lib/labs/colab/report.ts`, mirrored in `apps/api/app/services/reports.py`) contains project and template ids, notebook version, environment, dataset sizes, every experiment's train/validation accuracy, the selected experiment, test accuracy, macro-F1, the confusion matrix, per-class metrics and the loss curve. Import enforces a 200 KB limit, plain JSON only, strict bounds, dropped unknown keys, project/template/major-version checks and a consistency check (accuracy vs. confusion-matrix trace, totals, labels). The report is labelled **self-reported, unverified**.
- **Verification of the template itself:** `scripts/verify_colab_notebook.py` executes the notebook headlessly and copies the report it really produced to `apps/web/tests/fixtures/`. Unit tests, API tests and the e2e test all use that genuine report.

## 6. Learning evidence and progress

Completion rules (`lib/notebook/completion.ts`) require observable actions:
- a clean run or the expected output
- N separate experiment changes, counted after the student pauses so dragging is not rewarded
- two distinct model configurations
- passed tests
- a submitted reflection of minimum length
- a valid imported report

Completions are sticky and carry a human-readable evidence string. Every completion is marked `verification: "client"` (self-reported). Skills list the evidence behind them; the dashboard shows no streaks or leaderboards.

Storage in demo mode is `localStorage` only: per-lesson notebook snapshots (debounced at 700 ms, flushed on `pagehide`) and a persisted progress store (profile, lesson progress, skill evidence, recent events, private portfolio). Notebooks can be exported as `.ipynb`; interactive cells become markdown summaries plus versioned `metadata.aiatolye` state.

## 7. API (`apps/api`)

FastAPI with versioned routes under `/api/v1`. Layered: routes (HTTP only) → services (use cases, authorization, raise domain errors; no HTTP) → repositories (queries) → models; pure domain rules in `app/domain`; composition root `app/api/deps.py` (constructor injection; `Clock`, `PasswordHasher`, `UnitOfWork` are Protocols, overridden in tests). Every response uses the base envelope `{success, data, meta}` / `{success: false, error}`. Endpoints: `auth` (login by email or username, demo, password change, logout, logout-all, me), `accounts` (teacher creates student accounts with one-time passwords, bulk; reset; admin creates teachers), `lessons` (read-only catalog from `content/`), `notebooks/{lesson}` (owner-only snapshot, envelope and size checked), `progress/events` (bounded batches, cursor pagination), `reports` (Colab reports, validated), `classrooms` (create, join code, approve, assignments, student progress and reports for teachers).

Sync contract (see `docs/SENKRONIZASYON.md`): notebook snapshots carry a `revision` (ETag); saves require `If-None-Match: *` (create) or `If-Match` (update) and are applied with an atomic compare-and-set UPDATE (412 on conflict, 428 without a precondition); progress events carry a client id and are ingested with `INSERT … ON CONFLICT DO NOTHING` (idempotent retries); Colab reports are deduplicated by a canonical content hash.

Privacy (KVKK): `/me` export (everything stored about the user, no secrets), rectification (`PATCH /me`), erasure (`POST /me/delete`, database cascades, verified by tests on SQLite with foreign keys enabled and on PostgreSQL), and an access log (`audit_events`) written in the same transaction as the access it records; students read their own (`/me/access-log`). Retention via `python -m app.cli cleanup` (audit 365 days; inactive-student deletion opt-in). See `docs/KVKK_NOTLARI.md`.

Data model: `audit_events` (actor, subject, action; references nulled when an account is deleted), `users` (role, email for staff / username for students, `must_change_password`, `created_by_id`, age band, `is_demo`), `auth_attempts` (rate limiting; HMAC-keyed hashes only), `sessions` (only SHA-256 token hashes are stored), `student_notebooks`, `progress_events`, `training_reports` (with `verification` and `teacher_note`), `classrooms`, `classroom_memberships` (`pending` → `active`), `assignments`. Lesson content is intentionally not stored in tables.

Platform: one error envelope `{"error": {code, message, request_id, details?}}` with stable machine-readable codes and Turkish messages; validation errors list fields but never echo input; unexpected errors become `internal_error` without leaking internals. Every request gets an `X-Request-ID` (a well-formed incoming one is reused) and one structured JSON access-log line; bodies are never logged. `/health/live` (process) and `/health/ready` (database reachable and schema at the latest migration, otherwise 503). Security headers on every response (nosniff, frame denial, `no-referrer`, `no-store`, a strict CSP for JSON, HSTS in production). JSON documents are `jsonb` on PostgreSQL (migration 0002).

Security: httpOnly SameSite=Lax cookies (Secure required in production); state-changing requests need the `x-atolye-client` header and an allowed Origin; role checks run on the server; teachers see only approved members of their own classrooms; demo mode is refused in production; there are no execution endpoints (tested).

## 8. Security boundaries

| Boundary | Guarantee | Not guaranteed |
|---|---|---|
| Student code ↔ app | Runs in a worker with no DOM or storage access; network limited to the Pyodide CDN after start-up | Not a sandbox: the `js` FFI remains. Acceptable while only authored lessons and the student's own code run. Shared notebooks require a cross-origin sandboxed iframe first. |
| Uploaded reports | JSON only, bounded, validated, never executed | Authenticity. Reports can be fabricated; they are labelled self-reported. |
| Browser-side grading | Tests run in an isolated namespace | Integrity. Hidden tests are not secret. Use teacher review for grades. |
| API | Server-side authorization on every route | Rate limiting and audit logging (Phase 7) |

## 9. Future infrastructure (deliberately not built)

There are no per-student kernels, GPU servers or job queues. The intended production shape is a static/CDN frontend, one small API instance and managed PostgreSQL. Heavier labs mean more Colab templates, not more servers. Options if needed later: self-hosted Pyodide, an image-classification Colab template with a pretrained backbone (clearly labelled as transfer learning), and an optional LLM tutor behind the existing authored-hint fallback.
