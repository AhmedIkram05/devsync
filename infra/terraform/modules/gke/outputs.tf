output "cluster_name" {
  value       = google_container_cluster.devsync.name
  description = "Name of the GKE cluster."
}

output "endpoint" {
  value       = google_container_cluster.devsync.endpoint
  description = "API endpoint of the cluster (needed for provider wiring)."
}

output "cluster_ca" {
  value       = base64decode(google_container_cluster.devsync.master_auth[0].cluster_ca_certificate)
  sensitive   = true
  description = "PEM CA cert of the cluster (decoded for helm/k8s providers)."
}

# node_config.service_account is the literal "default" when the pool uses the
# project's compute default service account — resolve it to the canonical
# NUMBER-compute@PROJECT_ID.iam.gserviceaccount.com email for IAM grants.
data "google_project" "current" {
  project_id = var.project_id
}

locals {
  node_sa = google_container_node_pool.primary.node_config[0].service_account

  # Default compute SA lives at NUMBER-compute@developer.gserviceaccount.com
  # (NOT @PROJECT_ID.iam.gserviceaccount.com).
  node_sa_email = (local.node_sa == "default"
    ? "${data.google_project.current.number}-compute@developer.gserviceaccount.com"
    : local.node_sa
  )
}

output "node_sa_email" {
  value       = local.node_sa_email
  description = "Node-pool service account (image pulls authenticate as this)."
}
