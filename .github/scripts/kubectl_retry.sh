#!/usr/bin/env bash
# Shared kubectl retry helper for the CD workflows.
#
# GKE control-plane throttling (ENHANCE_YOUR_CALM / 429) is transient, so retry
# kubectl API calls with exponential backoff instead of failing the deploy
# (exact failure of run 38083180131).
#
# Source this file, then call `kubectl_retry kubectl <args...>`.
kubectl_retry() {
  local attempts=6 delay=5 out rc
  for ((i = 1; i <= attempts; i++)); do
    out="$("$@" 2>&1)" && { printf '%s\n' "$out"; return 0; }
    rc=$?
    case "$out" in
      *ENHANCE_YOUR_CALM*|*TooManyRequests*|*ResourceExhausted*)
        if [ "$i" -eq "$attempts" ]; then printf '%s\n' "$out" >&2; return "$rc"; fi
        echo "kubectl throttled (attempt $i/$attempts), retrying in ${delay}s..." >&2
        sleep "$delay"
        delay=$((delay * 2))
        ;;
      *)
        printf '%s\n' "$out" >&2
        return "$rc"
        ;;
    esac
  done
}
