#!/usr/bin/env bash
# Invalidate CloudFront cache so the latest S3 content is served.
# Use this if you already uploaded a new build but still see old content.
# Usage: ./scripts/invalidate-cloudfront.sh [stage]

set -e
STAGE="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

STACK_NAME="apex-sports-${STAGE}"
DIST=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='WebDistributionId'].OutputValue" --output text 2>/dev/null || true)
if [ -z "$DIST" ] || [ "$DIST" == "None" ]; then
  echo "Error: Could not get WebDistributionId from stack $STACK_NAME"
  exit 1
fi
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*"
echo "Invalidation created. New content may take 1–2 minutes to appear."
