# Secret containers mirroring k8s/base/externalsecret.yaml keys.
# Values stay out-of-band (never in git/TF): after apply, set each value once via
#   gcloud secrets versions add SECRET_ID --data-file=- --project=PROJECT_ID
# See RUNBOOK.md. IAM secretAccessor bindings in backend_runner.tf stay per-secret.
resource "google_secret_manager_secret" "demo" {
  for_each  = toset(var.secret_ids)
  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }
}
