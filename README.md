# ApexSports

A two-sided marketplace connecting athletes with verified coaches.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, AWS Amplify (Cognito)
- **API**: Node 20, Express, TypeScript, Prisma
- **Database**: PostgreSQL (Aurora Serverless in production, local for dev)
- **Auth**: AWS Cognito
- **Infrastructure**: Serverless Framework (CloudFormation on AWS)

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- Docker (for local Postgres)
- AWS CLI configured (for deploy)

### One-command setup

From the project root:

```bash
./scripts/setup-and-run.sh
```

This installs deps, starts Postgres (if needed), pushes the DB schema, and runs both API and web. Open http://localhost:5173

### Manual setup

#### 1. Install dependencies

```bash
npm install
```

#### 2. Start local Postgres

```bash
docker run --rm -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=apexsports \
  postgres:16.4
```

#### 3. Run database schema

```bash
DATABASE_URL="postgresql://postgres:password@localhost:5432/apexsports" npm run db:push
```

#### 4. Run the API locally

```bash
DATABASE_URL="postgresql://postgres:password@localhost:5432/apexsports" npm run api
```

#### 5. Run the frontend

In a separate terminal:

```bash
npm run web
```

Open http://localhost:5173

**Without Cognito (local dev):** The app uses dev auth. Go to "Sign in" or "Coach Dashboard", then select "Demo Coach" or "Demo Athlete" from the dropdown. Run `npm run db:seed` if you need to reseed demo users.

**Seed the marketplace with coaches (local):** To populate "Find a Coach" with many coaches (random names, sports, cities, bios, and placeholder photos), run from the repo root:

```bash
cd apps/api && DATABASE_URL="postgresql://postgres:password@localhost:5432/apexsports" pnpm run seed:marketplace 30
```

Or set `SEED_COACHES=30` and run `pnpm run seed:marketplace`. Default is 25 coaches; pass a number as the first argument to override. **For deployed Aurora (DB in VPC),** use the seed Lambda instead—see [DEPLOY.md](DEPLOY.md#6-seed-marketplace-coaches-optional).

### Full dev (API + web)

```bash
# Terminal 1: API
DATABASE_URL="postgresql://postgres:password@localhost:5432/apexsports" npm run api

# Terminal 2: Web
npm run web
```

## Deploy

```bash
npm run deploy
```

See [DEPLOY.md](DEPLOY.md) for full AWS setup, stages, and post-deploy migration steps. Deployments use the **Serverless Framework** and create a **CloudFormation stack** (visible in AWS Console).

## Project structure

```
├── apps/
│   ├── api/          # Express API (Lambda handler)
│   └── web/          # React frontend
├── packages/
│   └── shared/       # Shared types and validation
├── serverless.yml    # Serverless Framework / CloudFormation
└── package.json
```
