# API enablement in code — a clean project (or post-destroy rebuild) needs
# these before any resource provisions. disable_on_destroy=false keeps the
# project usable after terraform destroy.
locals {
  required_services = [
    "container.googleapis.com",            # GKE
    "compute.googleapis.com",              # GCE LB, persistent disks
    "artifactregistry.googleapis.com",     # image registry
    "secretmanager.googleapis.com",        # ESO backend
    "monitoring.googleapis.com",           # dashboard + BackendDown alert
    "logging.googleapis.com",              # JSON logs + log-based alert
    "iam.googleapis.com",                  # WIF pool (workload identity)
    "iamcredentials.googleapis.com",       # WIF token exchange + in-pod SA auth
    "cloudresourcemanager.googleapis.com", # TF project reads + IAM grants
  ]
}

resource "google_project_service" "required" {
  for_each                   = toset(local.required_services)
  project                    = var.project_id
  service                    = each.value
  disable_dependent_services = false
  disable_on_destroy         = false
}
