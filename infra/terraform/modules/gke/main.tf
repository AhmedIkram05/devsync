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
  # deletion_protection ON (API-level: no cluster delete without disabling it
  # first). In-place flip — verified plan: update only, no replace.
  deletion_protection = true

  # Rebuild-window staged config (all three verified ForceNew by plan: they
  # REPLACE the cluster, so the CD no-destroy guard correctly refuses until
  # the deliberate rebuild in docs/planning/k8s.md "Cluster rebuild window").
  # Uncomment together as ONE change and run terraform apply OUTSIDE the CD:
  #
  #   # Regional control plane + pools across all zone replicas:
  #   location = var.region
  #   # Dataplane V2: supersedes the Network Policy add-on set above
  #   # (eBPF, same NetworkPolicy objects, no Calico) and
  #   # enable_fqdn_network_policy becomes available to replace the
  #   # 0.0.0.0/0 backend rule in k8s/base/networkpolicy.yaml.
  #   # Create-time-only for Standard clusters.
  #   datapath_provider = "ADVANCED_DATAPATH"
  #
  # Note: lifecycle.prevent_destroy below must be lifted (or state moved) for
  # that one apply, then restored.

  # Binary Authorization: admission evaluates the project singleton policy
  # (infra/terraform/binauthz.tf — REQUIRE_ATTESTATION, DRYRUN audit-only).
  # In-place update (verified by plan). No ordering guarantee vs the policy
  # resource within one apply is acceptable: before the policy lands,
  # admission falls back to GCP's default allow-all policy, and the audit
  # rule can never deny a pod.
  binary_authorization {
    evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
  }

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

  # NetworkPolicy enforcement is intentionally NOT managed here.
  #
  # addons_config.network_policy_config (the GKE Network Policy add-on) was
  # enabled in PR #205 to make the nine policies in k8s/base/networkpolicy.yaml
  # actually bind. It does not work here: GKE installs calico-typha and the
  # calico-node DaemonSet but never tigera-operator, so the
  # projectcalico.org/ds-ready=true node label is never applied, calico-node
  # never schedules (DESIRED 0), and felix never programs the datapath. Nothing
  # is enforced — proven by probe: external :80 reachable while the policy
  # allows only :443.
  #
  # The block was dropped in PR #206. Note what that does and does not do:
  # removing the block only stops Terraform managing the field, it does NOT
  # disable the add-on. The cluster still has it enabled and still inert, and
  # it cannot be turned off — --update-addons=NetworkPolicy=DISABLED returns
  # "Node pool devsync-pool requires recreation" — so it stays parked until the
  # rebuild, where DPv2 replaces it wholesale.
  #
  # Real enforcement needs datapath_provider = "ADVANCED_DATAPATH" in the staged
  # rebuild above, create-time-only for Standard clusters. DPv2 and
  # network_policy_config are mutually exclusive — GKE rejects the add-on with
  # "Enabling NetworkPolicy for clusters with DatapathProvider=ADVANCED_DATAPATH
  # is not allowed" — so do NOT re-add that block on a DPv2 cluster.
  #
  # Full diagnosis: docs/audit-2026-10-09.md "Infra blockers".

  # Boot pattern: one default-pool node to seed, then it is removed in favor
  # of the managed devsync-pool below.
  remove_default_node_pool = true
  initial_node_count       = 1

  resource_labels = var.labels

  # No terraform destroy of the cluster — the standing env is prod. Lift this
  # block ONLY for the deliberate rebuild window (see staged config above).
  lifecycle {
    prevent_destroy = true
  }

  timeouts {
    # Provider defaults to 40m; zonal create is ~15m but stockouts elsewhere
    # have burned long waits — leave headroom instead of dying mid-create.
    create = "60m"
  }

  # NO node_config block: the boot-seed (throwaway) default pool config used
  # to pin machine_type here. GKE mirrors the LIVE node pool's machine type
  # into clusters.get().nodeConfig, so the pinned "e2-small" turned into a
  # phantom reverse diff ("e2-medium -> e2-small") whose update API call
  # targeted the long-removed default-pool and 400'd every cluster update
  # (CD runs 38224761253/38228774703). The seed pool is provider-defaulted
  # (e2-medium) and removed immediately after boot anyway.
}

# Single zone-pinned node pool: autoscaler scales in-place, auto-upgrade keeps
# nodes on the release channel.
# (No in-module data reads: they defer to apply time under the module's
# depends_on and turn referenced strings unknown mid-plan.)

# God-console Recommender repair (High priority, 2026-09-13): the node pool
# runs on the default compute SA (standing-window trade). GKE post-1.26 needs
# container.defaultNodeServiceAccount on that SA for non-degraded node ops.
# Upgraded path (post-teardown): dedicated least-privilege node SA
# (logging.logWriter + monitoring.metricWriter + autoscaling.metricsWriter,
# no cloud-platform scope) recorded here alongside the pool recreation.
# The SA email arrives as a variable (resolved at ROOT): in-module data reads
# defer to apply time under the module's depends_on and turn member strings
# unknown, which the plan then shows as a destroy+create.
resource "google_project_iam_member" "default_node_sa" {
  project = var.project_id
  role    = "roles/container.defaultNodeServiceAccount"
  member  = "serviceAccount:${var.default_compute_sa_email}"
}

resource "google_container_node_pool" "primary" {
  name     = "devsync-pool"
  location = var.zone
  cluster  = google_container_cluster.devsync.name

  autoscaling {
    min_node_count = 2
    max_node_count = 6
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  # No terraform destroy of the node pool — the standing env is prod.
  lifecycle {
    prevent_destroy = true
  }

  # e2-medium (verified in-place: GKE updateNodePool, rolling node
  # recreation under the PDB — no replace). e2-small's 1.36Gi allocatable
  # starved backend scheduling during rollouts.
  node_config {
    machine_type = "e2-medium"
    disk_size_gb = 20
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]
    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }
}
