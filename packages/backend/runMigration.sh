#!/bin/bash

# runMigration.sh - Broadcast migration message
# Usage: ./runMigration.sh <OLD_BOT_TOKEN> <NEW_BOT_LINK> [--prod]

OLD_TOKEN=$1
NEW_LINK=$2
ENV_FLAG=$3

if [ -z "$OLD_TOKEN" ] || [ -z "$NEW_LINK" ]; then
    echo "Usage: ./runMigration.sh <OLD_BOT_TOKEN> <NEW_BOT_LINK> [--prod]"
    echo "Example: ./runMigration.sh '123:ABC' 'https://t.me/MyNewBot' --prod"
    exit 1
fi

# Ensure we are in the script's directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "Using Token: ${OLD_TOKEN:0:5}..."
echo "New Link: $NEW_LINK"
echo "Environment: ${ENV_FLAG:-dev}"
echo ""
# Parse flags
DRY_RUN="false"
if [[ "$*" == *"--dry-run"* ]]; then
    DRY_RUN="true"
    echo "Running in DRY RUN mode (no messages will be sent)"
fi

read -p "Are you sure you want to broadcast this message to ALL users? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

ARGS="{\"oldBotToken\":\"$OLD_TOKEN\",\"newBotLink\":\"$NEW_LINK\",\"dryRun\":${DRY_RUN}}"

# Run the command
npx convex run migration:broadcastMigrationMessage "$ARGS" $ENV_FLAG
