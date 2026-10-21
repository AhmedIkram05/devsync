# DNS is a manual Namecheap A-record for gcp.devsyncapp.me (plan D10) — no dns.tf.

locals {
  # Default compute SA email resolved at ROOT (no in-module data read): a
  # module-level depends_on defers data reads inside the module to apply
  # time, which turned member strings "unknown" during any pending-change
  # plan and showed spurious destroy+create for the IAM bindings — tripping
  # the CD no-destroy guard. One root data read, referenced everywhere.
  default_compute_sa = "${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

data "google_project" "current" {
  project_id = var.project_id
}

module "gke" {
  source      = "./modules/gke"
  project_id  = var.project_id
  region      = var.region
  zone        = var.zone
  environment = var.environment
  labels      = var.labels

  # Used by the module's default-node-SA repair grant; passed instead of read
  # in-module so the plan never sees an unknown member (see locals above).
  default_compute_sa_email = local.default_compute_sa

  depends_on = [google_project_service.required]
}

# Node-pool SA pulls images directly; WI only covers in-pod auth.
resource "google_project_iam_member" "nodes_ar_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${local.default_compute_sa}"
}

# GLBC (GKE ingress controller, runs as the node SA) attaches the Cloud Armor
# policy to the LB backend service — compute.securityAdmin required.
resource "google_project_iam_member" "armor_admin" {
  project = var.project_id
  role    = "roles/compute.securityAdmin"
  member  = "serviceAccount:${local.default_compute_sa}"
}

# In-cluster image registry, created ahead of any CI push.
resource "google_artifact_registry_repository" "images" {
  repository_id = "devsync-repo"
  format        = "Docker"
  location      = var.region
  description   = "DevSync images"
  depends_on    = [google_project_service.required]
}

data "google_client_config" "current" {}

# External Secrets operator serves the v1 CRDs k8s/base uses (v0.10.4 lacked v1).
resource "helm_release" "external_secrets" {
  name             = "external-secrets"
  repository       = "https://charts.external-secrets.io"
  chart            = "external-secrets"
  version          = "1.0.0"
  namespace        = "external-secrets-system"
  create_namespace = true

  depends_on = [module.gke]
}

module "iam" {
  source     = "./modules/iam"
  project_id = var.project_id

  # NO depends_on on module.gke: a module-level depends_on defers every data
  # read inside the module to apply time, which turned the OIDC impersonation
  # member unknown during any GKE-change plan and showed a spurious
  # destroy+create that would trip the CD no-destroy guard (verified by
  # plan). Nothing in this module references the cluster.
}

# ── The Terraform state bucket itself ─────────────────────────────────────────
# It has to exist before this backend can be configured, so it was created out of
# band during bootstrap and is adopted here. Leaving it unmanaged meant a rebuild
# would silently orphan the bucket - and the project already has a second state
# bucket (swe-...-terraform-state) belonging to another project, so which bucket
# is authoritative should not be a matter of tribal memory.
import {
  to = google_storage_bucket.tf_state
  id = "${var.project_id}-tfstate"
}

resource "google_storage_bucket" "tf_state" {
  name                        = "${var.project_id}-tfstate"
  location                    = "US-CENTRAL1"
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false

  # Object versioning is what makes a bad apply recoverable.
  versioning {
    enabled = true
  }

  # Matches the bucket's live policy (the GCS default). Stated explicitly so a
  # provider default change cannot silently propose an update.
  soft_delete_policy {
    retention_duration_seconds = 604800
  }

  lifecycle {
    # Load-bearing: without it a `terraform destroy` deletes the bucket holding
    # this configuration's own state.
    prevent_destroy = true
  }
}
