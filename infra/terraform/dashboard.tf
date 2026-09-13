# Email channel for BackendDown. Empty alert_email disables notifications.
resource "google_monitoring_notification_channel" "alert_email" {
  count        = var.alert_email != "" ? 1 : 0
  display_name = "devsync-${var.environment} alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

# BackendDown log alert (plan P3): infra signal, decoupled from the k6 app gate.
resource "google_monitoring_alert_policy" "backend_down" {
  display_name = "devsync-${var.environment} BackendDown"
  combiner     = "OR"

  notification_channels = var.alert_email != "" ? [google_monitoring_notification_channel.alert_email[0].id] : []

  conditions {
    # NOTE (canary 2026-09-12, proven live): kubelet crash/probe signals
    # arrive as K8s EVENTS (resource.type="k8s_pod", jsonPayload), never as
    # container stdout. The old textPayload+k8s_container filter matched
    # nothing in practice — the crashloop below produced zero hits.
    display_name = "CrashLoop / probe failures in devsync"
    condition_matched_log {
      filter = "resource.type=\"k8s_pod\" AND resource.labels.namespace_name=\"devsync\" AND (jsonPayload.reason=\"BackOff\" OR (jsonPayload.reason=\"Unhealthy\" AND jsonPayload.message=~\"eadiness probe failed\"))"
    }
  }

  alert_strategy {
    auto_close = "604800s"
    # Required: log-based alert policies must specify a notification rate limit.
    notification_rate_limit {
      period = "300s"
    }
  }
}

# TF-managed GMP dashboard: destroyed with the platform, screenshot is a receipt.
resource "google_monitoring_dashboard" "devsync" {
  dashboard_json = jsonencode({
    displayName = "DevSync ${var.environment} - GKE"
    mosaicLayout = {
      columns = 12
      tiles = [
        {
          width  = 6
          height = 4
          widget = {
            title = "Backend / Frontend CPU"
            xyChart = {
              dataSets = [
                {
                  plotType   = "LINE"
                  targetAxis = "Y1"
                  timeSeriesQuery = {
                    unitOverride = "1"
                    timeSeriesFilter = {
                      filter = "metric.type=\"kubernetes.io/container/cpu/core_usage_time\" resource.type=\"k8s_container\" resource.label.\"namespace_name\"=\"devsync\" resource.label.\"container_name\"=\"backend\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_MEAN"
                      }
                    }
                  }
                },
                {
                  plotType   = "LINE"
                  targetAxis = "Y1"
                  timeSeriesQuery = {
                    unitOverride = "1"
                    timeSeriesFilter = {
                      filter = "metric.type=\"kubernetes.io/container/cpu/core_usage_time\" resource.type=\"k8s_container\" resource.label.\"namespace_name\"=\"devsync\" resource.label.\"container_name\"=\"frontend\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_MEAN"
                      }
                    }
                  }
                }
              ]
              yAxis = {
                label = "cores"
                scale = "LINEAR"
              }
            }
          }
        },
        {
          width  = 6
          height = 4
          xPos   = 6
          widget = {
            title = "Container restarts"
            xyChart = {
              dataSets = [
                {
                  plotType   = "STACKED_BAR"
                  targetAxis = "Y1"
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"kubernetes.io/container/restart_count\" resource.type=\"k8s_container\" resource.label.\"namespace_name\"=\"devsync\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_DELTA"
                        crossSeriesReducer = "REDUCE_SUM"
                        groupByFields      = ["resource.label.\"container_name\""]
                      }
                    }
                  }
                }
              ]
              yAxis = {
                label = "restarts"
                scale = "LINEAR"
              }
            }
          }
        },
        {
          width  = 6
          height = 4
          yPos   = 4
          widget = {
            # NOTE: alertChart cannot render log-based alert policies
            # ("Alert charts do not support log-based alert policies"), so this
            # tile shows the same signal as logs — the BackendDown alert itself
            # lives in Alerting and fired by email during the canary.
            title = "BackendDown signal (log evidence)"
            logsPanel = {
              filter        = "resource.type=\"k8s_pod\" resource.labels.namespace_name=\"devsync\" (jsonPayload.reason=\"BackOff\" OR (jsonPayload.reason=\"Unhealthy\" AND jsonPayload.message=~\"eadiness probe failed\"))"
              resourceNames = ["projects/${var.project_id}"]
            }
          }
        },
        {
          width  = 6
          height = 4
          xPos   = 6
          yPos   = 4
          widget = {
            title = "Error logs"
            logsPanel = {
              filter        = "resource.type=\"k8s_container\" resource.labels.namespace_name=\"devsync\" severity>=ERROR"
              resourceNames = ["projects/${var.project_id}"]
            }
          }
        }
      ]
    }
  })
}

# RedisDegraded (Phase 2 audit): D4/D5 degrade fail-open BY DESIGN — without
# this alert the only signal failure ever emitted was a backend log line that
# nobody watched.
# Shape reused from BackendDown (proven live in Phase 1): a condition_matched_log
# policy needs no metric plumbing at all. The threshold-on-log-metric variant
# misfires through resource-descriptor validation (metric reports under
# k8s_container, but no series exist before the first degradation event, and
# global/undecorated combos both 400), so the raw log filter is the whole deal.
resource "google_monitoring_alert_policy" "redis_degraded" {
  display_name = "devsync-${var.environment} RedisDegraded"
  combiner     = "OR"

  notification_channels = var.alert_email != "" ? [google_monitoring_notification_channel.alert_email[0].id] : []

  conditions {
    display_name = "backend reports degraded Redis features (MQ/limiter/presence)"
    condition_matched_log {
      filter = <<-EOF
        resource.type="k8s_container"
        AND resource.labels.namespace_name="devsync"
        AND resource.labels.container_name="backend"
        AND ((textPayload=~"Redis unreachable" OR textPayload=~"Presence refresh failed" OR textPayload=~"Socket emit .* failed")
          OR (jsonPayload.message=~"Redis unreachable" OR jsonPayload.message=~"Presence refresh failed" OR jsonPayload.message=~"Socket emit .* failed"))
        EOF
    }
  }

  alert_strategy {
    auto_close = "3600s"
    notification_rate_limit {
      period = "1800s"
    }
  }
}

# CloudSQL storage (Phase 2 audit): the DB of record had zero metrics-based
# alerting. 9 GB over a 10 GB provisioned SSD (auto-resize would cap it) —
# catches the fix-now point long before disk pressure becomes an outage.
resource "google_monitoring_alert_policy" "cloudsql_storage_high" {
  display_name = "devsync-${var.environment} CloudSQL storage > 9 GB"
  combiner     = "OR"

  notification_channels = var.alert_email != "" ? [google_monitoring_notification_channel.alert_email[0].id] : []

  conditions {
    display_name = "storage used above 9 GB"
    condition_threshold {
      filter          = "metric.type=\"cloudsql.googleapis.com/database/disk/bytes_used\" AND resource.type=\"cloudsql_database\" AND resource.label.database_id=\"${var.project_id}:devsync-db\""
      comparison      = "COMPARISON_GT"
      threshold_value = 9000000000
      duration        = "300s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MAX"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }
}
