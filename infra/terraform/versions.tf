terraform {
  required_version = ">= 1.5.0"

  # GCS remote state. Bucket is NOT hardcoded: supply via init flag backed
  # by the TF_STATE_BUCKET env/secret, e.g.
  #   terraform init -backend-config="bucket=$TF_STATE_BUCKET"
  # Local validate without a bucket still works:
  #   terraform init -backend=false && terraform validate
  backend "gcs" {}

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

# Talks straight to the cluster from module outputs (never the kubeconfig
# file: that is stale mid-apply while the cluster is being replaced).
provider "helm" {
  kubernetes {
    host                   = "https://${module.gke.endpoint}"
    token                  = data.google_client_config.current.access_token
    cluster_ca_certificate = module.gke.cluster_ca
  }
}
