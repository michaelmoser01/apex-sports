#!/usr/bin/env bash
# One-time deploy to remove Lambda@Edge (OG handler) from the stack while retaining
# the physical function so CloudFormation does not try to delete it (which fails for
# replicated Lambda@Edge). Run this instead of `npm run deploy` after removing the
# ogHandler from serverless.yml.
#
# Usage: ./scripts/deploy-retain-og-handler.sh [stage]
# Example: ./scripts/deploy-retain-og-handler.sh    # uses dev
#          ./scripts/deploy-retain-og-handler.sh production
#
# After this succeeds, you can use `npm run deploy` again. The retained Lambda
# (apex-sports-<stage>-ogHandler) can be deleted manually in the AWS Console later
# if desired, after CloudFront has stopped using it.

set -e
STAGE="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

STACK_NAME="apex-sports-${STAGE}"
TEMPLATE_FILE=".serverless/cloudformation-template-update-stack.json"

# Wait for stack to be updateable (e.g. after UPDATE_COMPLETE_CLEANUP_IN_PROGRESS or rollback)
echo "Checking stack $STACK_NAME status..."
while true; do
  STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "MISSING")
  case "$STATUS" in
    CREATE_COMPLETE|UPDATE_COMPLETE|UPDATE_ROLLBACK_COMPLETE|ROLLBACK_COMPLETE)
      echo "Stack is ready ($STATUS). Proceeding."
      break
      ;;
    *IN_PROGRESS*)
      echo "Stack is in $STATUS. Waiting 30s..."
      sleep 30
      ;;
    *)
      echo "Unexpected stack status: $STATUS" >&2
      exit 1
      ;;
  esac
done

echo "Packaging (stage=$STAGE)..."
npx serverless package --stage "$STAGE"

if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "Error: $TEMPLATE_FILE not found. Run from project root." >&2
  exit 1
fi

echo "Updating stack $STACK_NAME and retaining OgHandlerLambdaFunction (no physical delete)..."
aws cloudformation update-stack \
  --stack-name "$STACK_NAME" \
  --template-body "file://$TEMPLATE_FILE" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --retain-resources OgHandlerLambdaFunction

echo "Waiting for stack update to complete..."
aws cloudformation wait stack-update-complete --stack-name "$STACK_NAME"

echo "Done. Stack updated; OgHandlerLambdaFunction was retained (not deleted)."
echo "You can delete the function apex-sports-${STAGE}-ogHandler manually in Lambda (us-east-1) later if you want."
