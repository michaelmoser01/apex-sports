# Setup Guide

## Prerequisites

- **Node.js** ✓ (you have this)
- **Postgres** – choose one option below

## Option A: Docker (recommended)

1. Install [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)
2. Open Docker Desktop and wait for it to start
3. Run:
   ```bash
   ./scripts/setup-and-run.sh
   ```

## Option B: Free cloud Postgres (no Docker needed)

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project (choose a region close to you)
3. Copy the connection string (looks like `postgresql://user:pass@host/db?sslmode=require`)
4. Run:
   ```bash
   DATABASE_URL='your-connection-string-here' ./scripts/setup-and-run.sh
   ```

## Option C: Manual steps

If the script doesn't work, run these in order:

```bash
# 1. Install deps
npm install

# 2. Build shared package
cd packages/shared && npm run build && cd ../..

# 3. Start Postgres (Docker) or set DATABASE_URL (cloud)

# 4. Push schema
cd apps/api && DATABASE_URL="postgresql://..." npx prisma db push && cd ../..

# 5. Start API (terminal 1)
cd apps/api && DATABASE_URL="postgresql://..." npm run dev

# 6. Start web (terminal 2)
cd apps/web && npm run dev
```

Then open http://localhost:5173. Use "Sign in" and select "Demo Coach" or "Demo Athlete" from the dropdown (no Cognito needed for local dev).
