/**
 * The ownership boundary, probed against the live API rather than reasoned about.
 *
 * Every request here goes to https://www.kanthink.com/api/playground/data exactly as
 * a published app's would. The only thing this script has that an app does not is
 * the signing secret, which is what lets it forge the tokens worth refusing.
 */
import fs from 'fs'
import crypto from 'crypto'

const env = fs.readFileSync(process.env.ENV_FILE ?? '.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const SECRET = get('PLAYGROUND_TOKEN_SECRET') || get('NEXTAUTH_SECRET') || get('AUTH_SECRET')

const URL = 'https://www.kanthink.com/api/playground/data'
const APP = 'fcc981b8-d6db-46c0-88aa-9b961d7e49f3'
const ALICE = 'c3b50498-feb3-4659-8fe4-f83d15624605'
const BOB = '11861cec-2e10-4a79-b7bc-bac2467f500a'

const token = ({ appId = APP, appUserId, epoch = 0, scope = 'live', ttl = 3600 }) => {
  const parts = [appId, appUserId, String(epoch), scope, String(Math.floor(Date.now() / 1000) + ttl)]
  const mac = crypto.createHmac('sha256', SECRET).update(parts.join('.')).digest('hex').slice(0, 32)
  return [...parts, mac].join('.')
}

const call = async (dataToken, op, key, value) => {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataToken, op, key, value }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

let failures = 0
const ok = (label, pass, detail = '') => {
  if (!pass) failures++
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
}

const alice = token({ appUserId: ALICE })
const bob = token({ appUserId: BOB })

console.log('\nTwo customers, one app')
await call(bob, 'set', 'stats', { streak: 99, totalRounds: 42, note: "bob's own" })

const aRead = await call(alice, 'get', 'stats')
const bRead = await call(bob, 'get', 'stats')
ok('Alice reads her own row', aRead.body.record?.value?.totalRounds === 1,
   JSON.stringify(aRead.body.record?.value))
ok('Bob reads his own row', bRead.body.record?.value?.totalRounds === 42,
   JSON.stringify(bRead.body.record?.value))
ok('the same key is two different rows',
   aRead.body.record?.value?.streak !== bRead.body.record?.value?.streak)

const aList = await call(alice, 'list')
ok('a listing returns one customer only', (aList.body.records ?? []).length === 1,
   `${(aList.body.records ?? []).length} record(s)`)

console.log('\nTokens that should be refused')
const forged = alice.replace(ALICE, BOB)
const r1 = await call(forged, 'get', 'stats')
ok('a token edited to name another customer', r1.status === 401, `HTTP ${r1.status}`)

const r2 = await call(token({ appUserId: ALICE, epoch: 1 }), 'get', 'stats')
ok('a token whose epoch no longer matches the row', r2.status === 401, `HTTP ${r2.status}`)

const r3 = await call(token({ appUserId: ALICE, ttl: -60 }), 'get', 'stats')
ok('an expired token', r3.status === 401, `HTTP ${r3.status}`)

const r4 = await call(token({ appId: 'some-other-app', appUserId: ALICE }), 'get', 'stats')
ok("a token for a different app", r4.status === 401, `HTTP ${r4.status}`)

const r5 = await call('', 'get', 'stats')
ok('no token at all', r5.status === 401, `HTTP ${r5.status}`)

console.log('\nA draft preview writes somewhere else')
const draft = token({ appUserId: ALICE, scope: 'draft' })
await call(draft, 'set', 'stats', { streak: 0, totalRounds: 0, note: 'draft scribble' })
const afterDraft = await call(alice, 'get', 'stats')
ok('the live row is untouched by a draft write',
   afterDraft.body.record?.value?.totalRounds === 1,
   JSON.stringify(afterDraft.body.record?.value))

console.log('\nLimits refuse, and refuse without losing anything')
const tooBig = await call(alice, 'set', 'huge', 'x'.repeat(200_000))
ok('a value over the per-key limit is refused', tooBig.status === 409, `HTTP ${tooBig.status}`)
ok('and the refusal says why', /KB/.test(tooBig.body.error ?? ''), tooBig.body.error)
const stillThere = await call(alice, 'get', 'stats')
ok('what was already saved is still there',
   stillThere.body.record?.value?.totalRounds === 1)

const badKey = await call(alice, 'set', 'has a\nnewline', 1)
ok('a malformed key is refused', badKey.status === 409, `HTTP ${badKey.status}`)

const used = await call(alice, 'usage')
console.log(`  usage: ${used.body.usage?.bytes}B of ${used.body.usage?.limitBytes}B, ` +
            `${used.body.usage?.keys} of ${used.body.usage?.limitKeys} keys`)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
