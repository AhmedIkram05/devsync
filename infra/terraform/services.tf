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
    "sqladmin.googleapis.com",             # Cloud SQL (cloudsql.tf)
    "containeranalysis.googleapis.com",    # Binary Authz note + attestations
    "binaryauthorization.googleapis.com",  # Binary Authz attestor + policy (cluster evaluation_mode needs it at admission)
    # Cloud SQL private IP rides a VPC peering in a Google tenant project, which
    # is created through this API (see cloudsql.tf). Without it the instance's
    # private_network has no route from the cluster.
    "servicenetworking.googleapis.com",
    # Default-on for every project, listed so a from-scratch rebuild does not
    # depend on that default holding: it is what enables all of the above.
    "serviceusage.googleapis.com",
  ]
}

resource "google_project_service" "required" {
  for_each                   = toset(local.required_services)
  project                    = var.project_id
  service                    = each.value
  disable_dependent_services = false
  disable_on_destroy         = false
}
