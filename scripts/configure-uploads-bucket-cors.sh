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

# Web origin for this stage (browser sends this as Origin when uploading from the app)
if [ "$STAGE" = "prod" ]; then
  WEB_ORIGIN="https://getapexsports.com"
else
  WEB_ORIGIN="https://dev.getapexsports.com"
fi

echo "Configuring uploads bucket: $BUCKET (origin: $WEB_ORIGIN)"

# Allow object ACLs (required for presigned PUT with public-read)
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerPreferred}]'

echo "Setting CORS..."

aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "{
  \"CORSRules\": [
    {
      \"AllowedHeaders\": [\"*\"],
      \"AllowedMethods\": [\"GET\", \"PUT\", \"HEAD\"],
      \"AllowedOrigins\": [
        \"$WEB_ORIGIN\",
        \"https://d36rrgq6wyjuf8.cloudfront.net\",
        \"http://localhost:5173\",
        \"http://localhost:3000\"
      ]
    }
  ]
}"

echo "Done. CORS is set on $BUCKET"
