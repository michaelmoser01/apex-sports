# Stripe: Safe deploy and webhook URL

## 1. Rotate your secret key (if it was ever exposed)

In [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/apikeys), roll the **Secret key**. Use the new key below; never commit it or paste it in chat.

---

## 2. Stripe secret (IaC per stage; paste values in console)

The API loads Stripe keys at **runtime** from AWS Secrets Manager. The secret is **created by the stack** per stage so the Lambda ARN is automatic.

**Deploy (no Stripe env vars needed):**

```bash
npx serverless deploy --stage dev
```

For prod later:

```bash
npx serverless deploy --stage prod
```

Each stage gets its own secret: `apex-sports-dev-stripe-keys`, `apex-sports-prod-stripe-keys`. The Lambda receives the correct ARN from the stack.

**Dev vs prod:** Use **test mode** keys for dev (no real charges; test cards) and **live** keys for prod. See [ENVIRONMENTS.md](ENVIRONMENTS.md).

**After deploy: set the key values in the console**

1. AWS Console → **Secrets Manager** (same region as the stack, e.g. `us-east-1`).
2. Open the secret **`apex-sports-<stage>-stripe-keys`** (e.g. `apex-sports-dev-stripe-keys` for dev, `apex-sports-prod-stripe-keys` for prod).
3. **Retrieve secret value** → **Edit**.
4. Replace the placeholder with JSON (plaintext). For **dev** use test keys; for **prod** use live keys:

   **Dev (test mode):**
   ```json
   {"STRIPE_SECRET_KEY":"sk_test_...","STRIPE_WEBHOOK_SECRET":"whsec_...","STRIPE_PUBLISHABLE_KEY":"pk_test_..."}
   ```

   **Prod (live):**
   ```json
   {"STRIPE_SECRET_KEY":"sk_live_...","STRIPE_WEBHOOK_SECRET":"whsec_...","STRIPE_PUBLISHABLE_KEY":"pk_live_..."}
   ```

   - **STRIPE_SECRET_KEY** / **STRIPE_PUBLISHABLE_KEY:** from [Stripe Dashboard → API keys](https://dashboard.stripe.com/apikeys). Toggle **Test mode** (dev) or **Live** (prod) in the dashboard to get the right set.
   - **STRIPE_WEBHOOK_SECRET:** from the webhook you create in section 4 (create one webhook in test mode for dev, one in live for prod).

5. Save. The next Lambda cold start will load the new values.

- **Platform fee** is **10%** in `serverless.yml` (`STRIPE_PLATFORM_FEE_PERCENT`). Change there if needed.
- For **local** dev, use `.env` with `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (no `STRIPE_SECRET_ARN`).

---

## 3. Webhook URL (domain: dev.getapexsports.com)

Your **web app** is at `https://dev.getapexsports.com`. The **API** is on API Gateway, not that domain, unless you add a custom API domain.

After deploy, get the API URL from the stack:

```bash
npx serverless info --stage dev
```

Look for **ApiUrl** (or the HTTP API endpoint in the stack Outputs). It will look like:

```text
https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com
```

With stage `dev`, the path often includes the stage. Use:

- **If the API base has no stage in the path:**  
  `https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/webhooks/stripe`

- **If the API base is `.../dev` (stage in path):**  
  `https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com/dev/webhooks/stripe`

So the **webhook URL** is one of:

```text
https://<your-api-id>.execute-api.us-east-1.amazonaws.com/webhooks/stripe
```
or
```text
https://<your-api-id>.execute-api.us-east-1.amazonaws.com/dev/webhooks/stripe
```

Replace `<your-api-id>` with the real ID from `serverless info` / CloudFormation Outputs.

If you later put the API on a custom domain (e.g. `api.dev.getapexsports.com`), the webhook URL would be:

```text
https://api.dev.getapexsports.com/webhooks/stripe
```
(or `.../dev/webhooks/stripe` if the stage is in the path).

---

## 4. Stripe Dashboard: create the webhook

Create one webhook **per environment** (test for dev, live for prod), each pointing at that stage’s API URL.

1. [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks) → **Add endpoint**.
2. **Endpoint URL:** Use the API URL for the stage you’re configuring (section 3). For dev use your dev API URL; for prod use your prod API URL. Try without `/dev` or `/prod` first; if Stripe gets 404, add the stage path.
3. **Events to send:**  
   `payment_intent.succeeded`, `payment_intent.amount_capturable_updated`, `payment_intent.payment_failed`, `payment_intent.canceled`.
4. After creating, open the webhook and copy the **Signing secret** (`whsec_...`). Put it in the AWS secret **for that stage** (`apex-sports-dev-stripe-keys` or `apex-sports-prod-stripe-keys`) as `STRIPE_WEBHOOK_SECRET` (section 2).

For **prod**, switch Stripe Dashboard to **Live** and create a separate webhook with your prod API URL; put that signing secret in `apex-sports-prod-stripe-keys`.

---

## 5. Frontend (publishable key) – same secret as API keys

The **publishable key** lives in the **same** Secrets Manager secret as the API keys: `apex-sports-<stage>-stripe-keys`. Add a third key to the JSON when you edit the secret in the console.

**In the secret value (JSON), include all three keys:**

```json
{"STRIPE_SECRET_KEY":"sk_test_...","STRIPE_WEBHOOK_SECRET":"whsec_...","STRIPE_PUBLISHABLE_KEY":"pk_test_..."}
```

- **STRIPE_PUBLISHABLE_KEY:** from [Stripe Dashboard → API keys](https://dashboard.stripe.com/apikeys) (Publishable key). Needed so the web build can show the payment form on the athlete booking page.

**Build and deploy the web app:**

When you run the web deploy script, it reads this secret and uses `STRIPE_PUBLISHABLE_KEY` for the build:

```bash
./scripts/deploy-web.sh dev
```

(Or `./scripts/deploy-web.sh prod` for prod.) Your AWS credentials must have permission to get the secret value. If `STRIPE_PUBLISHABLE_KEY` is missing or empty in the secret, the build runs but the athlete booking flow won’t show the Stripe card form until you add it and redeploy.

---

## 6. Test mode: platform balance for transfers

When a coach marks a session **complete**, the API **captures** the payment and **transfers** (minus platform fee) to the coach's Connect account. The transfer uses your **platform's available balance** in Stripe.

In **test mode**, a new account often has **zero available balance**. If you see "Payment capture failed" with a `balance_insufficient` error in the API logs:

1. In [Stripe Dashboard → Balance](https://dashboard.stripe.com/test/balance), check **Available**.
2. To add test balance, create a one-off charge using the special test card **4000 0000 0000 0077** (see [Stripe: Testing – Available balance](https://stripe.com/docs/testing#available-balance)). After that, captures and transfers to Connect accounts will succeed.
