# syntax=docker/dockerfile:1
# AI Atölye API. Build from the repository root (the API reads /content):
#   docker build -f apps/api/Dockerfile -t ai-atolye-api .

FROM python:3.14-slim AS deps
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
COPY apps/api/requirements.lock .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --require-virtualenv -r requirements.lock

FROM python:3.14-slim AS runtime
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ATOLYE_CONTENT_DIR=/app/content \
    WEB_CONCURRENCY=2 \
    FORWARDED_ALLOW_IPS=127.0.0.1
# Unprivileged user; the image runs no student code and needs no root.
RUN groupadd --system --gid 10001 atolye && useradd --system --uid 10001 --gid atolye --no-create-home atolye
COPY --from=deps /opt/venv /opt/venv
WORKDIR /app/api
COPY apps/api/app ./app
COPY apps/api/migrations ./migrations
COPY apps/api/alembic.ini ./alembic.ini
COPY content /app/content
USER atolye
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/live', timeout=2).status == 200 else 1)"]
# --proxy-headers: trust X-Forwarded-For only from FORWARDED_ALLOW_IPS (the reverse proxy),
# so rate limiting sees real client addresses. Access logs come from the app (JSON).
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers \"$WEB_CONCURRENCY\" --proxy-headers --forwarded-allow-ips \"$FORWARDED_ALLOW_IPS\" --no-access-log"]
