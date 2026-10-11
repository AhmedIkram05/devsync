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
