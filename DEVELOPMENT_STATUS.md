# Development status

_Last updated: 2026-10-16. Roadmap: [`docs/REVISED_ROADMAP.md`](docs/REVISED_ROADMAP.md)._

**Current phase:** v1 complete: student experience (guest or signed in), offline-first sync, teacher panel, KVKK rights, production stack and CI. Open source (MIT code, CC BY 4.0 content).

## Verified (automated tests or real browser runs)

| Feature | How it was verified |
|---|---|
| Production build (all lessons/paths/projects prerendered) | `next build` |
| Content schema, cross-references, lab declarations | Vitest (`content`, `colab`) |
| KNN, decision tree, OLS, gradient descent | Vitest (`ml`) |
| Generated Python reproduces browser results exactly | Vitest runs generated code with CPython |
| Notebook completion rules, stickiness, version migration | Vitest (`notebook-store`) |
| Runtime: streaming, timeout via worker termination, stop during start-up | Vitest with a fake worker (`python-runtime`) |
| Report import: real report accepted; tampered, oversized and foreign reports rejected | Vitest (`colab`) |
| **Primary workflow:** train two visual models → generated Python run in Pyodide matches (39/40) → edit detaches the copy and survives visual changes → notebook downloadable → bad report rejected → real report imported and compared → reload restores everything | Playwright e2e in Chrome |
| Python Lab: real output, Turkish error help, shared namespace, graded challenge, restore after reload | Playwright |
| Infinite loop stopped while running; fresh runtime afterwards | Playwright |
| numpy loads on demand in Pyodide | Playwright |
| Explorer project completed through actions; portfolio entry, `.ipynb` export, skill evidence | Playwright |
| Colab notebook runs end to end on CPU and exports a valid report (about 10 s) | `scripts/verify_colab_notebook.py` (nbclient) |
| API: auth, CSRF, demo guard, ownership, pagination, report validation, classroom boundaries, no execution routes | pytest |
| API platform: error envelope and codes, no input echo, 500s without internals but with request id and headers, request-id propagation and sanitizing, security headers, CORS allow-list, readiness (incl. pending migrations), JSON logs | pytest (33 tests total, SQLite and PostgreSQL) |
| Accounts: teacher-created students (username + one-time password), forced password change, policy (accent-insensitive name checks), resets sign out everywhere, admin-created teachers, per-account/per-IP login throttling with recovery, demo throttling, keyed-hash storage, cleanup | pytest (57 tests total, SQLite and PostgreSQL) |
| KVKK: export without secrets, profile correction, account deletion removes every row (FK cascades enforced in SQLite tests too), teacher deletes only accounts they created, access log with teacher views, audit anonymized after deletion, retention windows, opt-in inactive deletion | pytest (71 tests total, SQLite and PostgreSQL) |
| Sync: two-device conflict (412) and resolution, 428 without precondition, atomic compare-and-set at the database level, idempotent event retries (also within a batch and per user), report dedup across reformatting, CORS for If-Match/ETag | pytest (84 tests total, SQLite and PostgreSQL) |
| Postman collection (49 requests, 92 assertions) against the running API, including a run that reuses leftover cookies | Newman |
| **Web ↔ API (v1):** teacher creates a class and student accounts with printable one-time credentials; student's forced password change (weak password rejected); assignment shown to the student; real Python run and reflection synced; same work restored on a second device; concurrent edits on two devices raise the conflict prompt and the chosen version wins; teacher sees overview, evidence and reflection; access log shows the teacher's view; sign-out removes the account's local copy | Playwright against the real API and PostgreSQL (`accounts-sync.spec.ts`), also in CI |
| Sync engine: create/update with revisions, second device download, conflict on concurrent edits and both resolutions, offline then upload, expired session, outbox filtering/batching/idempotency, report upload | Vitest with an in-memory imitation of the API (`sync-engine.test.ts`) |
| Production stack from scratch (db → migrate → api/maintenance/web → Caddy HTTPS): readiness, web pages, HSTS and security headers, docs disabled, demo refused, admin login with HttpOnly+Secure+SameSite cookie, CSRF rejection, cleanup job | `scripts/prod_smoke_test.sh` against `deploy/compose.prod.yml`, locally with Docker |
| CI on GitHub Actions (all 6 jobs: API on SQLite and PostgreSQL, web build, e2e in Chrome, Postman contract, Colab notebook execution, production stack smoke test over HTTPS) | Green on GitHub. The first run's production-job failure (Compose v2 healthcheck/pull) was reproduced locally and fixed. |
| Python lint/format (ruff, incl. bandit security rules) | `npm run lint:api` |
| Alembic migration upgrades, matches models (`alembic check`) and downgrades | SQLite and PostgreSQL 17 (Docker) |
| All API tests pass on PostgreSQL with the schema built by migrations | `npm run test:api:pg` |
| API boots under uvicorn; demo session cookie; CSRF rejection | curl smoke test |

## Implemented but not verified

- The notebook was executed with nbclient locally, **not inside Google Colab**. Colab-specific paths (`google.colab.files.download`) are guarded but untested.
- The "Google Colab'da Aç" GitHub URL format is unit-tested but cannot work until the repository is public.
- Dark theme and the mobile layout were checked visually on a few screens only; there is no accessibility audit yet.
- Lessons `tahmin-modeli-laboratuvari` (gradient descent animation, editable regression code) and `geri-donusum-gelistirici` (full challenge path) are only partly covered by e2e tests.

## Known issues and limitations

- Teacher panel v1 covers classes, accounts, assignments and review; there is no admin UI yet (admins use the API/CLI).
- Guest (demo) work done before signing in is not moved into the account; it stays in the guest area of that browser.
- All progress, grading and Colab results are self-reported (computed in the browser or in the student's Colab session).
- The Python worker's network restriction is best effort, not a sandbox (see `docs/ARCHITECTURE.md` §8).
- Pyodide and Monaco depend on jsDelivr. Monaco falls back to a textarea; Pyodide has no offline fallback.
- With Cache Components, an unknown lesson URL renders the 404 page through streaming. Check the HTTP status in production hosting.

## Next steps

1. Validate with teachers: a pilot lesson in a real class (see the discussion in the roadmap).
2. Run the Colab template inside real Google Colab now that the repository is public.
4. e2e tests for the regression lab and developer mode; an accessibility pass.
5. Phase 7: CSP and security headers, a sandboxed runtime iframe, KVKK review, load testing.
