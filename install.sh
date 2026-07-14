#!/usr/bin/env bash
#
# install.sh — download & install a garage-webui release binary on this server
# and (re)start the systemd service. Doubles as the updater.
#
# The binary comes from a GitHub release built by the CI (frontend correctly
# embedded), so it avoids the "new binary, stale UI" pitfall of manual builds.
#
# Usage (run as root):
#   sudo ./install.sh            # install the latest release
#   sudo ./install.sh v2.5.0     # install a specific version
#
set -euo pipefail

REPO="${GARAGE_WEBUI_REPO:-davidschoefberger/garage-webui}"
DEST="${GARAGE_WEBUI_BIN:-/usr/local/bin/garage-webui}"
SERVICE="${GARAGE_WEBUI_SERVICE:-garage-webui}"

# --- architecture -----------------------------------------------------------
case "$(uname -m)" in
  x86_64 | amd64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# --- resolve version --------------------------------------------------------
TAG="${1:-}"
if [ -z "${TAG}" ]; then
  echo "==> Looking up latest release of ${REPO}"
  TAG="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name"[^"]*"([^"]+)".*/\1/')"
fi
[ -z "${TAG}" ] && { echo "Could not determine release tag." >&2; exit 1; }
[[ "${TAG}" == v* ]] || TAG="v${TAG}"

ASSET="garage-webui-${TAG}-linux-${ARCH}"
URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"

echo "==> Downloading ${ASSET}"
TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT
curl -fSL -o "${TMP}" "${URL}"
[ -s "${TMP}" ] || { echo "Downloaded file is empty." >&2; exit 1; }

# --- install ----------------------------------------------------------------
echo "==> Installing to ${DEST}"
chmod +x "${TMP}"
mv "${TMP}" "${DEST}"
trap - EXIT

# --- restart service --------------------------------------------------------
if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE}\.service"; then
  echo "==> Restarting ${SERVICE}"
  systemctl reset-failed "${SERVICE}" 2>/dev/null || true
  systemctl restart "${SERVICE}"
  sleep 1
  systemctl --no-pager --lines=5 status "${SERVICE}" || true
else
  echo "!! systemd service '${SERVICE}' not found — binary installed, start it yourself."
fi

echo "==> Done: ${TAG} installed at ${DEST}"
