// reviewer-core/src/output/dedupe.ts
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Finding } from '../types.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

/** Drop findings we've already reported on this PR. */
export async function dedupeFindings(prId: string, findings: Finding[]): Promise<Finding[]> {
  const seen = await db.execute(sql`select fingerprint from findings where pr_id = ${prId}`);
  const known = new Set(seen.rows.map((r) => r.fingerprint as string));
  return findings.filter((f) => !known.has(f.fingerprint));
}
