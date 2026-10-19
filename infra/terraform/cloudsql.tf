# Cloud SQL — TF-owned (infra-blockers 2026-10-12). The instance was created
# by infra/scripts/provision-cloudsql.sh (script header records the history)
# and is imported into state; TF now owns its lifecycle:
#   terraform import google_sql_database_instance.devsync \
#     projects/<project>/instances/devsync-db
#   terraform import google_sql_database.devsync \
#     projects/<project>/instances/devsync-db/databases/devsync
# The `devsync` login user + its password stay OUT of TF on purpose: the
# password lives only in Secret Manager (DATABASE_URL consumed by ESO) and
# TF cannot see it — a TF-managed user with no password would reset it.
# Deletion protection is ON at both layers (TF resource guard + API setting).
resource "google_sql_database_instance" "devsync" {
  name                = "devsync-db"
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true

  settings {
    tier              = "db-g1-small" # f1-micro -> g1-small (audit blocker: in-place)
    availability_type = "ZONAL"
    activation_policy = "ALWAYS"

    disk_type       = "PD_SSD"
    disk_size       = 10
    disk_autoresize = true

    maintenance_window {
      day  = 7 # Sunday
      hour = 6
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true # audit blocker: PITR on
      backup_retention_settings {
        retained_backups = 7
      }
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = "projects/${var.project_id}/global/networks/default"
    }
  }

  # The private IP is only routable from the cluster once the private services
  # access peering below exists.
  depends_on = [google_project_service.required, google_service_networking_connection.cloudsql]
}

resource "google_sql_database" "devsync" {
  name     = "devsync"
  project  = var.project_id
  instance = google_sql_database_instance.devsync.name
}

# ── Private services access (the peering behind the private IP) ────────────────
# Both objects were created out of band by infra/scripts/provision-cloudsql.sh
# and are ADOPTED here instead of being left to drift alongside this config: the
# instance's ip_configuration.private_network is only reachable from the cluster
# while this peering exists, so it is infrastructure, not a side effect.
#
# Values match the live objects exactly (prefix_length is /24, not the provider
# default of /16) - a mismatch would make Terraform propose a replacement, which
# is why they were read from the API rather than assumed.
import {
  to = google_compute_global_address.cloudsql_peering_range
  id = "google-managed-services-default"
}

resource "google_compute_global_address" "cloudsql_peering_range" {
  name          = "google-managed-services-default"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  address       = "10.50.40.0"
  prefix_length = 24
  # The live description and the full self-link form of the network are both
  # required to match: `description` is ForceNew on this resource, so omitting it
  # plans a destroy+create of the range the Cloud SQL private IP lives in (caught
  # by a scoped plan, not by inspection).
  description = "Cloud SQL private services access"
  network     = "https://www.googleapis.com/compute/v1/projects/${var.project_id}/global/networks/default"

  lifecycle {
    # Recreating the range would orphan every address carved out of it,
    # including the Cloud SQL instance's private IP.
    prevent_destroy = true
  }
}

# Peering name is Google-generated from the service
# ("servicenetworking-googleapis-com"), so the import id is network:service.
import {
  to = google_service_networking_connection.cloudsql
  id = "default:servicenetworking.googleapis.com"
}

resource "google_service_networking_connection" "cloudsql" {
  # Bare network name, not the URL form the address resource stores: the
  # connection's state keeps "default" and `network` is ForceNew, so any other
  # spelling plans a destroy+create of the peering itself.
  network                 = "default"
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.cloudsql_peering_range.name]

  depends_on = [google_project_service.required]

  lifecycle {
    # Deleting the peering disconnects Cloud SQL private IP from the cluster.
    prevent_destroy = true
  }
}
