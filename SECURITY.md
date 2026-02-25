# Security

## Secrets

### Production

- **Aurora database**: SST generates a random password and stores it in AWS Secrets Manager. The Lambda receives `DATABASE_URL` at deploy time—no passwords in source code.
- **Cognito**: User Pool ID and Client ID are public identifiers, required in the frontend for auth. Safe to include in the build.
- **Lambda env vars**: AWS encrypts environment variables at rest.

### Local Development

- Use `.env` for local config (gitignored). Copy from `.env.example` and fill in.
- Dev database password: set `DEV_DB_PASSWORD` if you want to override the default (or use `process.env.DEV_DB_PASSWORD` in the SST dev config when we add that).

### What Never Goes in Code

- Real database passwords
- API keys (Stripe, SendGrid, etc.)
- OAuth client secrets
- Any `.env` file with real values (only `.env.example` with placeholders is committed)

---

## Future API Keys and Third-Party Secrets

When adding Stripe, SendGrid, or similar services:

1. Create an SST Secret in `sst.config.ts`:
   ```ts
   const stripeKey = new sst.Secret("StripeSecretKey");
   ```

2. Link it to your API function and add to `environment`:
   ```ts
   link: [database, stripeKey],
   environment: {
     STRIPE_SECRET_KEY: stripeKey.value,
     // ...
   },
   ```

3. Set the value via CLI (per stage):
   ```bash
   sst secret set StripeSecretKey sk_live_xxx --stage production
   ```

Values are stored in AWS SSM Parameter Store (SecureString), not in code.
