# Binary Authorization (infra-blockers 2026-10-12): attestor chain + project
# policy. The cluster's admission side (binary_authorization.evaluation_mode)
# is wired in modules/gke/main.tf — that block is an in-place update (verified
# by plan); the resources here are all new, so the whole set ships green.
#
# ENFORCEMENT POSTURE: the default admission rule requires the attestor but
# runs DRYRUN_AUDIT_LOG_ONLY — pods are evaluated and logged, never blocked.
# Flip to ENFORCED_BLOCK_AND_AUDIT_LOG ONLY after Cloud Logging shows the
# deployed devsync digests passing attestation AND a decision on the
# pr-<n> namespaces (their images carry no attestor attestation today; the
# whitelist below does not cover arbitrary pr namespaces).
variable "binauthz_public_key" {
  type        = string
  sensitive   = true
  description = "PEM public key of the cosign signing key (COSIGN_PUBLIC_KEY repo secret). Attestations signed by this key satisfy the attestor."
}

resource "google_container_analysis_note" "devsync_images" {
  name    = "devsync-images"
  project = var.project_id

  attestation_authority {
    hint {
      human_readable_name = "DevSync image attestations"
    }
  }

  # Order after API enablement — without this the note creation races
  # google_project_service and 403s "API not used in project" mid-apply
  # (CD run 38224761253).
  depends_on = [google_project_service.required]
}

resource "google_binary_authorization_attestor" "devsync_attestor" {
  name    = "devsync-attestor"
  project = var.project_id

  attestation_authority_note {
    note_reference = google_container_analysis_note.devsync_images.name

    public_keys {
      pkix_public_key {
        public_key_pem      = var.binauthz_public_key
        signature_algorithm = "ECDSA_P256_SHA256" # cosign default key type
      }
    }
  }
}

# The attestor's delegation SA reads attestations (occurrences) from the note.
resource "google_container_analysis_note_iam_member" "attestor_delegation" {
  note   = google_container_analysis_note.devsync_images.name
  role   = "roles/containeranalysis.notes.occurrences.viewer"
  member = "serviceAccount:${google_binary_authorization_attestor.devsync_attestor.attestation_authority_note[0].delegation_service_account_email}"
}

# Project singleton policy. cluster evaluation_mode = PROJECT_SINGLETON_POLICY_
# ENFORCE (modules/gke/main.tf) evaluates THIS policy at admission.
resource "google_binary_authorization_policy" "policy" {
  project = var.project_id

  # Images that legitimately carry no attestor attestation today. Wildcards
  # are allowed only after the registry/ segment.
  admission_whitelist_patterns {
    name_pattern = "docker.io/library/redis:*" # redis:7-alpine (k8s/base/redis.yaml)
  }
  admission_whitelist_patterns {
    name_pattern = "index.docker.io/library/redis:*" # alternate Docker Hub registry form
  }
  admission_whitelist_patterns {
    name_pattern = "quay.io/external-secrets/*" # ESO helm release pods (external-secrets-system)
  }

  default_admission_rule {
    evaluation_mode         = "REQUIRE_ATTESTATION"
    enforcement_mode        = "DRYRUN_AUDIT_LOG_ONLY" # audit-only upgrade path, see file header
    require_attestations_by = ["projects/${var.project_id}/attestors/${google_binary_authorization_attestor.devsync_attestor.name}"]
  }
}
