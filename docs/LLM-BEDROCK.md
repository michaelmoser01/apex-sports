# Coach bio interview (Bedrock LLM)

The coach onboarding flow can use Amazon Bedrock to help coaches write their "About my coaching style and background" paragraph via a short interview.

## Configuration

- **BEDROCK_MODEL_ID** (default: `us.anthropic.claude-haiku-4-5-20251001-v1:0`) – Bedrock **inference profile** ID used for the bio draft (and coach agent / recap). Newer Claude models must use a profile ID (e.g. `us.…`), not the raw foundation-model ID. Must be **ACTIVE** and enabled in [Bedrock Model access](https://console.aws.amazon.com/bedrock/home#/modelaccess). Set in the API Lambda environment (see `serverless.yml` under `functions.api.environment`).
- **BEDROCK_REGION** (default: `us-east-1`) – AWS region for Bedrock. Must match where the model is available.

**If you see "model identifier is invalid" or "Legacy"**: Enable an active model in Bedrock Model access. Older foundation-model IDs (e.g. `anthropic.claude-3-haiku-20240307-v1:0`) are LEGACY.

**If you see "on-demand throughput isn't supported"**: Use the **inference profile** ID, not the foundation-model ID — e.g. `us.anthropic.claude-haiku-4-5-20251001-v1:0` (list profiles: `aws bedrock list-inference-profiles --region us-east-1`).

To use a different model when deploying:
```bash
BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-20250514-v1:0 serverless deploy
```

Or edit `serverless.yml` and set `BEDROCK_MODEL_ID` / `BEDROCK_REGION` under `functions.api.environment`.

## IAM

The API Lambda has `bedrock:InvokeModel` on foundation models and `inference-profile/*` in the deploy region. Ensure the profile is available in the same account/region and that the Lambda execution role can reach Bedrock (e.g. if the Lambda is in a VPC, it needs a route to Bedrock or a VPC endpoint for Bedrock).

## API

- **POST /coaches/me/bio-draft** (auth required)  
  Body: `{ messages: [{ role: "user"|"assistant", content: string }], currentBioPreview?: string }`  
  Returns: `{ message: string, bioPreview: string }`

If Bedrock is not configured (missing `BEDROCK_MODEL_ID`), the endpoint returns 503.
