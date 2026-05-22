# Coach bio interview (Bedrock LLM)

The coach onboarding flow can use Amazon Bedrock to help coaches write their "About my coaching style and background" paragraph via a short interview.

## Configuration

- **BEDROCK_MODEL_ID** (default: `anthropic.claude-haiku-4-5-20251001-v1:0`) – Foundation model ID used for the bio draft. Must be an **ACTIVE** model enabled in the Bedrock console (Model access). Set in the API Lambda environment (see `serverless.yml` under `functions.api.environment`).
- **BEDROCK_REGION** (default: `us-east-1`) – AWS region for Bedrock. Must match where the model is available.

**If you see "model identifier is invalid" or "Legacy"**: Enable an active model in [Bedrock → Model access](https://console.aws.amazon.com/bedrock/home#/modelaccess). Older IDs (e.g. `anthropic.claude-3-haiku-20240307-v1:0`) are marked LEGACY and may be denied. Use an ACTIVE model such as `anthropic.claude-haiku-4-5-20251001-v1:0` or `anthropic.claude-sonnet-4-20250514-v1:0`.

To use a different model when deploying:
```bash
BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-20250514-v1:0 serverless deploy
```

Or edit `serverless.yml` and set `BEDROCK_MODEL_ID` / `BEDROCK_REGION` under `functions.api.environment`.

## IAM

The API Lambda has `bedrock:InvokeModel` on `arn:aws:bedrock:${AWS::Region}:*:foundation-model/*`. Ensure the model you use is available in the same account/region and that the Lambda execution role can reach Bedrock (e.g. if the Lambda is in a VPC, it needs a route to Bedrock or a VPC endpoint for Bedrock).

## API

- **POST /coaches/me/bio-draft** (auth required)  
  Body: `{ messages: [{ role: "user"|"assistant", content: string }], currentBioPreview?: string }`  
  Returns: `{ message: string, bioPreview: string }`

If Bedrock is not configured (missing `BEDROCK_MODEL_ID`), the endpoint returns 503.
