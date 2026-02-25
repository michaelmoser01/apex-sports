# GitHub setup and production deploy on merge to main

This project uses **GitHub Actions** to deploy to **production** when a pull request is merged into `main`.

## 1. Get the project on GitHub

If the project is not yet in Git:

```bash
cd /path/to/ApexSports
git init
git add .
git commit -m "Initial commit"
```

Create a new repository on GitHub (e.g. **apex-sports**), then add the remote and push:

```bash
git remote add origin https://github.com/michaelmoser01/apex-sports.git
git branch -M main
git push -u origin main
```

(Use the GitHub repo URL from the “Create repository” page; HTTPS is fine too.)

## 2. GitHub Actions secrets (required for deploy)

In GitHub: **Settings → Secrets and variables → Actions**. Add **Repository secrets**:

| Secret name | Value |
|-------------|--------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key for deployment |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key |
| `AWS_DEFAULT_REGION` | `us-east-1` (or your region) — optional; defaults to `us-east-1` in the workflow |

Use an IAM user (or OIDC with GitHub’s AWS integration) that can deploy the Serverless stack, read Secrets Manager, and run the web deploy script (S3, CloudFormation describe).

## 3. Workflow behavior

- **Build** (every push and on pull requests): runs `npm ci` and `npm run build` so only code that builds can be merged.
- **Deploy production** (only on push to `main` after a merge): runs `serverless deploy --stage prod`, then `env-from-stack.sh prod` (writes `.env` from stack outputs), then `deploy-web.sh prod` (builds web with that `.env` + Stripe key from Secrets Manager, uploads to S3, invalidates CloudFront).

So: **merge a PR into `main` → production deploy runs automatically.**

## 4. Branch and PR flow

1. Do work on a branch (e.g. `feature/xyz` or `fix/abc`).
2. Open a **Pull request** into `main`.
3. The **Build** job runs. Fix any failures before merging.
4. Merge the PR → the workflow runs again on `main` and the **Deploy production** job runs.
5. Check the **Actions** tab; when the deploy job succeeds, prod is updated.

You can protect `main` (Settings → Branches → Add rule) so that only PRs (no direct push) are allowed, if you want.

## 5. First-time production setup

Before the first successful prod deploy from CI:

1. **Deploy prod stack once** (if not already done), so the stack and Secrets Manager secret exist:
   ```bash
   npx serverless deploy --stage prod
   ```
2. **Stripe (prod):** In AWS Secrets Manager, edit `apex-sports-prod-stripe-keys` and set prod Stripe keys (and `STRIPE_PUBLISHABLE_KEY` for the web build). See [STRIPE-DEPLOY.md](STRIPE-DEPLOY.md).
3. **Cognito / API:** The stack creates the User Pool and API. After the first deploy, `env-from-stack.sh prod` in CI will read the API URL and Cognito IDs from the stack and write `.env` for the web build, so the built app points to prod.
4. **Custom domain (optional):** If you use a prod domain (e.g. `prod.getapexsports.com`), configure it in the Serverless/custom domain config. You can set the **production** environment URL in GitHub (Settings → Environments → production) so it appears in the deploy summary.

## 6. Deploying only dev (manual)

CI is wired for **main → prod**. To deploy **dev** from your machine:

```bash
npx serverless deploy --stage dev
./scripts/env-from-stack.sh dev
./scripts/deploy-web.sh dev
```

Use your own AWS credentials and local `.env` as needed.
