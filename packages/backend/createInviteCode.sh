#!/bin/bash

# createInviteCode - Create invite codes via CLI
# Usage: ./createInviteCode.sh [OPTIONS]

# Default values
CODE=""
LABEL=""
MAX_USES=50
EXPIRES=""
PROD=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -c|--code)
      CODE="$2"
      shift 2
      ;;
    -l|--label)
      LABEL="$2"
      shift 2
      ;;
    -m|--max-uses)
      MAX_USES="$2"
      shift 2
      ;;
    -e|--expires)
      EXPIRES="$2"
      shift 2
      ;;
    -p|--prod)
      PROD=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Create a new invite code for the open-voucher system"
      echo ""
      echo "Options:"
      echo "  -c, --code CODE      Custom invite code (optional, auto-generated if not provided)"
      echo "  -l, --label LABEL    Description for tracking purposes (optional)"
      echo "  -m, --max-uses NUM   Maximum number of uses (default: 50)"
      echo "  -e, --expires NUM    Expiry in days (default: no expiry)"
      echo "  -p, --prod          Use production environment (default: development)"
      echo "  -h, --help          Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0                                            # Auto-generated code"
      echo "  $0 -l 'Twitter campaign'                      # With label"
      echo "  $0 -c 'REDDIT50' -l 'Reddit launch' -m 100    # Full configuration"
      echo "  $0 -c 'PARTY25' -l 'Birthday party' -p        # Production environment"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use -h or --help for usage information"
      exit 1
      ;;
  esac
done

# Validate maxUses is a number
if ! [[ "$MAX_USES" =~ ^[0-9]+$ ]]; then
  echo "Error: max-uses must be a positive number"
  exit 1
fi

# Validate expires is a number (if provided)
if [ ! -z "$EXPIRES" ] && ! [[ "$EXPIRES" =~ ^[0-9]+$ ]]; then
  echo "Error: expires must be a positive number"
  exit 1
fi

# Build args JSON
ARGS="{"
if [ ! -z "$CODE" ]; then
  ARGS="${ARGS}\"code\":\"${CODE^^}\""
fi
if [ ! -z "$LABEL" ]; then
  if [ ${#ARGS} -gt 1 ]; then ARGS="${ARGS},"; fi
  ARGS="${ARGS}\"label\":\"${LABEL}\""
fi
if [ "$MAX_USES" != "50" ]; then
  if [ ${#ARGS} -gt 1 ]; then ARGS="${ARGS},"; fi
  ARGS="${ARGS}\"maxUses\":${MAX_USES}"
fi
if [ ! -z "$EXPIRES" ]; then
  if [ ${#ARGS} -gt 1 ]; then ARGS="${ARGS},"; fi
  ARGS="${ARGS}\"expiresInDays\":${EXPIRES}"
fi
ARGS="${ARGS}}"

# Set environment flag
ENV_FLAG=""
if [ "$PROD" = true ]; then
  ENV_FLAG="--prod"
fi

echo "Creating invite code..."
echo "Environment: $([ "$PROD" = true ] && echo "production" || echo "development")"
if [ ! -z "$CODE" ]; then
  echo "Code: ${CODE^^}"
fi
if [ ! -z "$LABEL" ]; then
  echo "Label: $LABEL"
fi
echo "Max uses: $MAX_USES"
if [ ! -z "$EXPIRES" ]; then
  echo "Expires in: $EXPIRES days"
fi
echo ""

# Run the command
cd packages/backend
RESULT=$(npx convex run users:createInviteCode "$ARGS" $ENV_FLAG 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Invite code created successfully!"
  echo ""
  echo "$RESULT"

  # Try to extract the code for sharing link
  if [ ! -z "$CODE" ]; then
    echo ""
    echo "🔗 Share: https://t.me/your_bot?start=${CODE^^}"
  fi
else
  echo "❌ Error creating invite code:"
  echo "$RESULT"
  exit 1
fi
