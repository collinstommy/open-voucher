#!/bin/bash

# manageWebhooks - Delete and set dev/prod Telegram bot webhooks and Convex environment variables
# Usage: ./manageWebhooks.sh
#
# SETUP INSTRUCTIONS:
# 1. Copy .env.sample to .env: cp .env.sample .env
# 2. Edit .env with your actual values:
#    - Get Telegram bot tokens from @BotFather on Telegram
#    - Get Gemini API key from https://aistudio.google.com/app/apikey
#    - Find your Convex deployment URLs (e.g., https://your-deployment.convex.site)
# 3. Install Convex CLI: npm install -g convex
# 4. Run script: ./manageWebhooks.sh
#
# Reads variables from .env file

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    echo ""
    echo "To set up your environment:"
    echo "  1. Copy .env.sample to .env: cp .env.sample .env"
    echo "  2. Edit .env with your actual values"
    echo "  3. Run this script again"
    exit 1
fi

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo "Error: npx is not installed or not in PATH"
    echo "Please install Node.js and npm/npx first"
    exit 1
fi

# Check if convex is available, install if missing
if ! npx convex --version &> /dev/null; then
    echo "Convex CLI not found, installing..."
    npm install -g convex
    if ! npx convex --version &> /dev/null; then
        echo "Error: Failed to install Convex CLI"
        echo "Please run: npm install -g convex"
        exit 1
    fi
fi

# Source the .env file
set -a
source .env
set +a

# Check required variables
if [ -z "$PROD_TOKEN" ] || [ -z "$PROD_URL_WEBHOOK" ] || [ -z "$DEV_TOKEN" ] || [ -z "$DEV_URL_WEBHOOK" ]; then
    echo "Error: Missing required variables in .env file:"
    echo "  PROD_TOKEN, PROD_URL_WEBHOOK, DEV_TOKEN, DEV_URL_WEBHOOK"
    exit 1
fi

echo "=== Webhook Management Script ==="
echo ""

# Function to delete webhook
delete_webhook() {
    local token=$1
    local env_name=$2
    echo "Deleting ${env_name} webhook..."
    response=$(curl -s "https://api.telegram.org/bot${token}/deleteWebhook")
    echo "Response: $response"
    echo ""
}

# Function to set webhook
set_webhook() {
    local token=$1
    local url=$2
    local env_name=$3
    local secret=$4

    echo "Setting ${env_name} webhook to: ${url} with secret token"

    # Check if secret is provided
    local secret_param=""
    if [ ! -z "$secret" ]; then
        secret_param="&secret_token=${secret}"
    fi

    response=$(curl -s -X POST "https://api.telegram.org/bot${token}/setWebhook?url=${url}${secret_param}")
    echo "Response: $response"
    echo ""
}

# Function to set Convex environment variables
set_convex_vars() {
    local team=$1
    local project=$2
    local telegram_token=$3
    local gemini_token=$4
    local env_name=$5
    local webhook_secret=$6

    echo "Setting Convex environment variables for ${env_name}..."

    # Determine if we're setting prod or dev variables
    local prod_flag=""
    if [ "$env_name" = "PROD" ]; then
        prod_flag="--prod"
    fi

    # Set Telegram token
    if [ ! -z "$telegram_token" ]; then
        echo "Setting TELEGRAM_BOT_TOKEN..."
        (cd packages/backend && npx convex env set TELEGRAM_BOT_TOKEN "$telegram_token" $prod_flag)
    fi

    # Set Telegram Webhook Secret
    if [ ! -z "$webhook_secret" ]; then
        echo "Setting TELEGRAM_WEBHOOK_SECRET..."
        (cd packages/backend && npx convex env set TELEGRAM_WEBHOOK_SECRET "$webhook_secret" $prod_flag)
    fi

    # Set Gemini token
    if [ ! -z "$gemini_token" ]; then
        echo "Setting GOOGLE_GENERATIVE_AI_API_KEY..."
        (cd packages/backend && npx convex env set GOOGLE_GENERATIVE_AI_API_KEY "$gemini_token" $prod_flag)
    fi
    echo ""
}

# Delete existing webhooks
echo "=== Step 1: Deleting existing webhooks ==="
delete_webhook "$PROD_TOKEN" "PROD"
delete_webhook "$DEV_TOKEN" "DEV"

# Set new webhooks
echo "=== Step 2: Setting new webhooks ==="
set_webhook "$PROD_TOKEN" "$PROD_URL_WEBHOOK" "PROD" "$PROD_TELEGRAM_WEBHOOK_SECRET"
set_webhook "$DEV_TOKEN" "$DEV_URL_WEBHOOK" "DEV" "$DEV_TELEGRAM_WEBHOOK_SECRET"

# Set Convex environment variables
echo "=== Step 3: Setting Convex environment variables ==="
# These need to be set in your .env file:
# PROD_TEAM=your-prod-team-name
# PROD_PROJECT=your-prod-project-name
# PROD_GEMINI_TOKEN=your-prod-gemini-token
# DEV_TEAM=your-dev-team-name
# DEV_PROJECT=your-dev-project-name
# DEV_GEMINI_TOKEN=your-dev-gemini-token

set_convex_vars "" "" "$PROD_TOKEN" "$PROD_GOOGLE_GENERATIVE_AI_API_KEY" "PROD" "$PROD_TELEGRAM_WEBHOOK_SECRET"
set_convex_vars "" "" "$DEV_TOKEN" "$DEV_GOOGLE_GENERATIVE_AI_API_KEY" "DEV" "$DEV_TELEGRAM_WEBHOOK_SECRET"

echo "=== Complete webhook and environment setup ==="
