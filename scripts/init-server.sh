#!/usr/bin/env bash
# Initialize a cheese_erp server from scratch.
# Run locally (one command, zero manual steps):
#   ./scripts/init-server.sh <server-ip> <staging|production> [custom-tag]
#
# Examples:
#   ./scripts/init-server.sh 62.171.181.244 staging
#   ./scripts/init-server.sh 217.76.58.119 production
#
# Reads from your shell env:
#   GH_PAT            — GitHub PAT for ghcr.io login (required)
#   AWS_ACCESS_KEY_ID     — for S3 backups (optional)
#   AWS_SECRET_ACCESS_KEY — for S3 backups (optional)
#   AWS_S3_BUCKET         — S3 bucket name (default: deepzide-backups)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SERVER_IP="${1:?Usage: $0 <server-ip> <staging|production> [custom-tag]}"
DEPLOY_ENV="${2:?Usage: $0 <server-ip> <staging|production> [custom-tag]}"
TAG_OVERRIDE="${3:-}"
PROJECT_DIR="/opt/erpnext"

if [ -z "${GH_PAT:-}" ]; then
  echo "ERROR: GH_PAT is required. Set it in your environment first."
  echo "  export GH_PAT='ghp_...'"
  exit 1
fi

echo "============================================"
echo " cheese_erp init — ${DEPLOY_ENV}"
echo " Server: ${SERVER_IP}"
echo "============================================"

# 1. Trust SSH host key
echo ">>> Adding SSH host key..."
ssh-keyscan -H "${SERVER_IP}" >> ~/.ssh/known_hosts 2>/dev/null

# 2. Test connection
echo ">>> Testing SSH connection..."
ssh -o ConnectTimeout=10 root@"${SERVER_IP}" "echo 'SSH OK'"

# 3. Create project directory
echo ">>> Creating ${PROJECT_DIR}..."
ssh root@"${SERVER_IP}" "mkdir -p ${PROJECT_DIR}"

# 4. Copy all required files to server
echo ">>> Copying files to server..."
scp "${REPO_DIR}/docker-compose.yml" root@"${SERVER_IP}:${PROJECT_DIR}/"
scp "${SCRIPT_DIR}/alloy-config.alloy" root@"${SERVER_IP}:${PROJECT_DIR}/"
scp "${SCRIPT_DIR}/backup.sh"       root@"${SERVER_IP}:${PROJECT_DIR}/"
scp "${SCRIPT_DIR}/restore.sh"      root@"${SERVER_IP}:${PROJECT_DIR}/"
scp "${SCRIPT_DIR}/setup-server.sh" root@"${SERVER_IP}:${PROJECT_DIR}/"

# 5. Run server setup
echo ">>> Running setup on server..."
ssh root@"${SERVER_IP}" "
  export GH_PAT='${GH_PAT}'
  export AWS_ACCESS_KEY='${AWS_ACCESS_KEY_ID:-}'
  export AWS_SECRET_KEY='${AWS_SECRET_ACCESS_KEY:-}'
  export S3_BUCKET='${AWS_S3_BUCKET:-deepzide-backups}'
  export TAG_OVERRIDE='${TAG_OVERRIDE}'
  export DOMAIN='${DOMAIN:-}'
  export LETSENCRYPT_EMAIL='${LETSENCRYPT_EMAIL:-}'
  export SITES_RULE='${SITES_RULE:-}'
  bash ${PROJECT_DIR}/setup-server.sh ${DEPLOY_ENV}
"

echo ""
echo "============================================"
echo " Server initialized successfully!"
echo "============================================"
echo " Next push to CI will auto-deploy."
echo " Or manual first deploy:"
echo "   ssh root@${SERVER_IP} 'cd ${PROJECT_DIR} && docker compose up -d'"
