import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

/** The underlying connection, exported so tests can share it rather than fight it for the file lock. */
export const client = createClient({
  url: process.env.DATABASE_URL || 'file:./data/kanthink.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export const db = drizzle(client, { schema })
