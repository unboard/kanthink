import http from 'http'
import fs from 'fs'
http.createServer((req, res) => {
  const name = req.url === '/' ? '/harness.html' : req.url.split('?')[0]
  try {
    const body = fs.readFileSync('.' + name)
    res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html' : 'text/plain' })
    res.end(body)
  } catch { res.writeHead(404); res.end('no') }
}).listen(4599, () => console.log('harness on http://localhost:4599'))
