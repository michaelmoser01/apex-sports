#!/bin/bash
# Diagnostic: dump availability_rules + slot info for a single coach to debug
# the admin availability-activity chart. Connects to Aurora the same way
# migrate-aurora.sh does.
#
# Usage: ./scripts/debug-coach-availability.sh <coach_profile_id> [stage]
# Example: ./scripts/debug-coach-availability.sh 0a3c8e9d-... prod
#
# Writes NDJSON to .cursor/debug-09093f.log so the agent can read it.

set -e

COACH_ID="$1"
STAGE="${2:-prod}"

if [ -z "$COACH_ID" ]; then
  echo "Usage: $0 <coach_profile_id> [stage]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$ROOT_DIR/.cursor/debug-09093f.log"

if ! command -v aws >/dev/null 2>&1; then
  echo "Error: aws CLI is required." >&2; exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required." >&2; exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql is required (brew install libpq && brew link --force libpq)." >&2; exit 1
fi

CLUSTER_ARN=$(aws rds describe-db-clusters \
  --query "DBClusters[?contains(DBClusterIdentifier, 'apex-sports') || contains(DBClusterIdentifier, 'apexsports')].DBClusterArn" \
  --output text | head -1)

if [ -z "$CLUSTER_ARN" ] || [ "$CLUSTER_ARN" == "None" ]; then
  echo "Could not find Aurora cluster." >&2; exit 1
fi

CLUSTER_ID=$(echo "$CLUSTER_ARN" | sed 's|.*:||')
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
  echo "Could not find DB secret." >&2; exit 1
fi

SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" --query SecretString --output text)
USERNAME=$(echo "$SECRET_JSON" | jq -r '.username // "postgres"')
PASSWORD=$(echo "$SECRET_JSON" | jq -r '.password')
DB_NAME=$(echo "$SECRET_JSON" | jq -r '.dbname // "apexsports"')

export PGPASSWORD="$PASSWORD"

echo "Connecting to $ENDPOINT as $USERNAME (db: $DB_NAME)..."

# Single JSON-emitting query so we can append it as one NDJSON line.
RESULT=$(psql -h "$ENDPOINT" -U "$USERNAME" -d "$DB_NAME" -p 5432 -t -A -c "
WITH
coach AS (
  SELECT id, display_name FROM coach_profiles WHERE id = '$COACH_ID'
),
rules AS (
  SELECT id, coach_id, created_at, first_start_time,
         (created_at >= NOW() - INTERVAL '90 days') AS in_window,
         (created_at > NOW()) AS in_future,
         (SELECT COUNT(*) FROM availability_slots s WHERE s.rule_id = r.id) AS slot_count
  FROM availability_rules r WHERE coach_id = '$COACH_ID'
),
slot_summary AS (
  SELECT COUNT(*) AS total,
         COUNT(*) FILTER (WHERE rule_id IS NOT NULL) AS with_rule,
         COUNT(*) FILTER (WHERE rule_id IS NULL) AS without_rule,
         COUNT(*) FILTER (WHERE start_time > NOW()) AS future_slots
  FROM availability_slots WHERE coach_id = '$COACH_ID'
),
chart_query AS (
  SELECT date_trunc('day', LEAST(r.created_at, NOW())) AS day,
         COUNT(DISTINCT r.id) AS rules,
         COUNT(s.id) AS slots
  FROM availability_rules r
  LEFT JOIN availability_slots s ON s.rule_id = r.id
  WHERE r.coach_id = '$COACH_ID'
    AND r.created_at >= NOW() - INTERVAL '90 days'
  GROUP BY 1 ORDER BY 1
),
migrations AS (
  SELECT migration_name, finished_at FROM _prisma_migrations
  WHERE migration_name LIKE '%availability_rule%' ORDER BY started_at
)
SELECT json_build_object(
  'coach', (SELECT row_to_json(coach.*) FROM coach),
  'dbNow', NOW(),
  'rules', COALESCE((SELECT json_agg(rules.*) FROM rules), '[]'::json),
  'slotSummary', (SELECT row_to_json(slot_summary.*) FROM slot_summary),
  'chartQueryResult', COALESCE((SELECT json_agg(chart_query.*) FROM chart_query), '[]'::json),
  'migrations', COALESCE((SELECT json_agg(migrations.*) FROM migrations), '[]'::json)
)::text;
")

if [ -z "$RESULT" ]; then
  echo "Empty result from DB" >&2; exit 2
fi

mkdir -p "$(dirname "$LOG_FILE")"
TIMESTAMP=$(node -e "console.log(Date.now())")

# Emit NDJSON with the same shape the agent's HTTP forwarder would have used.
printf '%s\n' "$(jq -c --arg ts "$TIMESTAMP" --argjson data "$RESULT" '{
  sessionId: "09093f",
  runId: "initial",
  hypothesisId: "H1-H5",
  location: "debug-coach-availability.sh",
  message: "direct DB diagnostic for coach",
  timestamp: ($ts | tonumber),
  data: $data
}' <<< '{}')" >> "$LOG_FILE"

echo "Wrote diagnostic to $LOG_FILE"
echo "--- result preview ---"
echo "$RESULT" | jq '.'
