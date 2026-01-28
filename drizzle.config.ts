import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:./data/kanthink.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
})
