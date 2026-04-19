-- Align users table with Prisma User model
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);

-- Ensure email can be used safely with findUnique
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
