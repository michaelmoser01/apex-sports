# Dev vs prod: separate Cognito and Stripe

The stack is **fully per-stage**: each deployment (e.g. `--stage dev` and `--stage prod`) gets its own Cognito, Stripe secret, database, and other resources. Nothing is shared between dev and prod.

## Cognito (separate per stage)

- **User Pool:** `apex-sports-<stage>-pool` (e.g. `apex-sports-dev-pool`, `apex-sports-prod-pool`).
- **App client:** `apex-sports-<stage>-web-client`.

So dev and prod have **separate user pools and clients**. Users in dev do not exist in prod, and the web app for each stage is configured (via `env-from-stack.sh`) to use that stage’s User Pool ID and Client ID.

No extra IaC is required; this is already in place in `serverless.yml`.

## Stripe (separate per stage; dev = test mode, prod = live)

- **Secret:** `apex-sports-<stage>-stripe-keys` (e.g. `apex-sports-dev-stripe-keys`, `apex-sports-prod-stripe-keys`).
- Each stage has its own secret in AWS Secrets Manager. You set different keys per stage.

**Recommended setup:**

| Stage | Stripe keys | Use case |
|-------|-------------|----------|
| **dev** | **Test mode** (`sk_test_...`, `pk_test_...`, test webhook `whsec_...`) | Safe testing; no real charges; use Stripe test cards. |
| **prod** | **Live mode** (`sk_live_...`, `pk_live_...`, live webhook `whsec_...`) | Real payments. |

You can use:

- **One Stripe account:** dev secret = test keys, prod secret = live keys (same Stripe account, different key sets).
- **Two Stripe accounts:** one account for dev (test mode) and one for prod (live), each with its own keys in the corresponding secret.

For each stage you still need to create a **webhook** in the Stripe Dashboard (test or live) and put that webhook’s signing secret into the same stage’s secret. See [STRIPE-DEPLOY.md](STRIPE-DEPLOY.md).

## Summary

- **Cognito:** Already separate per stage in the IaC; no change needed.
- **Stripe:** Already separate secrets per stage; configure dev with test keys and prod with live keys (and separate webhooks) so dev stays in test mode and prod is live.
