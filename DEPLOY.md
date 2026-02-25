# Deploy to AWS (Serverless Framework)

This guide covers deploying ApexSports with the **Serverless Framework**. Deployments create **CloudFormation stacks** in your AWS account (visible in AWS Console → CloudFormation).

## Prerequisites

- **AWS CLI** installed and configured (`aws configure`)
- **Node.js 20+** and npm

## 1. Deploy

From the project root:

```bash
npm install
npm run deploy
```

Or with a specific stage:

```bash
npx serverless deploy --stage production
```

This runs `prisma generate` and `serverless deploy`, which provisions a **single CloudFormation stack** with:

- VPC (public/private subnets, NAT gateway)
- Aurora Serverless v2 PostgreSQL
- **Database migrations** (run automatically by a Lambda Custom Resource after Aurora is ready)
- Cognito User Pool and app client
- Lambda (Express API) behind API Gateway HTTP API
- S3 bucket + CloudFront for the React frontend

**First deploy** can take 10–15 minutes (Aurora and VPC take the longest). At the end you'll see stack outputs:

```
ApiUrl: https://xxxx.execute-api.us-east-1.amazonaws.com
WebUrl: https://xxxx.cloudfront.net
UserPoolId: ...
UserPoolClientId: ...
```

## 2. Build and deploy the frontend (first time and after changes)

The web app needs the API URL and Cognito IDs at **build time**. After the first backend deploy, do this **once** so you don’t have to copy env vars by hand:

1. **Create `.env` from your stack** (requires AWS CLI):

   ```bash
   ./scripts/env-from-stack.sh dev
   ```

   This reads your stack outputs and writes `.env` with `VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`, and `VITE_COGNITO_CLIENT_ID`. Use a different stage if needed: `./scripts/env-from-stack.sh production`.

2. **Build and deploy the web app:**

   ```bash
   npm run deploy:web
   ```

   Or with a specific stage: `./scripts/deploy-web.sh production`

   The deploy script loads `.env` automatically, so future runs of `deploy:web` will use the same API and Cognito config. **Important:** `npm run deploy` does *not* build or upload the frontend; use `deploy:web` after any UI changes.

**If you already uploaded but still see old content (cache):**

- Run **invalidation only**: `npm run deploy:invalidate` or `./scripts/invalidate-cloudfront.sh dev`
- Or hard-refresh the page (e.g. Ctrl+Shift+R / Cmd+Shift+R) and wait 1–2 minutes for CloudFront to update.

## 3. Database migrations

**Migrations run automatically** during deploy. A Lambda (in the same VPC as the API) is invoked by CloudFormation after Aurora is ready and applies any pending Prisma migrations.

**When you add a new Prisma migration** (e.g. `npx prisma migrate dev`), you must bump `custom.migrationsVersion` in `serverless.yml` (e.g. from `"2"` to `"3"`) so CloudFormation re-invokes the migrate Lambda on the next deploy. Otherwise the Custom Resource only runs on initial stack create, and new migrations (like `coach_photos`) would never be applied.

If you need to run migrations manually (e.g. from a machine that can reach the VPC, or to fix a failed deploy):

```bash
./scripts/migrate-aurora.sh dev
```

Or with a connection string:

```bash
cd apps/api && DATABASE_URL="postgresql://postgres:<password>@<endpoint>:5432/apexsports" npx prisma migrate deploy
```

Get the endpoint from AWS Console → RDS → your cluster; get the password from Secrets Manager → `apex-sports-<stage>-db-password`.

## 4. Configure Cognito callback URLs

1. AWS Console → Cognito → User pools → your pool
2. App integration → App client
3. Add **Allowed callback URLs**: `https://<your-cloudfront-domain>/`, `https://<your-cloudfront-domain>/auth/callback`
4. Add **Allowed sign-out URLs**: `https://<your-cloudfront-domain>/`

## 5. Seed demo users (optional)

Deploy does **not** run the seed; migrations only create tables. To get dev users (coach@test.com, athlete@test.com) and the demo coach profile on the deployed DB:

```bash
./scripts/seed-aurora.sh dev
```

Requires AWS CLI and jq. The script reads the DB password from Secrets Manager and runs the Prisma seed. Or with a connection string: `cd apps/api && DATABASE_URL="postgresql://..." npm run db:seed`.

## 6. Seed marketplace coaches (optional)

To populate the deployed app’s “Find a Coach” listing with many coaches (random names, sports, cities, bios, and placeholder photos):

```bash
aws lambda invoke --function-name apex-sports-dev-seed --payload '{"count":25}' out.json && cat out.json
```

- Replace `apex-sports-dev-seed` with `apex-sports-<stage>-seed` for your stage (e.g. `apex-sports-production-seed`).
- `count` is optional; default is 25, max 200. Example: `{"count":50}`.

Response: `{"seeded":25,"slotsAdded":25,"ok":true}`.

For **local** dev (DB reachable from your machine), use: `cd apps/api && DATABASE_URL="postgresql://..." pnpm run seed:marketplace 30`.

## Summary

| Step | Command |
|------|--------|
| Deploy stack | `npm run deploy` or `npx serverless deploy --stage <stage>` (migrations run automatically) |
| Deploy frontend (after first deploy or UI changes) | `npm run deploy:web` (builds, uploads, invalidates CloudFront). Invalidate only: `npm run deploy:invalidate` |
| Seed demo users (dev login) | `./scripts/seed-aurora.sh <stage>` — run after deploy if you use dev auth |
| Seed marketplace coaches | `aws lambda invoke --function-name apex-sports-<stage>-seed --payload '{"count":25}' out.json` (runs in VPC) |
| Migrate DB (optional, if needed) | `./scripts/migrate-aurora.sh <stage>` or `DATABASE_URL="..." npx prisma migrate deploy` from `apps/api` |
| Configure Cognito | Add production URLs in console |

## Stacks in AWS Console

After deploy, open **AWS Console → CloudFormation**. You’ll see a stack named **apex-sports-&lt;stage&gt;** (e.g. `apex-sports-dev`). You can view all resources there and delete the stack to tear everything down.

## Tear down

To remove all resources for a stage:

```bash
npx serverless remove --stage dev
```

This deletes the CloudFormation stack and all resources in it.
