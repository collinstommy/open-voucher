#!/bin/bash
set -euo pipefail

# Open Voucher Daily Backup Script
# Usage: ./scripts/backup.sh [dev|prd]
#
# Examples:
#   ./scripts/backup.sh dev     # Backup dev deployment
#   ./scripts/backup.sh prd     # Backup production deployment
#

# Parse environment argument
ENV=${1:-dev}
if [ "$ENV" != "dev" ] && [ "$ENV" != "prd" ]; then
    echo "Error: Invalid environment. Use 'dev' or 'prd'"
    echo "Usage: $0 [dev|prd]"
    exit 1
fi

# Determine project directory from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/packages/backend"

BACKUP_DIR="$HOME/backups/open-voucher"
LOG_DIR="$BACKUP_DIR/logs"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%d_%H:%M:%S)
LOG_FILE="$LOG_DIR/backup-$DATE-$ENV.log"
BACKUP_NAME="open-voucher-backup-$ENV-$DATE.zip"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

# Redirect all output to log file
exec >> "$LOG_FILE" 2>&1

echo "[$TIMESTAMP] Starting Open Voucher backup (env: $ENV)..."

# Build export command
EXPORT_ARGS="--path"
if [ "$ENV" = "prd" ]; then
    EXPORT_ARGS="--prod $EXPORT_ARGS"
    echo "[$TIMESTAMP] Targeting production deployment"
else
    echo "[$TIMESTAMP] Targeting dev deployment"
fi

cd "$BACKEND_DIR"

# Create temp directory for export so we don't conflict with existing files
WORK_DIR=$(mktemp -d)
echo "[$TIMESTAMP] Exporting to temporary directory..."

npx convex export $EXPORT_ARGS "$WORK_DIR" --include-file-storage

# Find the generated snapshot file
SNAPSHOT_FILE=$(ls "$WORK_DIR"/snapshot_*.zip 2>/dev/null | head -n 1)

if [ -z "$SNAPSHOT_FILE" ] || [ ! -f "$SNAPSHOT_FILE" ]; then
    echo "[$TIMESTAMP] ERROR: Export failed - no snapshot file found in $WORK_DIR"
    rm -rf "$WORK_DIR"
    exit 1
fi

# Move and rename to human-readable name
mv "$SNAPSHOT_FILE" "$BACKUP_DIR/$BACKUP_NAME"
rm -rf "$WORK_DIR"

FILE_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)
echo "[$TIMESTAMP] Backup saved: $BACKUP_NAME ($FILE_SIZE)"

# Clean up backups older than 7 days for this environment
DELETED_BACKUPS=$(find "$BACKUP_DIR" -maxdepth 1 -name "open-voucher-backup-$ENV-*.zip" -mtime +7 -print -delete | wc -l)
echo "[$TIMESTAMP] Cleaned up $DELETED_BACKUPS old backup(s)"

# Clean up logs older than 7 days
DELETED_LOGS=$(find "$LOG_DIR" -name "backup-*-$ENV.log" -mtime +7 -print -delete | wc -l)
echo "[$TIMESTAMP] Cleaned up $DELETED_LOGS old log(s)"

echo "[$TIMESTAMP] Backup completed successfully."
