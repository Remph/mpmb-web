#!/usr/bin/env bash
# Upload the built app (dist/) into its folder on the owner's web space, over FTP with TLS (lftp).
# Run by .github/workflows/deploy.yml; by hand it works the same:
#   DEPLOY_HOST=... DEPLOY_USER=... DEPLOY_PASSWORD=... DEPLOY_DIR=/ DRY_RUN=1 scripts/deploy.sh dist
#
#   DEPLOY_HOST      the server name in the host's TLS certificate (not an IP address)
#   DEPLOY_USER      best an FTP user whose base folder IS the app's folder, so it can't reach the rest
#   DEPLOY_PASSWORD  of the site
#   DEPLOY_DIR       the app's folder as that user sees it ("/" for such a user)
#   DRY_RUN=1        only list what would be uploaded or deleted
#
# The folder ends up equal to the build: new and changed files are uploaded, files that are no
# longer in the build are deleted (old hashed scripts). Characters are not on the server; they live
# in each player's browser, so a deploy never touches them.
set -euo pipefail

local_dir="${1:?usage: deploy.sh <built folder>}"
: "${DEPLOY_HOST:?DEPLOY_HOST is not set (missing GitHub secret?)}"
: "${DEPLOY_USER:?DEPLOY_USER is not set (missing GitHub secret?)}"
: "${DEPLOY_PASSWORD:?DEPLOY_PASSWORD is not set (missing GitHub secret?)}"
: "${DEPLOY_DIR:?DEPLOY_DIR is not set (missing GitHub secret?)}"

# A broken build must never turn into "empty the folder"; without the headers file the app loads
# but no pop-up can wait for an answer.
for needed in index.html .htaccess assets; do
  if [ ! -e "$local_dir/$needed" ]; then
    echo "error: $local_dir/$needed not found, refusing to deploy" >&2
    exit 1
  fi
done

# lftp reads its commands from stdin, so the password never shows up in a process list.
# Inside double quotes lftp only needs \ and " escaped.
quote() { local s="${1//\\/\\\\}"; printf '"%s"' "${s//\"/\\\"}"; }
connect() {
  echo "set cmd:fail-exit yes"
  echo "set net:max-retries 3"
  echo "set net:timeout 30"
  # Encrypted or nothing, and the certificate has to match the host name.
  echo "set ftp:ssl-force yes"
  echo "set ftp:ssl-protect-data yes"
  echo "set ssl:verify-certificate yes"
  echo "open \"ftp://$DEPLOY_HOST:${DEPLOY_PORT:-21}\""
  # `user` instead of `open -u`: with -u lftp prints the password in every URL it logs.
  echo "user $(quote "$DEPLOY_USER") $(quote "$DEPLOY_PASSWORD")"
  # Fails (cmd:fail-exit) when the folder is wrong, instead of creating it.
  echo "cd $(quote "$DEPLOY_DIR")"
}

# Safety net against a wrong DEPLOY_DIR: the app's folder holds index.html, .htaccess and assets/
# and nothing else of note. A folder with any other subfolder (say the main site's root, with its
# photography/ or _astro/) is not ours: stop before --delete could empty it.
listing="$({ connect; echo "cls -1 --classify"; } | lftp -f /dev/stdin)"
strangers="$(printf '%s\n' "$listing" | grep '/$' | grep -vxE 'assets/|\.well-known/|\./|\.\./' || true)"
if [ -n "$strangers" ]; then
  echo "error: $DEPLOY_DIR has folders the app doesn't make, so it is probably not the app's folder:" >&2
  printf '  %s\n' $strangers >&2
  echo "Check the DEPLOY_DIR secret (or empty the folder by hand if it really is the app's)." >&2
  exit 1
fi

dry_run=""
[ "${DRY_RUN:-0}" = "1" ] && dry_run="--dry-run"

{
  connect
  # .ftpquota and .well-known/ belong to the host; everything else is the build's.
  echo "mirror -R --delete --overwrite --verbose --parallel=4 $dry_run --exclude-glob .ftpquota --exclude-glob .well-known/ \"$local_dir\" ."
} | lftp -f /dev/stdin 2>&1 |
  # A dry run prints full URLs including user:password; cut that part out of the log.
  sed -E 's#://[^@/]*@#://#g'
