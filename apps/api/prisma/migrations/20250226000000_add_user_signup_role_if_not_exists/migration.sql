-- Add signup_role if missing (e.g. previous migration failed but was recorded in _prisma_migrations)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signup_role" TEXT;
