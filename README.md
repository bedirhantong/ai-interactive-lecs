# AI Atölye

An interactive AI learning platform for students aged 11–18 in Türkiye. Students learn by experimenting, writing real Python and training real models: **Understand → Experiment → Code → Train → Evaluate → Improve → Build.** The student-facing interface is in Turkish.

AI Atölye orchestrates the learning journey and is not a compute provider. All computation happens in one of three places, and none of them is our server:

| Lab | Runs on | Examples |
|---|---|---|
| **Görsel Lab** (Visual) | Student's browser, TypeScript | Linear regression with gradient descent, KNN decision regions, decision trees, confusion matrices |
| **Python Lab** | Student's browser, Pyodide in a Web Worker | Code cells, graded challenges, numpy on demand |
| **Colab Lab** | Student's own Google Colab session | Larger datasets, random forests, neural networks; the report is imported back |

There is no GPU, no Jupyter server and no student code execution in the API.

## What's in the repository

```
apps/web     Next.js 16 (App Router), TypeScript, Tailwind v4, zustand, Monaco, Pyodide
apps/api     FastAPI, SQLAlchemy 2, Alembic, PostgreSQL: accounts, snapshots, progress, reports, classrooms
content/     Lessons (JSON), learning paths, project, skills, synthetic datasets (CSV), Colab templates (.ipynb)
scripts/     Dataset generator, Colab notebook builder and headless verifier
docs/        ARCHITECTURE.md, ARCHITECTURE_AUDIT.md, REVISED_ROADMAP.md
```

Current status and known gaps: [`DEVELOPMENT_STATUS.md`](DEVELOPMENT_STATUS.md).

**Yerel geliştirme kılavuzu (Türkçe): Docker, API, DBeaver, Postman ve sorun giderme → [`docs/YEREL_GELISTIRME.md`](docs/YEREL_GELISTIRME.md)**

## Requirements

- Node.js 20+ (tested on 26) and npm
- Python 3.12+ (tested on 3.14), only needed for the API and notebook tooling
- Docker, optional, for PostgreSQL
- Internet access in the browser: Pyodide and Monaco load from jsDelivr

No paid services, GPU or LLM API key are required.

## Run the web app (the full student experience)

```bash
cd apps/web
npm install
cp .env.example .env.local   # optional; see below
npm run dev                  # http://localhost:3000
```

The web app works on its own in **demo mode**: no account is needed, and progress is stored only in the browser (`localStorage`). Start at `/` or `/ana-sayfa`.

Optional settings in `apps/web/.env.local`:

- `NEXT_PUBLIC_COLAB_GITHUB_REPO=owner/repo` enables the **"Google Colab'da Aç"** button once this repository is public on GitHub. Without it, students download the `.ipynb` file and upload it to Colab.
- `NEXT_PUBLIC_PYODIDE_INDEX_URL` lets you self-host Pyodide.

## Run the API (optional at this stage)

The web app does not call the API yet (see the status document). To run it:

```bash
npm run db:up                                 # PostgreSQL 17 in Docker on localhost:5433 (5433 avoids clashing with a local Postgres)
cd apps/api
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000   # docs at http://localhost:8000/docs
```

- **Demo accounts:** with `ATOLYE_DEMO_MODE=true`, `POST /api/v1/auth/demo {"role": "student"|"teacher"}` creates a throwaway account. The app refuses to start with demo mode on when `ATOLYE_ENV=production`.
- **Teacher/admin accounts:** `.venv/bin/python -m app.cli create-user --role teacher --email ... --name ...`. The password is read interactively; no credentials live in the code.
- State-changing requests must send the header `x-atolye-client: 1` (CSRF protection for cookie sessions).

## Tests

```bash
cd apps/web
npm run typecheck && npm run lint
npm test                    # Vitest: content, ML, TS↔Python equivalence (needs python3), store, runtime, Colab reports
npx playwright test         # E2E in installed Chrome; needs network for Pyodide

cd ../api && .venv/bin/python -m pytest -q   # in-memory SQLite
npm run test:api:pg                          # same tests on PostgreSQL, schema built by the Alembic migrations (from the repo root)
```

## Production

One server, Docker Compose, automatic HTTPS (Caddy) in front of the web app and API on one domain:

```bash
cp deploy/.env.prod.example deploy/.env.prod   # fill in SITE_ADDRESS and the secrets
npm run prod:up                                # db → migrate → api, maintenance, web → proxy
```

Full guide (Turkish): [`docs/DAGITIM.md`](docs/DAGITIM.md). CI (`.github/workflows/ci.yml`) runs lint, unit tests (SQLite and PostgreSQL), web build, Playwright e2e, the Postman contract, the Colab notebook, and a production-image smoke test over HTTPS on every push.

## Content tooling

```bash
python3 scripts/generate_datasets.py           # regenerate synthetic CSV datasets (seeded)
python3 scripts/build_colab_notebooks.py       # regenerate content/colab/*.ipynb from source
# Execute every Colab template headlessly and refresh the real report fixture used by the tests:
python3 -m venv .venv-notebooks && .venv-notebooks/bin/pip install numpy pandas scikit-learn matplotlib nbformat nbclient ipykernel
.venv-notebooks/bin/python scripts/verify_colab_notebook.py
```

Lessons are JSON files in `content/notebooks/`, validated against `apps/web/lib/content/schema.ts` at build time and by `npm test`. Bump a lesson's `version` when you change its cells; saved student state migrates per cell.

## Privacy

Demo mode collects nothing: there are no accounts, analytics or third-party trackers. The API is designed for data minimization: age bands instead of birth dates, private projects, and teacher access only after the teacher approves a join request. A KVKK and legal review is required before any production use with real student accounts (see `docs/REVISED_ROADMAP.md`, Phase 7).
