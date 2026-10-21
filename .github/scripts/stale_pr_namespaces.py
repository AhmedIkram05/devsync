#!/usr/bin/env python3
"""List leaked PR-preview namespaces that are safe to reclaim.

PR previews are ephemeral: k8s-pr.yml deletes pr-<n> at the end of every run,
pass or fail. A namespace therefore only survives when the run was cancelled by
the workflow's concurrency group or its always()-delete never executed - and an
abandoned PR then leaks it forever. This selects exactly those.

Staleness is measured from the devsync.io/touched-at annotation that each run
writes (falling back to creationTimestamp), never from creationTimestamp alone:
a rebuild of an old namespace reuses it, so age-of-namespace would reap a
preview that is actively being deployed into.

    kubectl get ns -o json | python3 .github/scripts/stale_pr_namespaces.py --ttl-seconds 10800

Prints one namespace per line on stdout (nothing when there is no leak) and a
summary on stderr. Exits 0 regardless - the sweep must not fail the schedule.
"""

import argparse
import json
import sys
import time
from datetime import UTC, datetime

TOUCHED_ANNOTATION = "devsync.io/touched-at"


def age_seconds(namespace, now):
    """Seconds since the preview last saw a deploy, or since it was created."""
    annotations = namespace.get("metadata", {}).get("annotations") or {}
    touched = annotations.get(TOUCHED_ANNOTATION)
    if touched is not None:
        try:
            return now - int(touched)
        except ValueError:
            print(f"warn: {namespace['metadata']['name']} has a non-integer {TOUCHED_ANNOTATION}", file=sys.stderr)
    creation = namespace.get("metadata", {}).get("creationTimestamp")
    if not creation:
        return None
    # RFC3339 ("2026-10-19T12:00:00Z") -> epoch, without pulling in dateutil.
    created = datetime.strptime(creation, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    return now - int(created.timestamp())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ttl-seconds", type=int, required=True, help="reclaim a preview idle for longer than this")
    parser.add_argument("--now", type=int, default=None, help="epoch override (tests)")
    parser.add_argument("--prefix", default="pr-", help="namespace prefix that marks a PR preview")
    args = parser.parse_args(argv)

    now = args.now if args.now is not None else int(time.time())
    namespaces = json.load(sys.stdin).get("items", [])

    stale, kept = [], 0
    for namespace in namespaces:
        name = namespace.get("metadata", {}).get("name", "")
        # Only <prefix><number> counts: the standing `devsync` namespace and any
        # unrelated namespace must never be touched by this sweep.
        if not name.startswith(args.prefix) or not name[len(args.prefix) :].isdigit():
            kept += 1
            continue
        age = age_seconds(namespace, now)
        if age is None or age < args.ttl_seconds:
            kept += 1
            continue
        stale.append((name, age))

    for name, _age in stale:
        print(name)
    print(f"scanned {len(namespaces)} namespace(s): {len(stale)} stale, {kept} kept", file=sys.stderr)
    for name, age in stale:
        print(f"  stale: {name} idle {age // 3600}h{(age % 3600) // 60}m", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
