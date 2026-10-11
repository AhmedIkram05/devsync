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
