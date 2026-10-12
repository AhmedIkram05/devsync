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

  depends_on = [google_project_service.required]
}

resource "google_sql_database" "devsync" {
  name     = "devsync"
  project  = var.project_id
  instance = google_sql_database_instance.devsync.name
}
