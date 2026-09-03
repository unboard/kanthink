import { createClient } from "@libsql/client"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const scriptDir = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url))
const envPath = resolve(scriptDir, "..", ".env.local")
const env: Record<string, string> = {}
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const t = line.trim()
  if (!t || t.startsWith("#")) continue
  const i = t.indexOf("=")
  if (i === -1) continue
  env[t.slice(0, i)] = t.slice(i + 1)
}
const db = createClient({ url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
const r = await db.execute({
  sql: "UPDATE users SET name = ? WHERE id = ?",
  args: ["Grok", "kan-bugs-agent"],
})
const row = await db.execute({ sql: "SELECT id, name, email FROM users WHERE id = ?", args: ["kan-bugs-agent"] })
console.log("rows_affected", r.rowsAffected)
console.log("user", JSON.stringify(row.rows[0] ?? null))
