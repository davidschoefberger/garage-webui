#!/usr/bin/env bash
#
# deploy.sh — commit, push and tag a release.
#
# The tag (vX.Y.Z) is derived from the "version" field in package.json and,
# when pushed, triggers the GitHub Actions release workflow that builds the
# linux amd64/arm64 binaries and the multi-arch Docker image.
#
# Usage:
#   ./deploy.sh                 # commit (if needed), push, tag from package.json
#   ./deploy.sh "commit message"
#
set -euo pipefail

cd "$(dirname "$0")"

# --- read version from package.json -> tag ---------------------------------
if command -v node >/dev/null 2>&1; then
  VERSION="$(node -p "require('./package.json').version")"
else
  VERSION="$(grep -m1 '"version"' package.json | sed -E 's/.*"version"[^"]*"([^"]+)".*/\1/')"
fi
TAG="v${VERSION}"
MSG="${1:-Release ${TAG}}"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REPO="$(git config --get remote.origin.url \
  | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"

echo "==> Deploying ${TAG} (branch: ${BRANCH})"

# --- 1) commit pending changes ---------------------------------------------
if [ -n "$(git status --porcelain)" ]; then
  echo "==> Committing changes"
  git add -A
  git commit -m "${MSG}"
else
  echo "==> Working tree clean, nothing to commit"
fi

# --- 2) push the branch -----------------------------------------------------
echo "==> Pushing ${BRANCH}"
git push origin "${BRANCH}"

# --- 3) create & push the tag (triggers the release workflow) --------------
if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "!!  Tag ${TAG} already exists."
  read -r -p "    Overwrite it and re-run the release? [y/N] " ans
  if [[ "${ans}" =~ ^[Yy]$ ]]; then
    git tag -d "${TAG}"
    git push origin ":refs/tags/${TAG}" || true
  else
    echo "==> Skipping tag. Bump the version in package.json for a new release."
    exit 1
  fi
fi

git tag "${TAG}"
git push origin "${TAG}"

echo "==> Done. The release workflow is now building ${TAG}."
[ -n "${REPO}" ] && echo "    Watch: https://github.com/${REPO}/actions"
