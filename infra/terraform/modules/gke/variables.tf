variable "project_id" {
  type        = string
  description = "GCP project hosting the cluster."
}

variable "region" {
  type        = string
  description = "GCP region for regional resources (Artifact Registry, Secret Manager)."
}

variable "zone" {
  type        = string
  description = "Cluster zone (zonal cluster: us-central1-f is stockout-blocked)."
}

variable "environment" {
  type        = string
  description = "Environment suffix for the cluster name (e.g. prod)."
}

variable "labels" {
  type        = map(string)
  default     = {}
  description = "Resource labels applied to the cluster."
}

variable "default_compute_sa_email" {
  type        = string
  description = "Email of the project's default compute SA (resolved at root; see modules/gke/main.tf default_node_sa)."
}
