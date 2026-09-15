/**
 * Render a generated app as a top-level page, so it can be driven and inspected
 * directly instead of through an opaque-origin iframe.
 *
 * window.kanthinkData is stubbed against a real /api/playground/data call using a
 * data token minted with the production secret — so what is exercised here is the
 * genuine server-side storage, not a fake.
 */
import fs from 'fs'
import crypto from 'crypto'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const SECRET = get('PLAYGROUND_TOKEN_SECRET') || get('NEXTAUTH_SECRET') || get('AUTH_SECRET')

const [appId, appUserId, epoch, scope, email] = process.argv.slice(2)
const expiresAt = Math.floor(Date.now() / 1000) + 3600
const parts = [appId, appUserId, String(epoch), scope, String(expiresAt)]
const mac = crypto.createHmac('sha256', SECRET).update(parts.join('.')).digest('hex').slice(0, 32)
const dataToken = [...parts, mac].join('.')

const code = fs.readFileSync('.verify/app.jsx', 'utf8')
  .replace(/^\s*import\s+React\s*,\s*\{([^}]+)\}\s*from\s*['"]react['"]\s*;?\s*$/gm, "import {$1} from 'react';")
  .replace(/^\s*import\s+React\s+from\s*['"]react['"]\s*;?\s*$/gm, '')

const ORIGIN = 'https://www.kanthink.com'

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Verbo harness</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="importmap">
{"imports":{"react":"https://esm.sh/react@19.0.0","react-dom":"https://esm.sh/react-dom@19.0.0","react-dom/client":"https://esm.sh/react-dom@19.0.0/client","react/jsx-runtime":"https://esm.sh/react@19.0.0/jsx-runtime","lucide-react":"https://esm.sh/lucide-react@0.460.0?external=react"}}
</script>
</head><body><div id="root"></div>
<script>
  var __T = ${JSON.stringify(dataToken)};
  var __U = ${JSON.stringify(ORIGIN + '/api/playground/data')};
  function call(op, key, value) {
    return fetch(__U, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ dataToken: __T, op: op, key: key, value: value })
    }).then(function(r){ return r.json().then(function(j){
      if (!r.ok) { var e = new Error(j.error || ('failed ' + r.status)); e.code = j.code; throw e; }
      return j;
    })});
  }
  window.__seedReady = call('list').then(function(j){
    var seed = {};
    (j.records||[]).forEach(function(r){ seed[r.key] = r.value; });
    window.kanthinkData = {
      signedIn: true,
      customer: { email: ${JSON.stringify(email)} },
      initial: seed,
      get: function(k){ return call('get', k).then(function(j){ return j.record ? j.record.value : null; }); },
      set: function(k, v){ return call('set', k, v); },
      remove: function(k){ return call('delete', k); },
      all: function(){ return call('list').then(function(j){ var o={}; (j.records||[]).forEach(function(r){o[r.key]=r.value;}); return o; }); },
      usage: function(){ return call('usage').then(function(j){ return j.usage; }); },
      signIn: function(){ return false; }
    };
    window.__seeded = JSON.stringify(seed);
    return seed;
  });
</script>
<script type="text/babel" data-type="module" data-presets="react">
import * as React from 'react';
import { createRoot } from 'react-dom/client';
${code}
window.__seedReady.then(function(){ createRoot(document.getElementById('root')).render(React.createElement(App)); });
</script>
</body></html>`

fs.writeFileSync('.verify/harness.html', html)
console.log('wrote .verify/harness.html for', email, 'scope', scope)
console.log('dataToken minted, expires in 1h')
