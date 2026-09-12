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
