#!/bin/bash
# Run Prisma migrations against the Aurora database (Serverless or SST).
# Usage: ./scripts/migrate-aurora.sh [stage]
# Requires: aws CLI, jq
# Stage defaults to "dev" if not specified.

set -e

STAGE="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v aws >/dev/null 2>&1; then
  echo "Error: aws CLI is required. Install it and run 'aws configure'." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required. Install with: brew install jq" >&2
  exit 1
fi

echo "Finding Aurora cluster for stage: $STAGE..."

# List RDS clusters and find one that matches our app (first match)
# For multiple stages, ensure only one apex-sports cluster exists or modify the query.
CLUSTER_ARN=$(aws rds describe-db-clusters \
  --query "DBClusters[?contains(DBClusterIdentifier, 'apex-sports') || contains(DBClusterIdentifier, 'apexsports')].DBClusterArn" \
  --output text | head -1)

if [ -z "$CLUSTER_ARN" ] || [ "$CLUSTER_ARN" == "None" ]; then
  echo "Could not find Aurora cluster. Try specifying the cluster manually:" >&2
  echo "  DATABASE_URL='postgresql://user:pass@endpoint:5432/apexsports' npm run db:migrate" >&2
  echo "" >&2
  echo "Get the endpoint from AWS Console -> RDS -> Databases" >&2
  echo "Get the password from AWS Console -> Secrets Manager" >&2
  exit 1
fi

CLUSTER_ID=$(aws rds describe-db-clusters \
  --db-cluster-identifier "$(echo "$CLUSTER_ARN" | sed 's|.*:||')" \
  --query "DBClusters[0].DBClusterIdentifier" --output text)

ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier "$CLUSTER_ID" \
  --query "DBClusters[0].Endpoint" --output text)

# Try RDS-managed secret first, then Serverless-style secret (apex-sports-<stage>-db-password)
SECRET_ARN=$(aws rds describe-db-clusters \
  --db-cluster-identifier "$CLUSTER_ID" \
  --query "DBClusters[0].MasterUserSecret.SecretArn" --output text 2>/dev/null || true)

if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" == "None" ]; then
  SECRET_NAME="apex-sports-${STAGE}-db-password"
  SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --query ARN --output text 2>/dev/null || true)
fi

if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" == "None" ]; then
  echo "Could not find secret. Get the password from Secrets Manager (e.g. apex-sports-${STAGE}-db-password)." >&2
  exit 1
fi

SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)
USERNAME=$(echo "$SECRET_JSON" | jq -r '.username // "postgres"')
PASSWORD=$(echo "$SECRET_JSON" | jq -r '.password')
DB_NAME=$(echo "$SECRET_JSON" | jq -r '.dbname // "apexsports"')

# URL-encode password in case it contains special chars
PASSWORD_ENCODED=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$PASSWORD")

export DATABASE_URL="postgresql://${USERNAME}:${PASSWORD_ENCODED}@${ENDPOINT}:5432/${DB_NAME}"

echo "Running migrations..."
cd "$ROOT_DIR/apps/api" && npx prisma migrate deploy

echo "Done."
