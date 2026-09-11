#!/usr/bin/env bash
# pip-audit gate with explicit, justified vulnerability allow-list.
#
# Rules for this file:
#   - Every --ignore-vuln entry needs a one-line justification next to it.
#   - Update "Last reviewed" below whenever any entry changes or is audited.
#   - The weekly report-only audit (security-weekly.yml) runs pip-audit WITHOUT
#     these ignores and posts to the step summary — when an allow-listed CVE
#     stops appearing there because it is fixed upstream, DELETE the entry here.
#
# Last reviewed: 2026-09-12

set -euo pipefail

args=()

# PYSEC-2026-1325 — ecdsa 0.19.2 (transitive via python-jose): no fixed
# release upstream yet; tracked. Remove as soon as an ecdsa release with the
# fix lands and Dependabot bumps it.
args+=(--ignore-vuln "PYSEC-2026-1325")

# CVE-2026-27205 — carried over from the old inline ignore list in ci.yml
# (2026-09-12); original justification NOT documented. Verify before retiring.
args+=(--ignore-vuln "CVE-2026-27205")

# CVE-2024-6866 — carried over from ci.yml (2026-09-12); justification NOT
# documented. Verify before retiring.
args+=(--ignore-vuln "CVE-2024-6866")

# CVE-2024-6844 — carried over from ci.yml (2026-09-12); justification NOT
# documented. Verify before retiring.
args+=(--ignore-vuln "CVE-2024-6844")

# CVE-2024-6839 — carried over from ci.yml (2026-09-12); justification NOT
# documented. Verify before retiring.
args+=(--ignore-vuln "CVE-2024-6839")

# CVE-2026-30922 — carried over from ci.yml (2026-09-12); justification NOT
# documented. Verify before retiring.
args+=(--ignore-vuln "CVE-2026-30922")

exec pip-audit -r requirements.txt "${args[@]}"
