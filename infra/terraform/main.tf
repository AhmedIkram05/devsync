# DNS is a manual Namecheap A-record for gcp.devsyncapp.me (plan D10) — no dns.tf.

module "gke" {
  source      = "./modules/gke"
  project_id  = var.project_id
  region      = var.region
  zone        = var.zone
  environment = var.environment
  labels      = var.labels
  depends_on  = [google_project_service.required]
}

# Node-pool SA pulls images directly; WI only covers in-pod auth.
resource "google_project_iam_member" "nodes_ar_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${module.gke.node_sa_email}"
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

  # The workload-identity pool (PROJECT.svc.id.goog) exists only after the
  # cluster does: order IAM after GKE so clean applies don't race it.
  depends_on = [module.gke]
}
