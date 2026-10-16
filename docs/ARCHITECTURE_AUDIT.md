# AI Atölye — Architecture Audit

_Audit date: 2026-10-16. Basis: direct inspection of the repository, `tsc`, `eslint`, `vitest`, `next build`, and browser runs with Playwright + Chrome. Nothing below is taken from earlier specifications without checking the code._

## 1. Current architecture

```
ai-interactive-lecs/
  apps/web      Next.js 16.4 (App Router, Cache Components, Turbopack), TypeScript, Tailwind v4
  apps/api      EMPTY — no backend exists yet
  content/      JSON lessons, learning paths, project, skills; CSV datasets (synthetic)
  scripts/      generate_datasets.py (seeded, reproducible synthetic data)
```

Everything that runs today runs **in the browser**:

| Concern | Implementation | Where |
|---|---|---|
| Lesson content | JSON files validated with zod at load time (`fs.readFileSync`, prerendered) | `content/`, `lib/content/*` |
| Notebook state | Per-lesson zustand store, debounced autosave to `localStorage` | `lib/notebook/*` |
| Visual experiments + ML | Pure TypeScript KNN, CART decision tree, OLS and gradient descent | `lib/ml/*`, `components/notebook/cells/*` |
| Python execution | Pyodide 314 (Python 3.14) in a **module** Web Worker, loaded from jsDelivr | `public/python-worker.js`, `lib/runtime/*` |
| Visual-to-code | Deterministic Python generators + fork/detach editable copy | `lib/ml/codegen.ts`, `components/notebook/generated-code.tsx` |
| Progress, skills, portfolio | zustand `persist` store in `localStorage` (self-reported) | `lib/progress/*` |
| Tutor | Authored hints + rule-based Turkish error explanations. No LLM. | `lib/tutor/*`, `assistant-panel.tsx` |

There is no server-side computation, no database and no authentication.

## 2. Implemented features and their status

Legend: **Verified** = exercised in a real browser or test this session. **Implemented, unverified** = code exists and typechecks but has not been exercised end to end. **Missing** = no code.

| Area | Status | Evidence / notes |
|---|---|---|
| Production build | **Verified** (after fix, see §5.1) | `next build` succeeds; all lessons/paths/projects prerendered |
| Route rendering (13 routes) | **Verified** | All return 200 in dev; unknown lesson renders the Turkish 404 UI |
| Content schema + cross-reference validation | **Verified** | `tests/unit/content.test.ts` (5 tests) |
| Python cell execution in Pyodide | **Verified** | Real output `MSE: 134.91` computed from the CSV in the worker |
| KNN 2-D experiment, decision regions | **Verified** | Screenshot + interaction, no console errors |
| Labeling → training → evaluation flow | **Verified** | Student labels feed training; progress advanced to 3/6 |
| Linear regression lab (manual + gradient descent) | Implemented, partly verified | Renders; training animation not exercised by a test |
| Generated Python tab + editable copy | Implemented, partly verified | Code tab renders; fork/detach/run not covered by tests |
| Code challenges (isolated test run) | Implemented, **unverified** | Worker `run_tests` path never run in a browser yet |
| Stop / timeout (worker terminate + restart) | Implemented, **unverified** | |
| Package loading (`import numpy`) | Implemented, **unverified** | Pyodide lock lists numpy, pandas, scikit-learn |
| Save → reload → restore | Implemented, **unverified** | Highest-priority gap for the acceptance criteria |
| Dashboard, paths, labs, project, portfolio, achievements, profile, privacy, landing | Implemented, visually verified for landing/notebook | Others render (HTTP 200) but were not inspected visually |
| `.ipynb` export of student notebooks | Implemented, **unverified** | |
| Mobile layout | Implemented, **unverified** | Drawers for outline/assistant; Monaco replaced by textarea on touch |
| Backend (FastAPI, DB, migrations) | **Missing** | `apps/api` is empty |
| Authentication, roles, demo accounts | **Missing** | Frontend "demo mode" = no account, localStorage only |
| Teacher dashboard, classrooms, assignments | **Missing** | |
| Docker Compose, env examples | **Missing** | |
| README / ARCHITECTURE / DEVELOPMENT_STATUS | **Missing** | |
| End-to-end tests | **Missing** | Ad-hoc Playwright scripts only |
| ML / codegen unit tests | **Missing** | The TS-vs-Python equivalence claim is untested |
| Colab Lab (templates, launcher, report import) | **Missing** | Required by the revised strategy |
| Planned lessons in learning paths | Placeholder by design | Shown as "Hazırlanıyor"; no empty pages are generated |

## 3. Reusable components (keep)

All of the following already match the revised three-lab strategy and should be preserved:

