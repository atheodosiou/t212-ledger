#!/usr/bin/env bash
# Installed as /usr/local/sbin/t212-deploy-ssh: the only command the GitHub Actions SSH key can run.
set -Eeuo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

if [[ ! "${SSH_ORIGINAL_COMMAND:-}" =~ ^deploy\ ([a-f0-9]{40})$ ]]; then
  printf 'Only deploy <full-commit-sha> is allowed.\n' >&2
  exit 1
fi
sha="${BASH_REMATCH[1]}"
unit="t212-deploy-${sha:0:12}-$(date +%s)-$$"

# An SSH disconnect must not stop a deployment halfway through the switch.
# Logs go to the journal, then are printed for the workflow.
status=0
systemd-run --quiet --wait --collect --unit="$unit" \
  --property=User=root --property=Type=oneshot --property=TimeoutStartSec=30min \
  --property=TimeoutStopSec=120s --property=KillMode=mixed \
  --property=StandardOutput=journal --property=StandardError=journal \
  /usr/local/sbin/t212-deploy "$sha" || status=$?
journalctl --unit="$unit" --no-pager --output=cat || true
exit "$status"
