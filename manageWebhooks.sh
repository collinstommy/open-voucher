#!/bin/bash

# manageWebhooks - Delete and set Telegram bot webhooks using Doppler-managed environment variables
# Usage: ./manageWebhooks.sh [dev|prd]
#
# SETUP INSTRUCTIONS:
# 1. Install Doppler CLI: brew install doppler (or see https://docs.doppler.com/docs/install-cli)
# 2. Login to Doppler: doppler login
# 3. Setup Doppler project: doppler setup
# 4. Run script: ./manageWebhooks.sh dev (or prd)
#
# Required Doppler secrets (all are required):
#   - TELEGRAM_TOKEN
#   - CONVEX_WEBHOOK_URL
#   - TELEGRAM_WEBHOOK_SECRET
#   - GOOGLE_GENERATIVE_AI_API_KEY
#   - ADMIN_PASSWORD

# Check if environment argument is provided
ENV=${1:-dev}
if [ "$ENV" != "dev" ] && [ "$ENV" != "prd" ]; then
    echo "Error: Invalid environment. Use 'dev' or 'prd'"
    echo "Usage: ./manageWebhooks.sh [dev|prd]"
    exit 1
fi

# Check if Doppler CLI is available
if ! command -v doppler &> /dev/null; then
    echo "Error: Doppler CLI is not installed or not in PATH"
    echo "Please install Doppler CLI first:"
    echo "  brew install doppler"
    echo "  or visit: https://docs.doppler.com/docs/install-cli"
    exit 1
fi

# Check if Doppler is logged in
if ! doppler me &> /dev/null; then
    echo "Error: Not logged into Doppler"
    echo "Please run: doppler login"
    exit 1
fi

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo "Error: npx is not installed or not in PATH"
    echo "Please install Node.js and npm/npx first"
    exit 1
fi

# Check if convex is available
if ! npx convex --version &> /dev/null; then
    echo "Convex CLI not found, installing..."
    npm install -g convex
    if ! npx convex --version &> /dev/null; then
        echo "Error: Failed to install Convex CLI"
        echo "Please run: npm install -g convex"
        exit 1
    fi
fi

# Fetch secrets from Doppler
echo "Fetching secrets from Doppler ($ENV environment)..."

# Debug: List available environments
echo ""
echo "Available environments in Doppler:"
doppler environments 2>/dev/null || echo "  (unable to list environments - check doppler setup)"
echo ""

TELEGRAM_TOKEN=$(doppler secrets get TELEGRAM_TOKEN --plain -c $ENV 2>/dev/null)
CONVEX_WEBHOOK_URL=$(doppler secrets get CONVEX_WEBHOOK_URL --plain -c $ENV 2>/dev/null)
TELEGRAM_WEBHOOK_SECRET=$(doppler secrets get TELEGRAM_WEBHOOK_SECRET --plain -c $ENV 2>/dev/null)
GOOGLE_GENERATIVE_AI_API_KEY=$(doppler secrets get GOOGLE_GENERATIVE_AI_API_KEY --plain -c $ENV 2>/dev/null)
ADMIN_PASSWORD=$(doppler secrets get ADMIN_PASSWORD --plain -c $ENV 2>/dev/null)

# Check required variables
MISSING_SECRETS=""
if [ -z "$TELEGRAM_TOKEN" ]; then
    MISSING_SECRETS="${MISSING_SECRETS}  - TELEGRAM_TOKEN
"
fi
if [ -z "$CONVEX_WEBHOOK_URL" ]; then
    MISSING_SECRETS="${MISSING_SECRETS}  - CONVEX_WEBHOOK_URL
"
fi
if [ -z "$TELEGRAM_WEBHOOK_SECRET" ]; then
    MISSING_SECRETS="${MISSING_SECRETS}  - TELEGRAM_WEBHOOK_SECRET
"
fi
if [ -z "$GOOGLE_GENERATIVE_AI_API_KEY" ]; then
    MISSING_SECRETS="${MISSING_SECRETS}  - GOOGLE_GENERATIVE_AI_API_KEY
"
fi
if [ -z "$ADMIN_PASSWORD" ]; then
    MISSING_SECRETS="${MISSING_SECRETS}  - ADMIN_PASSWORD
"
fi

if [ ! -z "$MISSING_SECRETS" ]; then
    echo "Error: Missing required secrets in Doppler ($ENV environment)"
    echo ""
    echo "Missing secrets:"
    echo -e "$MISSING_SECRETS"
    echo "All secrets are required."
    echo ""
    echo "To view secrets in this config:"
    echo "  doppler secrets -c $ENV"
    echo ""
    echo "Your Doppler environments:"
    doppler environments 2>/dev/null || echo "  (run 'doppler environments' to view)"
    exit 1
fi

echo "=== Webhook Management Script ($ENV) ==="
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

    echo "Setting ${env_name} webhook to: ${url}"

    # Check if secret is provided
    local secret_param=""
    if [ ! -z "$secret" ]; then
        secret_param="&secret_token=${secret}"
        echo "Using webhook secret"
    fi

    response=$(curl -s -X POST "https://api.telegram.org/bot${token}/setWebhook?url=${url}${secret_param}")
    echo "Response: $response"
    echo ""
}

# Function to set Convex environment variables
set_convex_vars() {
    local env_name=$1
    local telegram_token=$2
    local gemini_token=$3
    local webhook_secret=$4
    local admin_password=$5

    echo "Setting Convex environment variables for ${env_name}..."

    # Determine if we're setting prod or dev variables
    local prod_flag=""
    if [ "$env_name" = "prd" ]; then
        prod_flag="--prod"
    fi

    # Determine ENVIRONMENT value
    local environment_value="development"
    if [ "$env_name" = "prd" ]; then
        environment_value="production"
    fi

    # Set ENVIRONMENT
    echo "Setting ENVIRONMENT to ${environment_value}..."
    (cd packages/backend && npx convex env set ENVIRONMENT "$environment_value" $prod_flag)

    # Set Telegram token
    echo "Setting TELEGRAM_BOT_TOKEN..."
    (cd packages/backend && npx convex env set TELEGRAM_BOT_TOKEN "$telegram_token" $prod_flag)

    # Set Telegram Webhook Secret
    echo "Setting TELEGRAM_WEBHOOK_SECRET..."
    (cd packages/backend && npx convex env set TELEGRAM_WEBHOOK_SECRET "$webhook_secret" $prod_flag)

    # Set Gemini token
    echo "Setting GOOGLE_GENERATIVE_AI_API_KEY..."
    (cd packages/backend && npx convex env set GOOGLE_GENERATIVE_AI_API_KEY "$gemini_token" $prod_flag)

    # Set Admin password
    echo "Setting ADMIN_PASSWORD..."
    (cd packages/backend && npx convex env set ADMIN_PASSWORD "$admin_password" $prod_flag)
    echo ""
}

# Delete existing webhook
echo "=== Step 1: Deleting existing webhook ==="
delete_webhook "$TELEGRAM_TOKEN" "$ENV"

# Set new webhook
echo "=== Step 2: Setting new webhook ==="
set_webhook "$TELEGRAM_TOKEN" "$CONVEX_WEBHOOK_URL" "$ENV" "$TELEGRAM_WEBHOOK_SECRET"

# Set Convex environment variables
echo "=== Step 3: Setting Convex environment variables ==="
set_convex_vars "$ENV" "$TELEGRAM_TOKEN" "$GOOGLE_GENERATIVE_AI_API_KEY" "$TELEGRAM_WEBHOOK_SECRET" "$ADMIN_PASSWORD"

echo "=== Complete webhook and environment setup for $ENV ==="
