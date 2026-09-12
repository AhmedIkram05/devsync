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
    display_name = "CrashLoop / probe failures in devsync"
    condition_matched_log {
      filter = "resource.type=\"k8s_container\" AND resource.labels.namespace_name=\"devsync\" AND (textPayload =~ \"CrashLoopBackOff\" OR textPayload =~ \"BackoffLimitExceeded\" OR textPayload =~ \"readiness probe failed\")"
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
          xPos   = 0
          yPos   = 0
          widget = {
            title = "Backend / Frontend CPU"
            xyChart = {
              dataSets = [
                {
                  plotType = "LINE"
                  timeSeriesQuery = {
                    unitOverride = "1"
                    timeSeriesFilter = {
                      filter = "metric.type=\"kubernetes.io/container/cpu/core_usage_time\" resource.type=\"k8s_container\" resource.label.\"namespace_name\"=\"devsync\" metric.label.\"container_name\"=\"backend\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_RATE"
                        crossSeriesReducer = "REDUCE_MEAN"
                      }
                    }
                  }
                },
                {
                  plotType = "LINE"
                  timeSeriesQuery = {
                    unitOverride = "1"
                    timeSeriesFilter = {
                      filter = "metric.type=\"kubernetes.io/container/cpu/core_usage_time\" resource.type=\"k8s_container\" resource.label.\"namespace_name\"=\"devsync\" metric.label.\"container_name\"=\"frontend\""
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
          yPos   = 0
          widget = {
            title = "Container restarts"
            xyChart = {
              dataSets = [
                {
                  plotType = "STACKED_BAR"
                  timeSeriesQuery = {
                    timeSeriesFilter = {
                      filter = "metric.type=\"kubernetes.io/container/restart_count\" resource.type=\"k8s_container\" resource.label.\"namespace_name\"=\"devsync\""
                      aggregation = {
                        alignmentPeriod    = "60s"
                        perSeriesAligner   = "ALIGN_DELTA"
                        crossSeriesReducer = "REDUCE_SUM"
                        groupByFields      = ["metric.label.\"container_name\""]
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
          xPos   = 0
          yPos   = 4
          widget = {
            title = "BackendDown alert"
            alertChart = {
              name = google_monitoring_alert_policy.backend_down.id
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
