import type { Config } from 'drizzle-kit';

export default {
  schema:  './netlify/functions/lib/db/schema.ts',
  out:     './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NETLIFY_DATABASE_URL ?? '',
  },
  strict:  true,
  verbose: true,
} satisfies Config;
