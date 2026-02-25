#!/usr/bin/env bash
# Build the web app, upload to S3, and invalidate CloudFront cache.
#
# Usage: ./scripts/deploy-web.sh [stage]
#
# Stage: first argument, or "dev" if omitted. Examples:
#   ./scripts/deploy-web.sh           # uses stage=dev
#   ./scripts/deploy-web.sh production
#
# Requires VITE_* env vars for the build (e.g. from .env in project root).

set -e
STAGE="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Load .env from project root if present (for VITE_API_URL, VITE_COGNITO_*, etc.)
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Stripe publishable key from Secrets Manager (same secret as API keys); set STRIPE_PUBLISHABLE_KEY in console so payment form shows
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "apex-sports-${STAGE}-stripe-keys" --query SecretString --output text 2>/dev/null || true)
if [ -n "$SECRET_JSON" ]; then
  PUBKEY=$(node -e "try{const s=process.argv[1];const v=JSON.parse(s).STRIPE_PUBLISHABLE_KEY;console.log(typeof v==='string'?v:'');}catch(e){console.log('');}" "$SECRET_JSON" 2>/dev/null || true)
  if [ -n "$PUBKEY" ]; then
    export VITE_STRIPE_PUBLISHABLE_KEY="$PUBKEY"
    echo "Using Stripe publishable key from Secrets Manager (apex-sports-${STAGE}-stripe-keys)"
  else
    echo "STRIPE_PUBLISHABLE_KEY not set in apex-sports-${STAGE}-stripe-keys; build will not show payment form. Add it to the secret in the console and redeploy."
  fi
else
  echo "Could not read apex-sports-${STAGE}-stripe-keys; build will not show payment form."
fi

echo "Building web app (stage=$STAGE)..."
npm run build

STACK_NAME="apex-sports-${STAGE}"
BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='WebBucketName'].OutputValue" --output text 2>/dev/null || true)
if [ -z "$BUCKET" ] || [ "$BUCKET" == "None" ]; then
  echo "Error: Could not get WebBucketName from stack $STACK_NAME"
  exit 1
fi

echo "Uploading to S3 (bucket=$BUCKET)..."
aws s3 sync apps/web/dist s3://"$BUCKET"/ --delete

echo "Invalidating CloudFront cache..."
DIST=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='WebDistributionId'].OutputValue" --output text 2>/dev/null || true)
if [ -z "$DIST" ] || [ "$DIST" == "None" ]; then
  echo "Could not get WebDistributionId from stack $STACK_NAME. Skip invalidation."
  exit 0
fi
AWS_PAGER="" aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" --output text --query "Invalidation.Id"
echo "Invalidation created. New content may take 1–2 minutes to appear everywhere."
