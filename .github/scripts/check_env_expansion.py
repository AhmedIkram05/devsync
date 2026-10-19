#!/usr/bin/env python3
"""Fail if a container env value expands $(NAME) before NAME is defined.

Kubernetes expands $(VAR) in a container's env list using ONLY the entries that
precede it in that same list. A reference to a name defined later - or not
defined at all - silently becomes the literal string "$(VAR)", so the pod boots
with a broken value instead of failing. k8s/overlays/prod/patch-db-prod.yaml
relies on exactly this: it builds DATABASE_URL from $(POSTGRES_PASSWORD), which
only works because POSTGRES_PASSWORD is listed above it.

Reads one or more rendered YAML documents on stdin.

    kustomize build k8s/overlays/prod \
      | python3 .github/scripts/check_env_expansion.py prod

Exits 1 listing every violation.
"""

import re
import sys

import yaml

REFERENCE = re.compile(r"\$\(([A-Za-z_][A-Za-z0-9_]*)\)")


def containers(doc):
    """Yield every container dict found anywhere in a rendered manifest."""
    if isinstance(doc, dict):
        for key, value in doc.items():
            if key in ("containers", "initContainers") and isinstance(value, list):
                for container in value:
                    if isinstance(container, dict):
                        yield container
            else:
                yield from containers(value)
    elif isinstance(doc, list):
        for item in doc:
            yield from containers(item)


def violations(doc, label):
    """Yield a message per env value that references a not-yet-defined name."""
    kind = doc.get("kind", "?") if isinstance(doc, dict) else "?"
    metadata = doc.get("metadata", {}) if isinstance(doc, dict) else {}
    name = metadata.get("name", "?") if isinstance(metadata, dict) else "?"
    for container in containers(doc):
        defined = set()
        for entry in container.get("env") or []:
            if not isinstance(entry, dict):
                continue
            # kubelet expands $() in values from any earlier entry, whether it
            # came from `value` or `valueFrom` - so both count as "defined".
            if isinstance(entry.get("name"), str):
                defined.add(entry["name"])
            value = entry.get("value")
            if not isinstance(value, str):
                continue
            for reference in REFERENCE.findall(value):
                if reference not in defined:
                    where = f"{label}: {kind}/{name} container={container.get('name')} env={entry.get('name')}"
                    yield f"{where}: $({reference}) is not defined earlier in the same env list"


def main(argv):
    label = argv[1] if len(argv) > 1 else "stdin"
    docs = [doc for doc in yaml.safe_load_all(sys.stdin) if doc]
    problems = [problem for doc in docs for problem in violations(doc, label)]
    if problems:
        for problem in problems:
            print(f"::error::{problem}")
        print(f"{label}: {len(problems)} env-expansion violation(s) across {len(docs)} document(s)")
        return 1
    print(f"{label}: ok - {len(docs)} document(s), every $(VAR) expands from an earlier env entry")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
