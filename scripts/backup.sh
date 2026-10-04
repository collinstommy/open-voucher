#!/bin/bash
set -euo pipefail

# Open Voucher Backup Script
# Usage: ./scripts/backup.sh [dev|prd] [docs|images|full]
#
#   docs   — database snapshot only. Cheap (~10 MB egress on prod).
#            Run this daily.
#   images — incremental image-only backup: downloads only voucher images
#            created since the last "images" run (a few MB/day). Needs a
#            one-time "full" baseline, or at least one full export close
#            enough in time to cover existing images.
#   full   — database snapshot + ALL file storage (~750 MB egress on prod).
#            One-time baseline / escape hatch only, with images mode
#            covering the day-to-day.
#
# Examples:
#   ./scripts/backup.sh dev
#   ./scripts/backup.sh prd docs
#   ./scripts/backup.sh prd images
#   ./scripts/backup.sh prd full
#
# Retention: docs archives are kept 7 days, full archives 30 days.
# Image files are kept indefinitely (write-once, small).

ENV=${1:-dev}
MODE=${2:-docs}

if [ "$ENV" != "dev" ] && [ "$ENV" != "prd" ]; then
    echo "Error: Invalid environment. Use 'dev' or 'prd'"
    echo "Usage: $0 [dev|prd] [docs|full]"
    exit 1
fi

if [ "$MODE" != "docs" ] && [ "$MODE" != "full" ] && [ "$MODE" != "images" ]; then
    echo "Error: Invalid mode. Use 'docs', 'images', or 'full'"
    echo "Usage: $0 [dev|prd] [docs|images|full]"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/packages/backend"

BACKUP_DIR="$HOME/backups/open-voucher"
LOG_DIR="$BACKUP_DIR/logs"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%Y-%m-%d_%H:%M:%S)
LOG_FILE="$LOG_DIR/backup-$DATE-$ENV.log"
BACKUP_NAME="open-voucher-backup-$ENV-$MODE-$DATE.zip"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

# Redirect all output to log file
exec >> "$LOG_FILE" 2>&1

echo "[$TIMESTAMP] Starting Open Voucher backup (env: $ENV, mode: $MODE)..."

# Loud reminder if file storage hasn't been exported in a while
if [ "$MODE" = "docs" ]; then
    RECENT_FULL=$(find "$BACKUP_DIR" \
        -name "open-voucher-backup-$ENV-full-*.zip" -mtime -14 | head -n 1)
    if [ -z "$RECENT_FULL" ]; then
        echo "[$TIMESTAMP] WARNING: no full backup (with file storage) in 14+ days."
        echo "[$TIMESTAMP] Schedule './scripts/backup.sh $ENV full' to back up images."
    fi
fi

# Build export command
EXPORT_ARGS="--path"
if [ "$ENV" = "prd" ]; then
    EXPORT_ARGS="--prod $EXPORT_ARGS"
    echo "[$TIMESTAMP] Targeting production deployment"
else
    echo "[$TIMESTAMP] Targeting dev deployment"
fi
if [ "$MODE" = "full" ]; then
    EXPORT_ARGS="--include-file-storage $EXPORT_ARGS"
    echo "[$TIMESTAMP] Including file storage"
fi

cd "$BACKEND_DIR"

# Incremental image backup — no snapshot export, just a watermark range.
if [ "$MODE" = "images" ]; then
    IMAGES_DIR="$BACKUP_DIR/images-$ENV"
    STATE_DIR="$BACKUP_DIR/state"
    WATERMARK_FILE="$STATE_DIR/$ENV-images-watermark"
    mkdir -p "$IMAGES_DIR" "$STATE_DIR"

    LAST=$(cat "$WATERMARK_FILE" 2>/dev/null || true)
    if [ -n "$LAST" ]; then
        SINCE_MS=$LAST
    else
        # No watermark: cover the last 31 days (voucher max lifetime) as the
        # first incremental pass. Pair with a one-time "full" for older image
        SINCE_MS=$(( $(date +%s) * 1000 - 31 * 86400000 ))
        echo "[$TIMESTAMP] No watermark found; using 31-day lookback."
    fi

    echo "[$TIMESTAMP] Fetching voucher images created since epoch_ms=$SINCE_MS..."

    if [ "$ENV" = "prd" ]; then
        PROD_FLAG="--prod"
    else
        PROD_FLAG=""
    fi
    LISTING=$(npx convex run $PROD_FLAG adminVouchers:getImageUploadsSince \
        "{\"since\": $SINCE_MS}" \
        | python3 -c 'import json,sys; d=json.load(sys.stdin); [print(r["imageStorageId"], r["createdAt"], r.get("url") or "-") for r in d]'
    ) || { echo "[$TIMESTAMP] ERROR: image listing query failed"; exit 1; }

    NEW_WATERMARK=$SINCE_MS
    FETCHED=0
    SKIPPED=0
    FAILED=0
    while [ -n "$LISTING" ] && read -r SID CREATED URL; do
        [ "$URL" = "-" ] && continue
        TARGET="$IMAGES_DIR/$SID"
        if [ -f "$TARGET" ]; then
            SKIPPED=$((SKIPPED + 1))
        elif curl -fsSL "$URL" -o "$TARGET"; then
            FETCHED=$((FETCHED + 1))
        else
            FAILED=$((FAILED + 1))
            echo "[$TIMESTAMP] WARN: failed to download $SID"
            continue
        fi
        if [ "$CREATED" -gt "$NEW_WATERMARK" ]; then
            NEW_WATERMARK=$CREATED
        fi
    done <<< "$LISTING"

    echo "[$TIMESTAMP] Image backup: $FETCHED fetched, $SKIPPED already present, $FAILED failed ($IMAGES_DIR)"

    # Advance the watermark only to the newest successfully-fetched row so
    # failures are retried on the next run.
    if [ "$FAILED" -eq 0 ]; then
        echo "$NEW_WATERMARK" > "$WATERMARK_FILE"
    fi

    echo "[$TIMESTAMP] Image backup completed."
    exit 0
fi

# Create temp directory for export so we don't conflict with existing files
WORK_DIR=$(mktemp -d)
echo "[$TIMESTAMP] Exporting to temporary directory..."

npx convex export $EXPORT_ARGS "$WORK_DIR"

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

# Retention: docs kept 7 days, full kept 30 days, pre-split backups (no
# mode marker) age out on the 7-day rule like docs.
DELETED_DOCS=$(find "$BACKUP_DIR" -maxdepth 1 \
    -name "open-voucher-backup-$ENV-docs-*.zip" -mtime +7 -print -delete | wc -l)
DELETED_FULL=$(find "$BACKUP_DIR" -maxdepth 1 \
    -name "open-voucher-backup-$ENV-full-*.zip" -mtime +30 -print -delete | wc -l)
DELETED_LEGACY=$(find "$BACKUP_DIR" -maxdepth 1 \
    -name "open-voucher-backup-$ENV-*.zip" \
    ! -name "*-docs-*.zip" ! -name "*-full-*.zip" \
    -mtime +7 -print -delete | wc -l)
echo "[$TIMESTAMP] Cleaned up backups (docs: $DELETED_DOCS, full: $DELETED_FULL, legacy: $DELETED_LEGACY)"

# Clean up logs older than 7 days
DELETED_LOGS=$(find "$LOG_DIR" -name "backup-*-$ENV.log" -mtime +7 -print -delete | wc -l)
echo "[$TIMESTAMP] Cleaned up $DELETED_LOGS old log(s)"

echo "[$TIMESTAMP] Backup completed successfully."
