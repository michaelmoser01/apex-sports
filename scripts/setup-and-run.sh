#!/bin/bash
# ApexSports - Setup and run script
# Run this from the project root: ./scripts/setup-and-run.sh

set -e

cd "$(dirname "$0")/.."

echo "=== 1. Installing dependencies ==="
npm install

echo ""
echo "=== 2. Building shared package ==="
(cd packages/shared && npm run build)

echo ""
echo "=== 3. Checking for Postgres ==="
if [ -n "$DATABASE_URL" ]; then
  echo "Using DATABASE_URL from environment."
elif nc -z localhost 5432 2>/dev/null; then
  echo "Postgres is already running."
  export DATABASE_URL="postgresql://postgres:password@localhost:5432/apexsports"
else
  echo "Postgres is not running. Trying Docker..."
  if command -v docker >/dev/null 2>&1 && docker run --rm -d -p 5432:5432 \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=password \
    -e POSTGRES_DB=apexsports \
    --name apex-postgres \
    postgres:16.4 2>/dev/null; then
    echo "Waiting for Postgres to be ready..."
    sleep 4
    export DATABASE_URL="postgresql://postgres:password@localhost:5432/apexsports"
  else
    echo ""
    echo "Docker not found or failed. Two options:"
    echo ""
    echo "  A) Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    echo "     Then run this script again."
    echo ""
    echo "  B) Use free cloud Postgres (Neon): https://neon.tech"
    echo "     Create a project, copy the connection string, then run:"
    echo "     DATABASE_URL='your-connection-string' ./scripts/setup-and-run.sh"
    echo ""
    exit 1
  fi
fi

echo ""
echo "=== 4. Pushing database schema ==="
(cd apps/api && DATABASE_URL="$DATABASE_URL" npx prisma db push)

echo ""
echo "=== 4b. Seeding demo users (coach + athlete) ==="
(cd apps/api && DATABASE_URL="$DATABASE_URL" npx prisma db seed 2>/dev/null || echo "Seed skipped or already run")

echo ""
echo "=== 5. Starting API (runs in background) ==="
(cd apps/api && DATABASE_URL="$DATABASE_URL" npm run dev) &
API_PID=$!
sleep 3

echo ""
echo "=== 6. Starting Web ==="
echo "API is running. Starting web server..."
echo ""
echo "Open http://localhost:5173 in your browser"
echo "Press Ctrl+C to stop both servers"
echo ""

trap "kill $API_PID 2>/dev/null; exit" INT TERM
(cd apps/web && npm run dev)
