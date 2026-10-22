import { defineConfig } from 'drizzle-kit';

// same as src/platform/load-env.ts (kept inline: drizzle-kit loads this file on its own)
try {
  process.loadEnvFile();
} catch {
  // no .env — DATABASE_URL comes from the environment
}

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://devdigest:devdigest@localhost:5432/devdigest';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: DATABASE_URL },
  // pgvector `vector` type is provided by the extension enabled in migration 0000.
  verbose: true,
  strict: true,
});
