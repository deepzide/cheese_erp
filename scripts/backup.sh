#!/usr/bin/env bash
# Frappe Backup Script — cheese_erp
# Runs via cron, logs to /var/log/frappe-backup.log
set -euo pipefail

LOG="/var/log/frappe-backup.log"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_DIR="/tmp/frappe-backup-${TIMESTAMP}"
COMPOSE_DIR="/opt/erpnext"
S3_BUCKET="${S3_BUCKET:-deepzide-backups}"
DEPLOY_ENV="${DEPLOY_ENV:-staging}"
S3_PREFIX="s3://${S3_BUCKET}/backups/cheese_erp/${DEPLOY_ENV}/${TIMESTAMP}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

log "=== Starting backup ==="

# 1. Run bench backup inside the backend container
log "Running bench backup --with-files --compress..."
cd "${COMPOSE_DIR}"
docker compose exec -T backend \
  bench --site frontend backup --with-files --compress >> "$LOG" 2>&1

# 2. Copy backup files from container to host
log "Copying backup files from container..."
mkdir -p "$BACKUP_DIR"
docker compose cp \
  backend:/home/frappe/frappe-bench/sites/frontend/private/backups/. \
  "$BACKUP_DIR/" >> "$LOG" 2>&1

# 3. Upload to S3
log "Uploading to ${S3_PREFIX}..."
aws s3 sync "$BACKUP_DIR/" "$S3_PREFIX/" >> "$LOG" 2>&1

# 4. Clean up local temp files
rm -rf "$BACKUP_DIR"

# 5. Clean up old backups inside the container (older than 2 days)
log "Cleaning up old backups inside container..."
docker compose exec -T backend \
  bash -c "find /home/frappe/frappe-bench/sites/frontend/private/backups/ -type f -mtime +2 -delete" >> "$LOG" 2>&1 || true

log "=== Backup completed successfully ==="
