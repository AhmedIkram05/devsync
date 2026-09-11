# GitHub Actions OIDC (WIF): workflows authenticate as the devsync-runner
# service account via `GCP_WORKLOAD_IDENTITY_PROVIDER` /
# `GCP_SERVICE_ACCOUNT` repository secrets. This file is the code-owner —

data "google_project" "current" {
  project_id = var.project_id
}

locals {
  gh_owner   = "AhmedIkram05"
  gh_repo    = "devsync"
  gh_pool_id = "github"
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = local.gh_pool_id
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions OIDC"
  attribute_condition                = "attribute.repository_owner == \"AhmedIkram05\" && attribute.repository == \"AhmedIkram05/devsync\""
  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
  }
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Workflows acting as the runner GSA. Scoped to this repo only.
resource "google_service_account_iam_member" "github_actions_impersonation" {
  service_account_id = google_service_account.runner.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/attribute.repository/${local.gh_owner}/${local.gh_repo}"
}

# What a full CI/CD run does as the runner: tf-apply (cluster/pool/repo/secrets/
# dashboard/APIs), docker push to AR, kubectl deploy. Runtime roles live in
# backend_runner.tf (log/metric writers, secret accessor).
resource "google_project_iam_member" "cicd" {
  for_each = toset([
    "roles/container.admin",                 # tf-apply cluster mgmt + kubectl RBAC mapping in deploy jobs
    "roles/artifactregistry.admin",          # TF owns repo resource; build-push writes images
    "roles/secretmanager.admin",             # TF owns secret containers
    "roles/monitoring.editor",               # dashboard.tf alert/channel/dashboard
    "roles/serviceusage.serviceUsageAdmin",  # services.tf API enablement
    "roles/resourcemanager.projectIamAdmin", # nodes_ar_reader project-level binding
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.runner.email}"
}

output "wif_provider" {
  value       = "projects/${data.google_project.current.number}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github_actions.workload_identity_pool_provider_id}"
  description = "GCP_WORKLOAD_IDENTITY_PROVIDER secret value for GitHub Actions."
}
