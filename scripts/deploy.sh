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
# The folder ends up holding this build and the one before it: new and changed files are uploaded,
# and files that belong to neither build are deleted (older hashed scripts). Characters are not on the
# server; they live in each player's browser, so a deploy never touches them.
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

# The previous build's files stay for one more deploy. A tab opened before this upload still runs the
# previous build: until its engine worker has started, or when it loads a file only on demand (an older
# sheet version's scripts), it asks the server for the previous build's file names, and a 404 there
# ends in "the engine could not load" in the middle of a session. The list of the build that is up
# now is kept on the server in $files_list; each deploy reads it, spares those files, and replaces it.
# (Anyone can fetch that list, like any file there; it names only the build's files, as sw.js does.)
files_list=deploy-files.txt
new_files="$(cd "$local_dir" && find . -type f | sed 's#^\./##' | LC_ALL=C sort)"
# A missing list (the first deploy with it, or one done by hand) reads as empty, and `cat` failing
# for any other reason does too, so its errors don't stop the deploy...
previous="$({ connect; echo "set cmd:fail-exit no"; echo "cat $files_list"; } | lftp -f /dev/stdin 2>/dev/null || true)"
# ...and without a list nothing is deleted this time: a deploy that can't tell the previous build's
# files apart keeps all of them. The next deploy's list sorts them out.
delete="--delete"
if [ -z "$previous" ]; then
  delete=""
  echo "No $files_list on the server: keeping every file this time."
fi
# Only plain relative paths that can't read as an option: anything else in the list (it is a file on
# the server, after all) is not a name this script made, and must not reach lftp's command line.
spare="$(printf '%s\n' "$previous" | grep -xE '[A-Za-z0-9._][A-Za-z0-9._-]*(/[A-Za-z0-9._][A-Za-z0-9._-]*)*' | grep -vE '(^|/)\.\.?(/|$)' |
  LC_ALL=C sort -u | LC_ALL=C comm -23 - <(printf '%s\n' "$new_files") || true)"
keep=""
for file in $spare; do keep="$keep --exclude-glob $file"; done
if [ -n "$spare" ]; then
  echo "Keeping the previous build's files:"
  printf '  %s\n' $spare
fi

# .ftpquota and .well-known/ belong to the host; the list of files is this script's; everything else is
# the build's.
mirror="mirror -R --overwrite --verbose --parallel=4 $dry_run --exclude-glob .ftpquota --exclude-glob .well-known/ --exclude-glob $files_list"
listed="$(mktemp)"
trap 'rm -f "$listed"' EXIT
printf '%s\n' "$new_files" >"$listed"
{
  connect
  # Three passes, so that someone opening the app during an upload never gets a page whose scripts
  # aren't there yet (lftp uploads the folder's own files before assets/): first the new build
  # files next to the old ones, then index.html, and only then sw.js (the service worker stores
  # the build's files and its index.html for offline use, so it comes after both; a parallel
  # upload in one pass could put it first) together with removing the files of the builds before the
  # previous one (excluded files are never deleted).
  echo "$mirror --exclude-glob index.html --exclude-glob sw.js \"$local_dir\" ."
  echo "$mirror --exclude-glob sw.js \"$local_dir\" ."
  echo "$mirror $delete $keep \"$local_dir\" ."
  # Last, so a deploy that stopped halfway leaves the list of the build that was fully up.
  if [ -z "$dry_run" ]; then echo "put $(quote "$listed") -o $files_list"; fi
} | lftp -f /dev/stdin 2>&1 |
  # A dry run prints full URLs including user:password; cut that part out of the log.
  sed -E 's#://[^@/]*@#://#g'
