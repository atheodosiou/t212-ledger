#!/usr/bin/env bash
# Run by a human, as root on the VPS, from a reviewed checkout: sudo bash deploy/install.sh "<public key>".
# Installs the deployment commands and authorizes the GitHub Actions key for `deploy <sha>` only.
# Never called by CI. Run it again after changing anything in deploy/.
set -Eeuo pipefail
umask 077
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export GIT_TERMINAL_PROMPT=0

readonly CHECKOUT=/root/projects/t212-ledger
readonly WWW=/var/www/t212-ledger

[[ $(id -u) == 0 ]] || { printf 'Run as root on the VPS.\n' >&2; exit 1; }
[[ $# == 1 && "$1" =~ ^ssh-ed25519\ ([A-Za-z0-9+/]+={0,2})(\ .*)?$ ]] || {
  printf 'Pass one public ssh-ed25519 key as the argument.\n' >&2; exit 1;
}
key_data="${BASH_REMATCH[1]}"
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for tool in git docker curl systemd-run journalctl flock ssh-keygen; do
  command -v "$tool" >/dev/null || { printf 'Missing tool: %s\n' "$tool" >&2; exit 1; }
done
docker compose version >/dev/null

# The deployment fetches as root from a systemd job: it must work without a prompt.
git -C "$CHECKOUT" ls-remote --exit-code origin refs/heads/main >/dev/null || {
  printf 'git cannot fetch origin non-interactively in %s.\n' "$CHECKOUT" >&2; exit 1;
}
test -s "$CHECKOUT/.env.production" || { printf 'Missing %s/.env.production.\n' "$CHECKOUT" >&2; exit 1; }
chmod 600 "$CHECKOUT/.env.production"

exec 9>/run/lock/t212-deploy.lock
flock -n 9 || { printf 'A deployment is running; install again later.\n' >&2; exit 1; }

install -d -m 755 "$WWW" "$WWW/releases"

temp_key=$(mktemp)
trap 'rm -f -- "$temp_key"' EXIT
printf 'ssh-ed25519 %s\n' "$key_data" > "$temp_key"
ssh-keygen -lf "$temp_key"

install -m 755 "$script_dir/t212-deploy.sh" /usr/local/sbin/t212-deploy
install -m 755 "$script_dir/t212-deploy-ssh.sh" /usr/local/sbin/t212-deploy-ssh

install -d -m 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
key_line="restrict,command=\"/usr/local/sbin/t212-deploy-ssh\" ssh-ed25519 $key_data t212-ledger-actions"
if ! grep -Fqx "$key_line" /root/.ssh/authorized_keys; then
  if grep -Fq "$key_data" /root/.ssh/authorized_keys; then
    printf 'This key is already authorized with other options; review it manually.\n' >&2
    exit 1
  fi
  printf '\n%s\n' "$key_line" >> /root/.ssh/authorized_keys
fi
printf '\nInstalled the deployment command and the restricted public key.\n'
printf 'For VPS_KNOWN_HOSTS, prefix the following public key with the SSH host:\n'
cut -d ' ' -f 1-2 /etc/ssh/ssh_host_ed25519_key.pub