- **Visual Lab** — `lib/ml/*` (deterministic, dependency-free ML), `components/charts/*` (custom SVG, responsive, keyboard-accessible probe), experiment/dataset/training/evaluation cells. Zero server cost.
- **Python Lab** — `PythonRuntime` (serialized job queue, hard stop by worker termination, timeout re-armed during package downloads, start failures surfaced as cell errors), the worker protocol, Monaco/textarea editor, output and error rendering with Turkish explanations.
- **Visual-to-code** — generator functions and the fork/detach model: an unedited copy follows the controls; an edited copy is never overwritten except by an explicit, confirmed reset.
- **Evidence-based completion** — `lib/notebook/completion.ts`: completion requires an observable action, is sticky, and is labelled self-reported.
- **Content pipeline** — zod schemas, cross-file validation, prerendering, versioned lessons with `restoreCells` migration.

## 4. Unnecessary complexity and incorrect assumptions

| # | What exists / was assumed | Why it is a problem | Decision |
|---|---|---|---|
| 4.1 | Original spec: "future server runtime (Jupyter kernels, containers, quotas)" | Per-student kernels are the most expensive thing a solo developer could operate. | **Dropped.** Not implemented, and it will not be. Heavy computation goes to the student's own Colab. |
| 4.2 | Original spec: 23 database entities | Most have no current use case. | Backend scope cut to users/sessions, notebook snapshots, progress events, training reports, classrooms/assignments (later). |
| 4.3 | Original spec: `packages/notebook-schema`, `packages/lesson-content` | A single JS app consumes them; workspace packages add tooling with no benefit today. | Not created. Schema lives in `apps/web/lib/content/schema.ts`; the backend validates the subset it stores. |
| 4.4 | Implicit assumption that "execution provider" needs a class hierarchy | Only one in-browser runtime exists; Colab is not something we execute. | Use a small lab-type mapping (`lib/labs`), not an adapter framework. |
| 4.5 | Classic worker + `importScripts(pyodide.js)` | Fails in Chrome with Pyodide 314 (verified). | Already replaced by a module worker + `import(pyodide.mjs)`. |
| 4.6 | `dynamicParams = false` to force 404s | Incompatible with Cache Components (verified build error). | Not used; `notFound()` inside Suspense. |

## 5. Technical debt and defects

1. **Production build was broken** (fixed in this audit). `outputFileTracingIncludes` pointed outside the Turbopack root. Fix: `outputFileTracingRoot` and `turbopack.root` set to the repo root; dynamic content paths marked `turbopackIgnore`.
2. **No regression tests for the core claims.** Real execution, save/restore, challenge grading and TS↔Python equivalence are not under automated test. Priority P0.
3. **Lesson pages send each dataset twice** (parsed rows + raw CSV for Pyodide). Small today (160 rows); keep rows only once datasets grow.
4. **Third-party CDNs at runtime** (Pyodide, Monaco from jsDelivr). Free and cacheable, but a school network could block them. The Monaco fallback to a textarea exists; Pyodide has no fallback. Self-hosting is a documented config switch (`NEXT_PUBLIC_PYODIDE_INDEX_URL`).
5. **Dashboard subscribes to the whole progress store.** Fine at current size.
6. **No CSP or security headers** are configured.

## 6. Security and privacy

| Topic | Current state | Risk | Action |
|---|---|---|---|
| Server-side code execution | None exists | — | Keep it that way. There is no execute endpoint to remove. |
| Student Python in the browser | Worker with no DOM/localStorage access; `fetch` restricted to the Pyodide CDN, XHR/WebSocket removed after start | **Best effort, not a sandbox**: the `js` FFI and same-origin worker remain. Today only authored lessons and the student's own code run there. | When cookie-based API sessions exist, require a CSRF header and check Origin on every write. Before allowing shared/teacher-authored notebooks, move the runtime into a cross-origin sandboxed iframe. |
| Rendering untrusted text | `react-markdown` without raw HTML; images limited to same-origin paths | Low | Keep. |
| Data on shared computers | Reflections and code persist in `localStorage` | Medium for classroom PCs | Profile page has "export" and "delete all"; add an obvious "use as guest" notice later. |
| Grading integrity | All checks run in the browser | Students can fake completion | Labelled self-reported everywhere. Do not use for grades without a trusted check. |
| Colab report import (new) | — | Uploaded files are untrusted | JSON only, size cap, strict schema, consistency checks, never executed, labelled unverified. |
| Minors' data / KVKK | No accounts, no tracking, no third-party analytics | Legal review still required before any account system | Documented in the privacy page and roadmap Phase 7. |

## 7. Infrastructure assumptions

