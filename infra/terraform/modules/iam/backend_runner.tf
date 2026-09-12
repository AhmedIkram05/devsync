# Backend runner identity: KSA devsync-ksa (k8s/base/serviceaccount.yaml,
# namespace devsync) impersonates GSA devsync-runner via Workload Identity.
# Matches the annotation iam.gke.io/gcp-service-account on the KSA.

variable "project_id" {
  type        = string
  description = "GCP project hosting the runner service account."
}

variable "k8s_namespace" {
  type        = string
  default     = "devsync"
  description = "Namespace of the Kubernetes service account."
}

variable "ksa_name" {
  type        = string
  default     = "devsync-ksa"
  description = "Name of the Kubernetes service account bound to the GSA."
}

variable "secret_ids" {
  type        = list(string)
  default     = ["DATABASE_URL", "JWT_SECRET_KEY", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "FERNET_KEY", "POSTGRES_PASSWORD"]
  description = "Demo Secret Manager secret IDs the runner may read (mirrors k8s/base/externalsecret.yaml keys)."
}

resource "google_service_account" "runner" {
  account_id   = "devsync-runner"
  display_name = "DevSync backend runner (Workload Identity for devsync-ksa)"
}

resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.runner.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.k8s_namespace}/${var.ksa_name}]"
}

resource "google_project_iam_member" "log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.runner.email}"
}

resource "google_project_iam_member" "metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.runner.email}"
}

resource "google_project_iam_member" "ar_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.runner.email}"
}

# Least privilege: secretAccessor only on the demo secrets, not project-wide.
resource "google_secret_manager_secret_iam_member" "demo_secrets" {
  for_each  = toset(var.secret_ids)
  project   = var.project_id
  secret_id = google_secret_manager_secret.demo[each.value].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runner.email}"
}

output "runner_email" {
  value       = google_service_account.runner.email
  description = "Email of the devsync-runner service account."
}
