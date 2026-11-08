#!/usr/bin/env bash
# Installed by a human as /usr/local/sbin/t212-deploy (deploy/install.sh); never self-updated.
# Deploys one commit of `main`, API and web together:
#   build images → back up the database → migrate → switch the API container → switch the web release.
# If the new API or site does not answer correctly, both go back to what was live (migrations are
# additive, so the previous API runs on the migrated database; see README, "Rollback").
set -Eeuo pipefail
umask 077
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME=/root
export GIT_TERMINAL_PROMPT=0
unset IMAGE_TAG

readonly CHECKOUT=/root/projects/t212-ledger
readonly ENV_FILE="$CHECKOUT/.env.production"
readonly WWW=/var/www/t212-ledger
readonly RELEASES="$WWW/releases"
readonly LOCK_FILE=/run/lock/t212-deploy.lock
readonly SITE=https://ledger.theodosiou.me
readonly CONTAINER=t212-ledger-prod-api-1
readonly KEEP_RELEASES=5

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }
[[ $# == 1 && "$1" =~ ^[a-f0-9]{40}$ ]] || fail 'Expected one full commit SHA.'
readonly SHA="$1"
[[ $(id -u) == 0 ]] || fail 'Use the installed deployment command as root.'
for tool in git docker curl flock grep sed readlink; do
  command -v "$tool" >/dev/null || fail "Missing tool: $tool"
done

exec 9>"$LOCK_FILE"
flock -n 9 || fail 'Another deployment is running.'
cd "$CHECKOUT"
[[ $(git remote get-url origin) =~ github\.com[:/]atheodosiou/t212-ledger(\.git)?$ ]] ||
  fail 'Unexpected repository origin.'
test -s "$ENV_FILE" || fail "Missing $ENV_FILE."
[[ $(grep -c '^IMAGE_TAG=' "$ENV_FILE") == 1 ]] || fail '.env.production must have exactly one IMAGE_TAG line.'
[[ -z $(git status --porcelain) ]] || fail 'The checkout has local changes; investigate on the server.'

compose() { docker compose -f compose.prod.yml --env-file "$ENV_FILE" "$@"; }

# Only the commit that is the tip of main right now: a stale or replayed run is refused.
check_head() {
  git fetch --no-tags --quiet origin refs/heads/main:refs/remotes/origin/main
  [[ $(git rev-parse refs/remotes/origin/main) == "$SHA" ]] ||
    fail 'main has moved on. Run the workflow again for its latest commit.'
}

image_tag() { grep '^IMAGE_TAG=' "$ENV_FILE" | cut -d= -f2; }
set_tag() {
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" "$ENV_FILE"
  [[ $(image_tag) == "$1" ]]
}
host_port() { grep '^HOST_PORT=' "$ENV_FILE" | cut -d= -f2 || true; }

# The container runs the expected image, Docker reports it healthy, and the API answers with the
# database and the job queue up.
api_healthy() {
  local tag="$1" port
  port=$(host_port)
  for _ in {1..40}; do
    if [[ $(docker inspect --format '{{.Config.Image}} {{.State.Health.Status}}' "$CONTAINER" 2>/dev/null) == "t212-api:$tag healthy" ]] &&
       curl -fsS --max-time 5 "http://127.0.0.1:${port:-3300}/api/health" | grep -Fq '"status":"ok"'; then
      return 0
    fi
    sleep 3
  done
  return 1
}

# The public site serves this release's index.html, every script it names exists in the release, the SPA
# fallback works, and the API answers through Nginx.
site_ok() {
  local release="$1" html scripts script
  html=$(curl -fsS --max-time 10 "$SITE/") || return 1
  curl -fsS --max-time 10 -o /dev/null "$SITE/login" || return 1
  scripts=$(grep -o 'src="[^"]*\.js"' <<< "$html" | sed 's/^src="//; s/"$//') || return 1
  while IFS= read -r script; do
    [[ -s "$release/$script" ]] || { printf 'Not in %s: %s\n' "$release" "$script" >&2; return 1; }
  done <<< "$scripts"
  curl -fsS --max-time 10 "$SITE/api/health" | grep -Fq '"status":"ok"'
}

switch_web() {
  rm -f "$WWW/.current-next"
  ln -s "$1" "$WWW/.current-next"
  mv -Tf "$WWW/.current-next" "$WWW/current"
  [[ $(readlink -f "$WWW/current") == "$1" ]]
}

check_head
PREV_TAG=$(image_tag)
PREV_WEB=$(readlink -f "$WWW/current" || true)
git switch --quiet main
git merge --quiet --ff-only "$SHA"
TAG=$(git rev-parse --short=12 HEAD)
RELEASE="$RELEASES/$TAG"
printf 'Commit: %s\nLive: t212-api:%s, %s\nNew:  t212-api:%s, %s\n' "$SHA" "$PREV_TAG" "${PREV_WEB:-none}" "$TAG" "$RELEASE"
if [[ "$TAG" == "$PREV_TAG" && "$PREV_WEB" == "$RELEASE" ]] && api_healthy "$TAG" && site_ok "$RELEASE"; then
  printf '\nALREADY LIVE\nCOMMIT=%s\n' "$SHA"
  exit 0
fi

# From here on, any exit that is not DEPLOY PASSED puts back what was live.
api_switched=0
web_switched=0
release_written=0
finished=0
on_exit() {
  local status=$?
  [[ "$finished" == 1 ]] && return
  trap - EXIT
  set +e
  if [[ "$web_switched" == 1 && -n "$PREV_WEB" ]]; then
    printf '\nRestoring web release %s\n' "$PREV_WEB" >&2
    switch_web "$PREV_WEB" || printf 'WEB ROLLBACK NEEDS ATTENTION (README, "Rollback").\n' >&2
  fi
  [[ "$release_written" == 1 ]] && rm -rf -- "$RELEASE"
  if [[ "$api_switched" == 1 ]]; then
    printf '\nDeployment failed; restoring t212-api:%s\n' "$PREV_TAG" >&2
    compose logs --tail=60 api >&2
    if [[ "$PREV_TAG" != bootstrap ]] && set_tag "$PREV_TAG" && compose up -d --no-build api && api_healthy "$PREV_TAG"; then
      printf 'ROLLBACK PASSED\n' >&2
    else
      printf 'API ROLLBACK NEEDS ATTENTION (README, "Rollback").\n' >&2
    fi
  else
    set_tag "$PREV_TAG"
    printf 'Failed before the switch; nothing live was changed (IMAGE_TAG=%s).\n' "$PREV_TAG" >&2
  fi
  exit $(( status == 0 ? 1 : status ))
}
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

set_tag "$TAG"
step 'Validate Compose'
compose config --quiet

step 'Build the API image and the web app'
compose build --quiet api
docker build --quiet --target web -t "t212-web:$TAG" . >/dev/null

step 'Unpack the web release'
release_written=1
mkdir -p "$RELEASES" "$RELEASE"
cid=$(docker create "t212-web:$TAG" true)
docker cp "$cid:/site/." "$RELEASE/" || { docker rm -f "$cid" >/dev/null; false; }
docker rm -f "$cid" >/dev/null
test -s "$RELEASE/index.html"
chmod -R a+rX "$RELEASE"
! grep -rqF 'fonts.googleapis.com' "$RELEASE" || fail 'The web build loads Google Fonts.'

step 'Database: start, back up, migrate'
compose up -d db db-backup
for _ in {1..30}; do
  [[ $(docker inspect --format '{{.State.Health.Status}}' t212-ledger-prod-db-1 2>/dev/null) == healthy ]] && break
  sleep 2
done
mkdir -p backups
backup="backups/t212_ledger-predeploy-$TAG-$(date -u +%Y%m%dT%H%M%SZ).dump"
compose exec -T db pg_dump -U t212 -d t212_ledger --format=custom > "$backup.tmp"
mv "$backup.tmp" "$backup"
printf 'Backup: %s\n' "$backup"
compose --profile tools run --rm migrate

# Refuse to switch if main moved while building.
check_head

step 'Switch the API'
api_switched=1
compose up -d --no-build api
api_healthy "$TAG"

step 'Switch the web release (atomic) and verify'
web_switched=1
switch_web "$RELEASE"
site_ok "$RELEASE"
finished=1

step 'Clean up old releases and images'
# Keep the newest releases (the live one included) and their images; older ones go.
# Names here are commit hashes and timestamps we wrote ourselves, so `ls` is safe.
# shellcheck disable=SC2012
mapfile -t old < <(ls -1t "$RELEASES" | tail -n +$((KEEP_RELEASES + 1)))
for tag in "${old[@]}"; do
  [[ "$RELEASES/$tag" == "$RELEASE" ]] && continue
  rm -rf -- "${RELEASES:?}/$tag"
  docker image rm "t212-api:$tag" "t212-web:$tag" >/dev/null 2>&1 || true
done
# shellcheck disable=SC2012
ls -1t backups/t212_ledger-predeploy-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f

printf '\nDEPLOY PASSED\nCOMMIT=%s\nAPI=t212-api:%s (previous %s)\nWEB=%s (previous %s)\n' \
  "$SHA" "$TAG" "$PREV_TAG" "$RELEASE" "${PREV_WEB:-none}"
