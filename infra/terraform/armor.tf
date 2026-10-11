# Cloud Armor for the DevSync GCE LB (infra-blockers 2026-10-12). Attached to
# the ingress backend service via k8s/base/backendconfig.yaml; GLBC needs
# roles/compute.securityAdmin on the node SA (granted in main.tf).
#
# Posture: allow by default + one rate-based ban rule per client IP. Sized
# ABOVE the CD k6 verify (3 VUs x 30s from one runner IP ≈ 270 req/min) and
# Cypress traffic so deploys never ban themselves; a real user never
# approaches 1000 req/min, a flood does. Deliberately no preconfigured WAF
# (SQLi/XSS) rules: they inspect request bodies and a false positive on
# /api/v1/auth/* would lock real users out of login.
resource "google_compute_security_policy" "devsync" {
  name        = "devsync-armor-policy"
  project     = var.project_id
  description = "DevSync GCE LB protection: per-IP rate-based ban"

  rule {
    action      = "rate_based_ban"
    priority    = "1000"
    description = ">1000 req/60s per client IP -> 10 min ban"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 1000
        interval_sec = 60
      }
      ban_duration_sec = 600
    }
  }

  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}