- **GPU**: none required anywhere. ✔
- **Server compute**: none. ✔
- **Database**: none yet. The planned backend must run on a single small instance + managed PostgreSQL.
- **External services**: jsDelivr CDN (Pyodide, Monaco), Google Fonts at build time (`next/font`, self-hosted at runtime). Google Colab is reached only by the student following a link.

## 8. Missing functionality (against the revised MVP workflow)

Primary workflow: _lesson → visual experiment → generated Python → edit and run Python → open notebook in Colab → train → export report → import into AI Atölye → evaluate → complete project._

| Step | Status |
|---|---|
| Lesson, visual experiment, generated Python, editable run | Exists (Yapıcı mode of the flagship project) |
| Open an advanced notebook in Colab | **Missing**: no templates, no launcher |
| Export training report from Colab | **Missing**: no report schema |
| Import + validate + visualize + reflect | **Missing** |
| Complete the project with evidence | Exists for browser stages; must include the Colab stage |

## 9. Recommended architecture changes

1. **Introduce explicit lab types** derived from cell types: `visual`, `python`, `colab`, plus shared `content` (explanations, reflections). Lessons declare the labs they use and the validator checks the declaration against the cells. The Python runtime starts only for lessons that use the Python Lab (already true, now driven by the same mapping).
2. **Add the Colab Lab as a new cell type `colab`**, backed by:
   - versioned `.ipynb` templates in `content/colab/`, generated from a Python builder script so they are reviewable and testable;
   - a template manifest (id, version, project, report schema version, CPU/GPU expectations);
   - a launcher that builds an official `colab.research.google.com/github/...` URL when a public GitHub repo is configured, and otherwise offers download + "upload to Colab" instructions;
   - a versioned training-report JSON schema (`1.0`) validated with zod in the browser (and later Pydantic on the server);
   - import UI: size cap, schema + project + version checks, consistency checks, metric visualization, comparison with the browser model, reflection.
3. **Integrate the Colab stage into the flagship project** (Yapıcı and Geliştirici modes) with a lesson version bump; saved progress migrates via the existing `restoreCells`.
4. **Keep the backend thin**: auth/sessions with a guarded demo mode, notebook snapshot sync, progress events, training report storage, later classrooms. No execution endpoints, no file storage beyond bounded JSON.

## 10. Prioritized refactor plan

| Priority | Work | Impact on existing code |
|---|---|---|
| P0 | Fix production build | Done (`next.config.ts`, `loader.ts`) |
| P0 | Lab-type metadata (`lib/labs`), lesson `labs` declaration + validation, badges in UI | Additive; schema field optional with derived default |
| P0 | Colab Lab: template builder + `.ipynb`, manifest, report schema, launcher, import cell, evaluation | New files + one new cell type in the schema union |
| P0 | Flagship project gets the Colab stage (lesson versions 1→2) | Content change; saved state migrates per cell |
| P0 | Tests: ML + codegen TS↔Python equivalence, report validation, notebook executed for real, Playwright e2e of the primary workflow | New tests only |
| P1 | README, ARCHITECTURE, DEVELOPMENT_STATUS | Docs |
| P1 | Thin FastAPI backend (auth, demo mode, notebooks, progress, reports) with tests and Alembic | New `apps/api` |
| P2 | Optional frontend ↔ backend sync | Additive; localStorage stays the offline default |
| P2 | Teacher MVP (classroom, join code, assignment, review) | New |
| P3 | CSP headers, self-hosted Pyodide/Monaco option, sandboxed runtime iframe, load testing | Config + infra |

## 11. Post-refactor status (same day)

| Planned item | Outcome |
|---|---|
| Fix production build | Done |
| Lab-type metadata | Done: `lib/labs`; every lesson declares `labs`, validated against its cells |
| Colab Lab | Done: template builder, manifest, launcher, report contract `1.0`, import, evaluation, comparison. The template is executed headlessly and its genuine report drives the tests. |
| Flagship project Colab stage | Done in Yapıcı and Geliştirici (lesson version 2, per-cell migration) |
| Tests | 47 Vitest, 5 Playwright e2e (including the primary workflow), 22 pytest |
| Defect found by the new tests | Stopping Python during start-up left the cell hanging forever. Fixed and regression-tested. |
| Defect found by real data | The first Colab dataset was too easy (every model at about 99.5%) to teach model selection. It now has realistic sensor noise, confusing objects and 4% label noise, so a deep tree visibly overfits. |
| Thin backend | Done: FastAPI + SQLAlchemy + Alembic, no execution endpoints. Tested on SQLite only. |
| Removed | Nothing. No unsafe execution path existed. |

Remaining risks are listed in [`DEVELOPMENT_STATUS.md`](../DEVELOPMENT_STATUS.md).
