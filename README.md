# AI Atölye

[![CI](https://github.com/bedirhantong/ai-interactive-lecs/actions/workflows/ci.yml/badge.svg)](https://github.com/bedirhantong/ai-interactive-lecs/actions/workflows/ci.yml)
[![Code: MIT](https://img.shields.io/badge/kod-MIT-blue.svg)](LICENSE)
[![Content: CC BY 4.0](https://img.shields.io/badge/i%C3%A7erik-CC%20BY%204.0-lightgrey.svg)](content/LICENSE.md)

**Türkçe:** AI Atölye, 11–18 yaş öğrenciler için açık kaynaklı, Türkçe ve uygulamalı bir yapay zekâ öğrenme ortamıdır. Öğrenciler video izleyerek değil, deneyerek öğrenir: önce kod yazmadan görsel deneyler, sonra deneyin ürettiği Python kodunu düzenleme, sonra kendi kodunu yazma, en son kendi Google Colab oturumunda daha büyük modeller eğitme. Öğretmenler sınıf açar, öğrenci hesabı verir (öğrenciden e-posta istenmez), ödev verir ve öğrencilerin yaptıklarını ve yansıtma yazılarını görür. Her şey tarayıcıda çalışır; sunucu öğrenci kodu çalıştırmaz, GPU gerekmez.

**English:** An open-source, Turkish, hands-on AI learning environment for students aged 11–18. Students move from no-code visual experiments, to the Python those experiments generate, to their own code, to training larger models in their own Google Colab session. Teachers create classes and student accounts (no student emails), assign lessons and review students' evidence and reflections. All computation runs in the browser or in Colab; the server never runs student code.

## How it works

| Lab | Runs on | Examples |
|---|---|---|
| **Görsel Lab** (visual) | Student's browser, TypeScript | Linear regression with real gradient descent, KNN decision regions, decision trees, confusion matrices |
| **Python Lab** | Student's browser, Pyodide in a Web Worker | Code cells, auto-graded challenges with Turkish error explanations, numpy on demand |
| **Colab Lab** | Student's own Google Colab session | Larger datasets, random forests, neural networks; a training report is imported back |

- **Works without an account.** Guests use it in demo mode; work stays in the browser.
- **With an account**, work is saved locally first and synced to the server: it follows the student to another computer, and edits made on two devices are never silently overwritten (the student chooses).
- **Privacy by design** (KVKK): minimal data, no student email, data export and deletion, and an access log that shows students when a teacher viewed their work.

Flagship project: **Akıllı Geri Dönüşüm Makinesi** — a recycling classifier built at three levels (Kâşif, Yapıcı, Geliştirici) with a shared learning objective.

## Repository

```
apps/web     Next.js 16, TypeScript, Tailwind v4, zustand, Monaco, Pyodide
apps/api     FastAPI, SQLAlchemy 2, Alembic, PostgreSQL (layered: routes → services → repositories)
content/     Lessons (JSON), learning paths, project, skills, synthetic datasets, Colab templates  [CC BY 4.0]
scripts/     Dataset generator, Colab notebook builder/verifier, Postman collection builder, prod smoke test
deploy/      One-command production stack (Docker Compose + Caddy HTTPS)
docs/        Architecture, sync contract, deployment, local development (Turkish), KVKK notes
```

Status and known limitations: [`DEVELOPMENT_STATUS.md`](DEVELOPMENT_STATUS.md).

## Quick start

Requirements: Node.js 20+, and for the API Python 3.12+ and Docker.

```bash
# Student experience only (guest/demo mode, no backend needed)
cd apps/web && npm install && npm run dev          # http://localhost:3000

# Full stack: accounts, teacher panel, sync
npm run db:up                                       # PostgreSQL 17 in Docker (localhost:5433)
cd apps/api && python3 -m venv .venv && .venv/bin/pip install -e ".[dev]" && cp .env.example .env && cd ../..
npm run db:migrate && npm run api                   # http://localhost:8000/docs
```

With the API running, open http://localhost:3000/giris: in development you can try a **demo teacher** and a **demo student** without creating accounts.

Detailed guide (Turkish), including Docker, DBeaver, Postman and troubleshooting: [`docs/YEREL_GELISTIRME.md`](docs/YEREL_GELISTIRME.md).

## Tests

```bash
npm run lint:api && npm run test:api && npm run test:api:pg     # API: SQLite and PostgreSQL
cd apps/web && npm run lint && npm run typecheck && npm test     # web unit tests
cd apps/web && npx playwright test                              # e2e in Chrome (account/sync test needs the API)
```

CI runs all of this on every push, plus the Postman API contract, the Colab notebook end to end, and a production-image smoke test over HTTPS.

## Production

```bash
cp deploy/.env.prod.example deploy/.env.prod   # domain and secrets
npm run prod:up                                # db → migrate → api, maintenance, web → Caddy (automatic HTTPS)
```

Guide (Turkish): [`docs/DAGITIM.md`](docs/DAGITIM.md). Before using it with real students, read [`docs/KVKK_NOTLARI.md`](docs/KVKK_NOTLARI.md): it lists the legal questions (data controller, parental consent, retention) a school must settle.

## Documentation

| | |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, security boundaries |
| [`docs/SENKRONIZASYON.md`](docs/SENKRONIZASYON.md) | Offline-first sync contract (ETag/If-Match, idempotent events) |
| [`docs/YEREL_GELISTIRME.md`](docs/YEREL_GELISTIRME.md) | Local development, backend layering rules |
| [`docs/DAGITIM.md`](docs/DAGITIM.md) | Deployment, backups, monitoring |
| [`docs/KVKK_NOTLARI.md`](docs/KVKK_NOTLARI.md) | Privacy: what is implemented, what needs legal review |
| [`docs/postman/`](docs/postman) | Postman collection for the API |

## Contributing

Lessons, teacher feedback and fixes are very welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md). Please report security issues privately ([`SECURITY.md`](SECURITY.md)).

## License

- Code: [MIT](LICENSE)
- Educational content in `content/` (lessons, datasets, notebooks): [CC BY 4.0](content/LICENSE.md)

Datasets are synthetic (computer-generated for teaching) and do not describe real people or measurements.
