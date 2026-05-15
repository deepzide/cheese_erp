#!/usr/bin/env bash
# Frappe Restore Script — cheese_erp
# Usage: /opt/erpnext/restore.sh [YYYY-MM-DD_HHMMSS]
#   If no timestamp provided, restores the most recent backup.
set -euo pipefail

COMPOSE_DIR="/opt/erpnext"
S3_BUCKET="${S3_BUCKET:-deepzide-backups}"
DEPLOY_ENV="${DEPLOY_ENV:-staging}"
S3_PREFIX="s3://${S3_BUCKET}/backups/cheese_erp/${DEPLOY_ENV}"
RESTORE_DIR="/tmp/frappe-restore"
SITE="frontend"

echo "=== Frappe Restore — cheese_erp (${DEPLOY_ENV}) ==="

# 1. Determine which backup to restore
if [ -n "${1:-}" ]; then
  RESTORE_DATE="$1"
  echo "Restoring from date: $RESTORE_DATE"
else
  echo "Finding most recent backup..."
  RESTORE_DATE=$(aws s3 ls "${S3_PREFIX}/" | awk '{print $NF}' | tr -d '/' | sort -r | head -1)
  if [ -z "$RESTORE_DATE" ]; then
    echo "ERROR: No backups found in ${S3_PREFIX}/"
    exit 1
  fi
  echo "Most recent backup: $RESTORE_DATE"
fi

# 2. Download backup from S3
echo "Downloading backup from S3..."
rm -rf "$RESTORE_DIR"
mkdir -p "$RESTORE_DIR"
aws s3 sync "${S3_PREFIX}/${RESTORE_DATE}/" "$RESTORE_DIR/"

# 3. Identify backup files
DB_FILE=$(ls "$RESTORE_DIR"/*-database.sql.gz 2>/dev/null | sort -r | head -1)
FILES_FILE=$(ls "$RESTORE_DIR"/*-files.tgz 2>/dev/null | grep -v private | sort -r | head -1)
PRIVATE_FILES=$(ls "$RESTORE_DIR"/*-private-files.tgz 2>/dev/null | sort -r | head -1)

if [ -z "$DB_FILE" ]; then
  echo "ERROR: No database backup found in $RESTORE_DIR"
  exit 1
fi

echo "Database:      $(basename "$DB_FILE")"
echo "Public files:  $(basename "${FILES_FILE:-none}")"
echo "Private files: $(basename "${PRIVATE_FILES:-none}")"

# 4. Copy backup files into the container
echo "Copying files to container..."
cd "${COMPOSE_DIR}"
docker compose exec -T backend mkdir -p /tmp/restore/
docker compose cp "$RESTORE_DIR/." backend:/tmp/restore/

# 5. Wait for MariaDB to be ready
echo "Waiting for MariaDB..."
until docker compose exec -T db mysqladmin ping -h db --silent 2>/dev/null; do
  sleep 2
done

# 6. Run bench restore
echo "Restoring database..."
RESTORE_CMD="bench --site $SITE restore /tmp/restore/$(basename "$DB_FILE")"

if [ -n "${FILES_FILE:-}" ]; then
  RESTORE_CMD="$RESTORE_CMD --with-public-files /tmp/restore/$(basename "$FILES_FILE")"
fi

if [ -n "${PRIVATE_FILES:-}" ]; then
  RESTORE_CMD="$RESTORE_CMD --with-private-files /tmp/restore/$(basename "$PRIVATE_FILES")"
fi

RESTORE_CMD="$RESTORE_CMD --db-root-password admin --force"

docker compose exec -T backend $RESTORE_CMD

# 7. Run migrations
echo "Running migrations..."
docker compose exec -T backend bench --site "$SITE" migrate

# 8. Clear cache
echo "Clearing cache..."
docker compose exec -T backend bench --site "$SITE" clear-cache

# 9. Clean up
echo "Cleaning up..."
docker compose exec -T backend rm -rf /tmp/restore/
rm -rf "$RESTORE_DIR"

echo "=== Restore completed successfully ==="
