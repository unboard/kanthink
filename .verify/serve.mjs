/**
 * Serves whatever is in .verify over http, because file:// is not navigable and the
 * data API needs a real origin to accept a cross-origin POST.
 *
 *   node .verify/serve.mjs            → http://localhost:4599/ serves harness.html
 *   node .verify/serve.mjs mock.html  → serves that instead
 */
import http from 'http'
import fs from 'fs'
import path from 'path'

const fallback = process.argv[2] ?? 'harness.html'
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

http.createServer((req, res) => {
  const name = req.url === '/' ? fallback : req.url.split('?')[0].replace(/^\//, '')
  try {
    const body = fs.readFileSync(path.join(dir, name))
    res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html' : 'text/plain' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('not found: ' + name)
  }
}).listen(4599, () => console.log(`serving .verify on http://localhost:4599/ (default ${fallback})`))
