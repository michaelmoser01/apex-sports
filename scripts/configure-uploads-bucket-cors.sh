#!/usr/bin/env bash
# Apply Object Ownership and CORS to the uploads S3 bucket so presigned PUT with public-read works.
# Run after 'npm run deploy' (same stage). Safe to run multiple times.
#
# Usage: ./scripts/configure-uploads-bucket-cors.sh [stage]
# Stage defaults to "dev".

set -e
STAGE="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET="apex-sports-uploads-${STAGE}-${ACCOUNT_ID}"

echo "Configuring uploads bucket: $BUCKET"

# Allow object ACLs (required for presigned PUT with public-read)
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerPreferred}]'

echo "Setting CORS..."

aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedOrigins": [
        "https://d36rrgq6wyjuf8.cloudfront.net",
        "http://localhost:5173",
        "http://localhost:3000"
      ]
    }
  ]
}'

echo "Done. CORS is set on $BUCKET"
