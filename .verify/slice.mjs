import fs from 'fs'
import { createClient } from '@libsql/client'
const env = fs.readFileSync(process.env.ENV_FILE, 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim()
const client = createClient({ url: get('DATABASE_URL'), authToken: get('TURSO_AUTH_TOKEN') })
const { rows } = await client.execute({ sql: `SELECT code FROM playground_apps WHERE title LIKE ?`, args: [process.argv[2]] })
const lines = rows[0].code.split('\n')
const a = Number(process.argv[3]), b = Number(process.argv[4])
lines.slice(a - 1, b).forEach((l, i) => console.log(String(a + i).padStart(4) + ' | ' + l.replace(/\s+$/, '')))
process.exit(0)
