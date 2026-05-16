#!/usr/bin/env bash
# Server-side one-time setup (runs ON the server, called by init-server.sh)
# Run directly: ssh root@<IP> "bash -s <staging|production>" < scripts/setup-server.sh
# Reads env vars: GH_PAT, AWS_ACCESS_KEY, AWS_SECRET_KEY, S3_BUCKET
set -euo pipefail

PROJECT_DIR="/opt/erpnext"
DEPLOY_ENV="${1:-staging}"
DEFAULT_TAG="$([ "${DEPLOY_ENV}" = "production" ] && echo "latest" || echo "demo")"
IMAGE_TAG="${TAG_OVERRIDE:-${DEFAULT_TAG}}"
GH_PAT="${GH_PAT:-}"
S3_BUCKET="${S3_BUCKET:-deepzide-backups}"
AWS_ACCESS_KEY="${AWS_ACCESS_KEY:-}"
AWS_SECRET_KEY="${AWS_SECRET_KEY:-}"
DOMAIN="${DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
SITES_RULE="${SITES_RULE:-}"
if [ -z "${SITES_RULE}" ] && [ -n "${SITES_RULE_B64:-}" ]; then
  SITES_RULE="$(echo "${SITES_RULE_B64}" | base64 -d)"
fi

echo "=== cheese_erp server setup (${DEPLOY_ENV}) ==="

# 1. Install Docker (idempotent)
if ! command -v docker &>/dev/null; then
  echo ">>> Installing Docker..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm /tmp/get-docker.sh
else
  echo ">>> Docker already installed: $(docker --version)"
fi

systemctl enable docker 2>/dev/null || true
systemctl start docker 2>/dev/null || true

# 2. Ensure project directory exists and cd into it
mkdir -p "${PROJECT_DIR}"
cd "${PROJECT_DIR}"

# 3. Login to GitHub Container Registry (idempotent)
if [ -n "${GH_PAT}" ]; then
  echo ">>> Logging in to ghcr.io..."
  echo "${GH_PAT}" | docker login ghcr.io -u deepzide --password-stdin 2>/dev/null || true
fi

# 4. Create/update .env file
  cat > .env <<EOF
TAG=${IMAGE_TAG}
DEPLOY_ENV=${DEPLOY_ENV}
SITES_RULE=${SITES_RULE}
LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
DOMAIN=${DOMAIN}
EOF
echo ">>> .env created (TAG=${IMAGE_TAG}, DEPLOY_ENV=${DEPLOY_ENV}, DOMAIN=${DOMAIN})"

# 5. Make scripts executable
chmod +x "${PROJECT_DIR}/backup.sh" 2>/dev/null || true
chmod +x "${PROJECT_DIR}/restore.sh" 2>/dev/null || true

# 6. Setup AWS CLI and backup scripts (if credentials provided)
if [ -n "${AWS_ACCESS_KEY}" ] && [ -n "${AWS_SECRET_KEY}" ]; then
  echo ">>> Setting up AWS CLI and backups..."

  # Install AWS CLI if missing
  if ! command -v aws &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq unzip
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
    cd /tmp && unzip -qo awscliv2.zip
    /tmp/aws/install --update
    rm -rf /tmp/aws /tmp/awscliv2.zip
    cd "${PROJECT_DIR}"
  fi

  # Configure AWS credentials
  mkdir -p /root/.aws
  chmod 700 /root/.aws

  cat > /root/.aws/credentials <<CREDS
[default]
aws_access_key_id = ${AWS_ACCESS_KEY}
aws_secret_access_key = ${AWS_SECRET_KEY}
CREDS
  chmod 600 /root/.aws/credentials

  cat > /root/.aws/config <<CFG
[default]
region = us-east-1
CFG
  chmod 600 /root/.aws/config
  echo ">>> AWS CLI configured"

  # Setup cron jobs for backups (noon and midnight UTC) — idempotent
  (crontab -l 2>/dev/null || true) | grep -v "frappe_backup" > /tmp/crontab.tmp
  echo "0 12 * * * ${PROJECT_DIR}/backup.sh >> /var/log/frappe-backup.log 2>&1" >> /tmp/crontab.tmp
  echo "0 0  * * * ${PROJECT_DIR}/backup.sh >> /var/log/frappe-backup.log 2>&1" >> /tmp/crontab.tmp
  crontab /tmp/crontab.tmp
  rm /tmp/crontab.tmp
  echo ">>> Cron jobs configured (noon + midnight UTC)"
else
  echo ">>> Skipping AWS/backup setup (no credentials provided)"
fi

echo ""
echo "=== Setup complete ==="
