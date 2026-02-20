#!/usr/bin/env bash
set -euo pipefail

# ── Config ─────────────────────────────────────────────────
IMAGE="syntax-dm-gateway"
TAG="latest"
ARCHIVE="${IMAGE}.tar.gz"
KEY="key/gatewayPair.pem"
EC2_USER="ec2-user"
EC2_HOST="ec2-3-120-27-71.eu-central-1.compute.amazonaws.com"
REMOTE_DIR="/home/${EC2_USER}"
SSH_OPTS="-i ${KEY} -o StrictHostKeyChecking=no"

# ── Helpers ────────────────────────────────────────────────
info()  { echo -e "\033[1;34m→\033[0m $*"; }
ok()    { echo -e "\033[1;32m✓\033[0m $*"; }
fail()  { echo -e "\033[1;31m✗\033[0m $*"; exit 1; }

# ── Pre-checks ────────────────────────────────────────────
[[ -f "$KEY" ]] || fail "SSH key not found: $KEY (run from project root)"
command -v docker &>/dev/null || fail "docker not found"

# ── Step 1: Build Docker image ────────────────────────────
info "Building Docker image ${IMAGE}:${TAG} ..."
docker build -t "${IMAGE}:${TAG}" .
ok "Image built"

# ── Step 2: Export to tar.gz ──────────────────────────────
info "Saving image to ${ARCHIVE} ..."
docker save "${IMAGE}:${TAG}" | gzip > "${ARCHIVE}"
SIZE=$(du -h "${ARCHIVE}" | cut -f1)
ok "Image saved (${SIZE})"

# ── Step 3: Upload to EC2 ────────────────────────────────
info "Uploading ${ARCHIVE} to ${EC2_USER}@${EC2_HOST} ..."
scp ${SSH_OPTS} "${ARCHIVE}" "${EC2_USER}@${EC2_HOST}:${REMOTE_DIR}/"
ok "Upload complete"

# ── Step 4: Load image & restart on EC2 ──────────────────
info "Loading image and restarting on EC2 ..."
ssh ${SSH_OPTS} "${EC2_USER}@${EC2_HOST}" bash -s <<'REMOTE'
  set -euo pipefail
  cd ~
  echo "  Loading Docker image..."
  docker load < syntax-dm-gateway.tar.gz
  echo "  Restarting containers..."
  docker compose down
  docker compose up -d
  echo "  Cleaning up archive..."
  rm -f syntax-dm-gateway.tar.gz
  echo "  Waiting for health check..."
  sleep 5
  docker compose ps
REMOTE
ok "Deployment complete"

# ── Step 5: Cleanup local archive ────────────────────────
rm -f "${ARCHIVE}"
ok "Local archive cleaned up"

echo ""
ok "Deployed ${IMAGE}:${TAG} to ${EC2_HOST}"
