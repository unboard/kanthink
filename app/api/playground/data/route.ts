import { NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/db/ensure-schema'
import {
  readAll,
  readOne,
  remove,
  resolveDataMember,
  usage,
  verifyDataToken,
  write,
} from '@/lib/playground/customerData'

export const runtime = 'nodejs'

/**
 * POST /api/playground/data
 *
 * Where a published app keeps one customer's work.
 *
 * Every request carries a dataToken the host page baked into the document after
 * resolving a real session from the cookie. The app never says whose data it wants
 * — that comes from the token — so there is no request an app can make for somebody
 * else's rows, whatever it sends.
 *
 * Ops: get | list | set | delete | usage.
 */

interface DataRequest {
  dataToken?: string
  op?: string
  key?: string
  value?: unknown
}

export async function POST(request: Request) {
  let body: DataRequest
  try {
    body = await request.json()
  } catch {
    return cors(NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }))
  }

  const claims = verifyDataToken(body.dataToken)
  if (!claims) {
    // Deliberately the same answer for a missing token, a forged one, and an
    // expired one. The app's job is to ask the person to sign in again either way.
    return cors(NextResponse.json({ error: 'Not signed in', signedIn: false }, { status: 401 }))
  }

  await ensureSchema()

  // The token is a claim about the past; the row is the present. A sign-out or a
  // revoked purchase bumps the epoch, and this is where that takes effect.
  const member = await resolveDataMember(claims)
  if (!member) {
    return cors(NextResponse.json({ error: 'Session ended', signedIn: false }, { status: 401 }))
  }

  const { appId, appUserId, scope } = claims

  try {
    switch (body.op) {
      case 'list': {
        const records = await readAll(appId, appUserId, scope)
        return cors(NextResponse.json({ records, usage: await usage(appId, appUserId, scope) }))
      }

      case 'get': {
        if (typeof body.key !== 'string') {
          return cors(NextResponse.json({ error: 'key is required' }, { status: 400 }))
        }
        const record = await readOne(appId, appUserId, scope, body.key)
        return cors(NextResponse.json({ record }))
      }

      case 'set': {
        if (typeof body.key !== 'string') {
          return cors(NextResponse.json({ error: 'key is required' }, { status: 400 }))
        }
        const result = await write(appId, appUserId, scope, body.key, body.value)
        if (!result.ok) {
          // 409, not 500: the request was understood and refused, and the app is
          // expected to tell the person rather than retry.
          return cors(NextResponse.json(
            { error: result.failure.message, code: result.failure.code, usage: result.usage },
            { status: 409 },
          ))
        }
        return cors(NextResponse.json({ saved: true, record: result.record, usage: result.usage }))
      }

      case 'delete': {
        if (typeof body.key !== 'string') {
          return cors(NextResponse.json({ error: 'key is required' }, { status: 400 }))
        }
        return cors(NextResponse.json({ deleted: true, usage: await remove(appId, appUserId, scope, body.key) }))
      }

      case 'usage':
        return cors(NextResponse.json({ usage: await usage(appId, appUserId, scope) }))

      default:
        return cors(NextResponse.json({ error: `Unknown op: ${body.op}` }, { status: 400 }))
    }
  } catch (error) {
    console.error('[playground/data] failed', error)
    // Never a partial success. The helper in the iframe turns any non-ok answer
    // into a rejected promise, so an app cannot show "Saved" off the back of this.
    return cors(NextResponse.json({ error: 'Could not reach storage' }, { status: 500 }))
  }
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

function cors(res: NextResponse) {
  // The iframe's origin is opaque, so it sends Origin: null and only a wildcard
  // answers it. Safe here because the token, not the origin, is the authority.
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return res
}
