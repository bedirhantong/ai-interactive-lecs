#!/usr/bin/env bash
# Smoke test for the production stack (deploy/compose.prod.yml), through the HTTPS proxy.
#   scripts/prod_smoke_test.sh <env-file> [base-url]
# The stack must be running. Creates an admin with a random password, logs in, and checks the
# security-relevant behaviour of the deployed system. Exits non-zero on the first failure.
set -euo pipefail

ENV_FILE=${1:?usage: prod_smoke_test.sh <env-file> [base-url]}
BASE=${2:-https://localhost:8443}
COMPOSE=(docker compose -f deploy/compose.prod.yml --env-file "$ENV_FILE")
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT
H=(-H "x-atolye-client: 1" -H "origin: $BASE" -H "content-type: application/json")
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok   $*"; }
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

ready=$(curl -sfk "$BASE/api/v1/health/ready" | json 'd["data"]["status"], d["data"]["demo_mode"]')
[[ $ready == "ready False" ]] || fail "readiness: $ready"; ok "API ready, demo mode off"

[[ $(curl -sk -o /dev/null -w '%{http_code}' "$BASE/ders/geri-donusum-yapici") == 200 ]] || fail "web lesson page"; ok "web serves lessons"
[[ $(curl -sk -o /dev/null -w '%{http_code}' "$BASE/docs") == 404 ]] || fail "API docs must be off in production"; ok "API docs disabled"

headers=$(curl -sk -D - -o /dev/null "$BASE/api/v1/health/live")
grep -qi "strict-transport-security" <<<"$headers" || fail "HSTS header missing"
grep -qi "x-request-id" <<<"$headers" || fail "request id header missing"; ok "security headers present"

code=$(curl -sk "${H[@]}" -X POST "$BASE/api/v1/auth/demo" -d '{"role":"student"}' | json 'd["error"]["code"]')
[[ $code == demo_disabled ]] || fail "demo endpoint: $code"; ok "demo accounts refused"

PW="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"  # random; must not contain the account name
EMAIL="smoke-$(date +%s)@test.invalid"
"${COMPOSE[@]}" run --rm -T -e ATOLYE_NEW_USER_PASSWORD="$PW" api python -m app.cli create-user --role admin --email "$EMAIL" --name "Smoke Test" </dev/null >/dev/null
cookie=$(curl -sk -c "$JAR" "${H[@]}" -D - -o /dev/null -X POST "$BASE/api/v1/auth/login" -d "{\"login\":\"$EMAIL\",\"password\":\"$PW\"}" | grep -i "^set-cookie: atolye_session")
for flag in HttpOnly Secure "SameSite=lax"; do grep -qi "$flag" <<<"$cookie" || fail "session cookie lacks $flag"; done
ok "login over HTTPS, cookie HttpOnly+Secure+SameSite"

[[ $(curl -sk -b "$JAR" "$BASE/api/v1/auth/me" | json 'd["data"]["role"]') == admin ]] || fail "session not usable"; ok "session works"
[[ $(curl -sk -b "$JAR" -H "x-atolye-client: 1" -H "origin: https://evil.example" -X POST "$BASE/api/v1/auth/logout" -o /dev/null -w '%{http_code}') == 403 ]] || fail "CSRF check"
ok "cross-site request rejected"

"${COMPOSE[@]}" run --rm -T api python -m app.cli cleanup </dev/null | grep -q "Silinen:" || fail "cleanup job"; ok "cleanup job runs"
echo "All production smoke checks passed."
