// Drizzle client over @netlify/neon — the connection string is read from
// NETLIFY_DATABASE_URL, which `netlify database init` provisions automatically.
import { neon } from '@netlify/neon';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  const sql = neon(); // reads NETLIFY_DATABASE_URL from env
  _db = drizzle(sql, { schema });
  return _db;
}

export { schema };
