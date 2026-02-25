#!/usr/bin/env bash
# Run Prisma seed against the deployed Aurora database (creates demo coach & athlete).
# Usage: ./scripts/seed-aurora.sh [stage]
# Requires: aws CLI, jq. Stage defaults to "dev".

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

CLUSTER_ARN=$(aws rds describe-db-clusters \
  --query "DBClusters[?contains(DBClusterIdentifier, 'apex-sports') || contains(DBClusterIdentifier, 'apexsports')].DBClusterArn" \
  --output text | head -1)

if [ -z "$CLUSTER_ARN" ] || [ "$CLUSTER_ARN" == "None" ]; then
  echo "Could not find Aurora cluster. Get endpoint and password from AWS Console (RDS + Secrets Manager)." >&2
  exit 1
fi

CLUSTER_ID=$(aws rds describe-db-clusters \
  --db-cluster-identifier "$(echo "$CLUSTER_ARN" | sed 's|.*:||')" \
  --query "DBClusters[0].DBClusterIdentifier" --output text)

ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier "$CLUSTER_ID" \
  --query "DBClusters[0].Endpoint" --output text)

SECRET_ARN=$(aws rds describe-db-clusters \
  --db-cluster-identifier "$CLUSTER_ID" \
  --query "DBClusters[0].MasterUserSecret.SecretArn" --output text 2>/dev/null || true)

if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" == "None" ]; then
  SECRET_NAME="apex-sports-${STAGE}-db-password"
  SECRET_ARN=$(aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --query ARN --output text 2>/dev/null || true)
fi

if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" == "None" ]; then
  echo "Could not find secret (e.g. apex-sports-${STAGE}-db-password)." >&2
  exit 1
fi

SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)
USERNAME=$(echo "$SECRET_JSON" | jq -r '.username // "postgres"')
PASSWORD=$(echo "$SECRET_JSON" | jq -r '.password')
DB_NAME=$(echo "$SECRET_JSON" | jq -r '.dbname // "apexsports"')
PASSWORD_ENCODED=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$PASSWORD")

export DATABASE_URL="postgresql://${USERNAME}:${PASSWORD_ENCODED}@${ENDPOINT}:5432/${DB_NAME}"

echo "Running seed..."
cd "$ROOT_DIR/apps/api" && npx prisma db seed

echo "Done. Dev users: coach@test.com, athlete@test.com"
