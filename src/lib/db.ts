import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const rawConnectionString = process.env.DATABASE_URL?.trim();
  if (!rawConnectionString) {
    throw new Error("DATABASE_URL 未配置，无法连接数据库");
  }

  // Some environments resolve localhost to IPv6 (::1) first.
  // If Postgres only listens on IPv4, this causes intermittent ECONNREFUSED.
  const connectionString = rawConnectionString.replace(/@localhost(?=[:/?])/i, "@127.0.0.1");
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 6000,
    idleTimeoutMillis: 30000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
