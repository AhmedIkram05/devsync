resource "google_container_cluster" "devsync" {
  name = "devsync-${var.environment}"
  # ZONAL (var.zone), not regional: both regional create attempts hit a hard
  # GCE_STOCKOUT in us-central1-f (regional pools always spread to -f, and the
  # throwaway default-pool can't be deleted while the cluster is in its repair
  # loop). us-central1-a has proven capacity (nodes RUNNING). Tradeoff:
  # control plane in a single zone — acceptable for the <=T+14 standing env.
  location = var.zone
  # Standard, not Autopilot: real drain/upgrade path, PDB semantics, node ops.
  # enable_autopilot is deliberately UNSET (omitted) — setting it false still
  # conflicts with remove_default_node_pool below.
  deletion_protection = false

  release_channel {
    channel = "REGULAR"
  }

  maintenance_policy {
    daily_maintenance_window {
      start_time = "02:00"
    }
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Boot pattern: one default-pool node to seed, then it is removed in favor
  # of the managed devsync-pool below.
  remove_default_node_pool = true
  initial_node_count       = 1

  resource_labels = var.labels

  timeouts {
    # Provider defaults to 40m; zonal create is ~15m but stockouts elsewhere
    # have burned long waits — leave headroom instead of dying mid-create.
    create = "60m"
  }

  # Config for the initial (immediately-removed) throwaway node pool. e2-medium
  # hit a GCE stockout in us-central1-f; small slices have more headroom.
  node_config {
    machine_type = "e2-small"
  }
}

# Single zone-pinned node pool: autoscaler scales in-place, auto-upgrade keeps
# nodes on the release channel.
resource "google_container_node_pool" "primary" {
  name     = "devsync-pool"
  location = var.zone
  cluster  = google_container_cluster.devsync.name

  autoscaling {
    min_node_count = 2
    max_node_count = 4
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  node_config {
    machine_type = "e2-small"
    disk_size_gb = 20
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }
}
