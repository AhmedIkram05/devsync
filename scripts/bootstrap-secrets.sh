#!/usr/bin/env bash
# Populate the 6 Secret Manager containers that infra/terraform owns, so a
# destroy+recreate (or brand-new project) works end to end.
# Idempotent: skips any secret that already has a version. Never prints secret values.
# Usage: PROJECT_ID=<id> bash scripts/bootstrap-secrets.sh [--force]   (--force overwrites)
#
#   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET   sourced from .env (reuse OAuth app)
#   JWT_SECRET_KEY / FERNET_KEY / POSTGRES_PASSWORD   generated via python secrets
#   DATABASE_URL   localhost placeholder (the standing env runs in-cluster postgres
#                  via the prod overlay patch; this value is only the SM fill)
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?export PROJECT_ID=<gcp project id>}"
FORCE="${1:-}"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env"

exists() {
  gcloud secrets describe "$1" --project "$PROJECT_ID" >/dev/null 2>&1 \
    && gcloud secrets versions list "$1" --project "$PROJECT_ID" --filter="state:ENABLED" --format="value(name)" | grep -q .
}

put() { # $1=name, $2=value
  local name="$1"
  if [[ "$FORCE" == "--force" ]] || ! exists "$name"; then
    printf '%s' "${2}" | gcloud secrets versions add "$name" --project "$PROJECT_ID" --data-file=- --quiet >/dev/null
    echo "  $name: written"
  else
    echo "  $name: exists, skipped"
  fi
}

# --- read GitHub OAuth from .env (values never echoed) ---
GH_ID=""
GH_SECRET=""
if [[ -f "$ENV_FILE" ]]; then
  GH_ID="$(grep -E '^GITHUB_CLIENT_ID=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
  GH_SECRET="$(grep -E '^GITHUB_CLIENT_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
fi
[[ -n "$GH_ID" && -n "$GH_SECRET" ]] || { echo "ERROR: GITHUB_CLIENT_ID/SECRET not found in .env" >&2; exit 1; }

GEN="$(python3 - <<'PY'
import secrets, base64
print(secrets.token_urlsafe(48))          # JWT_SECRET_KEY
print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())  # FERNET_KEY
print(secrets.token_urlsafe(24))          # POSTGRES_PASSWORD
PY
)"
JWT_KEY="$(sed -n 1p <<<"$GEN")"
FERNET="$(sed -n 2p <<<"$GEN")"
PGPASS="$(sed -n 3p <<<"$GEN")"

DATABASE_VAL="postgresql://devsync:${PGPASS}@localhost:5432/devsync?sslmode=disable"

echo "Bootstrapping 6 secrets in project ${PROJECT_ID} (idempotent):"
put JWT_SECRET_KEY "$JWT_KEY"
put FERNET_KEY "$FERNET"
put POSTGRES_PASSWORD "$PGPASS"
put GITHUB_CLIENT_ID "$GH_ID"
put GITHUB_CLIENT_SECRET "$GH_SECRET"
put DATABASE_URL "$DATABASE_VAL"
echo "Done. Verify: gcloud secrets list --project ${PROJECT_ID}"
