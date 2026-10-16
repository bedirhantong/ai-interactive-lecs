# Postman

1. `npm run db:up` (PostgreSQL in Docker), then start the API:
   `cd apps/api && .venv/bin/uvicorn app.main:app --reload --port 8000`
2. Postman → **Import** → `ai-atolye.postman_collection.json`. No environment needed: `baseUrl` and `teacherUrl` are collection variables (an optional environment file is included to override them).
3. Run the folders in order, or **Run collection** to run everything.

The student uses `localhost`, the teacher `127.0.0.1`: Postman keeps cookies per host, so the two demo sessions stay separate.

Command line (same checks): `npx newman run docs/postman/ai-atolye.postman_collection.json -e docs/postman/ai-atolye-local.postman_environment.json`

Regenerate after API changes: `python3 scripts/build_postman_collection.py`

Full guide (Turkish), including DBeaver and troubleshooting: [`../YEREL_GELISTIRME.md`](../YEREL_GELISTIRME.md)
