#!/bin/bash
# Cloud SQL + Private Services Access bootstrap for the standing env (plan D6).
#
# SPLIT OF OWNERSHIP (infra-blockers 2026-10-12): the INSTANCE and DATABASE
# are Terraform-owned now (infra/terraform/cloudsql.tf, imported into state —
# tier db-g1-small, PITR on, deletion protection on at TF + API level). This
# script keeps the steps TF does not own: API enablement, the PSA range +
# Service Networking peering, the login user (password goes straight to
# Secret Manager, never to TF state), and the DATABASE_URL secret push.
#
# Fresh-project flow:
#   1. ./provision-cloudsql.sh          (this script: APIs, PSA, peering)
#   2. terraform apply                  (creates instance + database)
#   3. Rerun this script's user/secret steps or run them by hand (below).
#
# Teardown: docs/planning/k8s.md D15.
#
# Usage:
#   PROJECT_ID=<id> REGION=us-central1 DB_INSTANCE=devsync-db ./provision-cloudsql.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-us-central1}"
DB_INSTANCE="${DB_INSTANCE:-devsync-db}"
PSA_RANGE="${PSA_RANGE:-google-managed-services-default}"
PSA_PREFIX="${PSA_PREFIX:-24}"  # /24 — Cloud SQL needs one; nothing else shares it
VPC="${VPC:-default}"
DB_API="${DB_API:-DATABASE_URL}"

# 1. APIs (sqladmin + servicenetworking; both were enabled 2026-09-13).
gcloud services enable sqladmin.googleapis.com servicenetworking.googleapis.com --project="$PROJECT_ID"

# 2. PSA range + peering (no CIDR collision: pods 10.24.0.0/14, svc 34.118.224.0/20,
#    default subnet 10.128.0.0/20, PSA lands on 10.60.0.0/24; existing range no-ops).
gcloud compute addresses create "$PSA_RANGE" \
  --global --purpose=VPC_PEERING --prefix-length="$PSA_PREFIX" \
  --network="$VPC" --project="$PROJECT_ID" \
  --description "Cloud SQL private services access" 2>/dev/null || true
gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com \
  --ranges="$PSA_RANGE" --network="$VPC" --project="$PROJECT_ID" 2>/dev/null || true

# 3. Instance + database: TF-owned (infra/terraform/cloudsql.tf) —
#    POSTGRES_16, db-g1-small, private-IP-only, PITR on, deletion protection
#    on. This script no longer creates them; apply TF instead:
#      terraform init -backend-config=bucket=<tfstate-bucket>
#      terraform apply
#    (Existing-instance projects: import first — see the header of
#    cloudsql.tf.)

# 4. App role + password (TF-blind by design: the password is written
#    straight to Secret Manager and never enters TF state). If the user
#    already exists, STOP: pushing a fresh DSN here would not match the
#    existing password and brick the app's DATABASE_URL secret.
PW=$(openssl rand -hex 24)
gcloud sql users create devsync --instance="$DB_INSTANCE" --password="$PW" --project="$PROJECT_ID" 2>/dev/null || {
  echo "user devsync already exists — rotate deliberately instead:"
  echo "  gcloud sql users set-password devsync --instance=$DB_INSTANCE --password=<pw> --project=$PROJECT_ID"
  echo "  then push the matching DSN (step 5) or update Secret Manager."
  exit 1
}
gcloud sql databases create devsync --instance="$DB_INSTANCE" --project="$PROJECT_ID" 2>/dev/null || true

# 5. DATABASE_URL from the private IP (ESO reads Secret Manager key DATABASE_URL);
#    sslmode=require (the DSN the app must use for the private endpoint).
IP=$(gcloud sql instances describe "$DB_INSTANCE" --project="$PROJECT_ID" --format='value(ipAddresses[0].ipAddress)')
DSN=$(printf 'postgresql://devsync:%s@%s:5432/devsync?sslmode=require' "$PW" "$IP")
printf '%s' "$DSN" | gcloud secrets versions add "$DB_API" --project="$PROJECT_ID" --data-file=-

echo "private_ip=$IP"
echo "DATABASE_URL (version +) pushed to Secret Manager — ESO picks it up within 1h, or annotate the ExternalSecret with force-sync=\$(date +%s)."
