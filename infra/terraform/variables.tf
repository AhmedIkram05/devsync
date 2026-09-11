variable "project_id" {
  type        = string
  description = "GCP project for the DevSync GKE platform."
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "GCP region for regional resources."
}

variable "zone" {
  type        = string
  default     = "us-central1-a"
  description = "Zonal location for the ephemeral Autopilot cluster."
}

variable "environment" {
  type        = string
  default     = "prod"
  description = "Environment suffix for resource names."
}

variable "alert_email" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Email for BackendDown alert notifications. Empty leaves the alert without channels."
}

variable "labels" {
  type        = map(string)
  default     = {}
  description = "Resource labels applied to platform resources."
}
