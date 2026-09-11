output "cluster_name" {
  value       = module.gke.cluster_name
  description = "Name of the GKE cluster."
}

output "endpoint" {
  value       = module.gke.endpoint
  description = "API endpoint of the cluster."
}

output "runner_email" {
  value       = module.iam.runner_email
  description = "Email of the devsync-runner service account."
}

output "wif_provider" {
  value       = module.iam.wif_provider
  description = "GCP_WORKLOAD_IDENTITY_PROVIDER secret value for GitHub Actions."
}
