#!/bin/bash
# Cloud SQL + Private Services Access provisioning for the standing env (plan D6).
#
# Idempotent-ish one-shot for a fresh project: allocates the PSA range, peers
# to Service Networking, creates the private-IP-only instance, then writes the
# DATABASE_URL secret for ESO. NOT Terraform-managed by design — TF keeps no
# state for it (adding a TF resource would balloon the CD's tf-plan into a
# CREATE for an instance that already exists) — instead this script IS the
# reviewable record; teardown steps live in docs/planning/k8s.md (D15).
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

# 3. Instance: POSTGRES_16, db-f1-micro, enterprise edition, private-IP only,
#    backups at 03:00 (enabled 2026-09-13), deletion protection OFF for the
#    teardown window (cleanup: docs/planning/k8s.md D15).
PW=$(openssl rand -hex 24)
gcloud sql instances create "$DB_INSTANCE" \
  --project="$PROJECT_ID" --database-version=POSTGRES_16 \
  --edition=enterprise --tier=db-f1-micro --region="$REGION" \
  --network="projects/$PROJECT_ID/global/networks/$VPC" \
  --no-assign-ip --storage-size=10GB --storage-type=SSD \
  --backup-start-time=03:00 \
  --root-password="$PW" \
  --no-deletion-protection

# 4. App role + database.
gcloud sql users create devsync --instance="$DB_INSTANCE" --password="$PW" --project="$PROJECT_ID" 2>/dev/null \
  || gcloud sql users set-password devsync --instance="$DB_INSTANCE" --password="$PW" --project="$PROJECT_ID"
gcloud sql databases create devsync --instance="$DB_INSTANCE" --project="$PROJECT_ID" 2>/dev/null || true

# 5. DATABASE_URL from the private IP (ESO reads Secret Manager key DATABASE_URL);
#    sslmode=require (the DSN the app must use for the private endpoint).
IP=$(gcloud sql instances describe "$DB_INSTANCE" --project="$PROJECT_ID" --format='value(ipAddresses[0].ipAddress)')
DSN=$(printf 'postgresql://devsync:%s@%s:5432/devsync?sslmode=require' "$PW" "$IP")
printf '%s' "$DSN" | gcloud secrets versions add "$DB_API" --project="$PROJECT_ID" --data-file=-

echo "private_ip=$IP"
echo "DATABASE_URL (version +) pushed to Secret Manager — ESO picks it up within 1h, or annotate the ExternalSecret with force-sync=\$(date +%s)."
