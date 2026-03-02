# Coach bio interview (Bedrock LLM)

The coach onboarding flow can use Amazon Bedrock to help coaches write their "About my coaching style and background" paragraph via a short interview.

## Configuration

- **BEDROCK_MODEL_ID** (default: `anthropic.claude-3-haiku-20240307-v1:0`) – Foundation model ID used for the bio draft. Must be a model you have **enabled** in the Bedrock console (Model access). Set in the API Lambda environment (see `serverless.yml` under `functions.api.environment`).
- **BEDROCK_REGION** (default: `us-east-1`) – AWS region for Bedrock. Must match where the model is available.

**If you see "The provided model identifier is invalid"**: Enable the model in [Bedrock → Model access](https://console.aws.amazon.com/bedrock/home#/modelaccess) and ensure the ID matches AWS docs (e.g. [model IDs](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html)). Examples: `anthropic.claude-3-haiku-20240307-v1:0`, `anthropic.claude-3-5-haiku-20241022-v1:0`, `anthropic.claude-sonnet-4-20250514-v1:0`.

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
