'use client'

import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * /print/developers — everything a developer (or a bot) needs to send orders in and get
 * events out, plus the printer's keys, webhook and branding.
 *
 * The docs are public so the link can be handed to a printer's developers; the
 * settings appear only for the signed-in account.
 */

interface Partner {
  brand: { name?: string; logoUrl?: string; color?: string; email?: string; phone?: string; website?: string }
  webhookUrl: string | null
  webhookSecret: string | null
  approvalHours: number
}

interface Key {
  id: string
  prefix: string
  label: string | null
  createdAt: number | null
  lastUsedAt: number | null
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? 'That didn’t work.'), { status: res.status })
  return json as T
}

function Code({ children, lang }: { children: string; lang?: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="relative group my-3">
      <pre className="rounded-xl p-4 text-[12.5px] leading-relaxed overflow-x-auto" style={{ background: '#16181b', color: '#e7e9ec' }} data-lang={lang}>
        <code>{children.trim()}</code>
      </pre>
      <button
        type="button"
        className="absolute top-2 right-2 text-[11.5px] px-2 py-1 rounded-md opacity-70 hover:opacity-100"
        style={{ background: '#2a2d32', color: '#e7e9ec' }}
        onClick={() => {
          void navigator.clipboard.writeText(children.trim())
          setDone(true)
          setTimeout(() => setDone(false), 1400)
        }}
      >
        {done ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-[20px] font-semibold tracking-tight mt-12 mb-2 scroll-mt-20">
      {children}
    </h2>
  )
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[14.5px] leading-relaxed my-2" style={{ color: 'var(--ink-2)' }}>
    {children}
  </p>
)

const C = ({ children }: { children: React.ReactNode }) => (
  <code className="text-[13px] px-1.5 py-0.5 rounded" style={{ background: 'var(--raise)' }}>
    {children}
  </code>
)

function Settings({ base }: { base: string }) {
  const [partner, setPartner] = useState<Partner | null>(null)
  const [keys, setKeys] = useState<Key[]>([])
  const [fresh, setFresh] = useState<string | null>(null)
  const [status, setStatus] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [label, setLabel] = useState('')

  useEffect(() => {
    Promise.all([call<Partner>('/api/print/partner'), call<{ keys: Key[] }>('/api/print/keys')])
      .then(([p, k]) => {
        setPartner(p)
        setKeys(k.keys)
      })
      .catch((e) => setStatus((e as { status?: number }).status ?? 500))
  }, [])

  if (status === 401) {
    return (
      <div className="proof-card p-5">
        <div className="text-[15px] font-semibold">Your keys and settings</div>
        <P>
          <Link href={`/api/auth/signin?callbackUrl=${encodeURIComponent('/print/developers')}`} className="underline">
            Sign in
          </Link>{' '}
          to make an API key, set a webhook and put your brand on your customers’ pages.
        </P>
      </div>
    )
  }
  if (!partner) return <div className="proof-card p-5 text-[14px]">Loading your settings…</div>

  const save = async (patch: Partial<Partner> & { rotateSecret?: boolean }) => {
    setSaving(true)
    setSaved(false)
    try {
      setPartner(await call<Partner>('/api/print/partner', { method: 'PATCH', body: JSON.stringify(patch) }))
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'That didn’t save.')
    } finally {
      setSaving(false)
    }
  }
  const b = partner.brand

  return (
    <div className="space-y-4">
      <div className="proof-card p-5">
        <div className="text-[15px] font-semibold">API keys</div>
        <P>Keys act as your account. Keep them on your server; revoke one if it leaks.</P>
        {fresh && (
          <div className="rounded-lg p-3 my-2 text-[13px]" style={{ background: '#ecfdf5' }}>
            <div className="font-semibold">Copy this key now — it won’t be shown again.</div>
            <Code>{fresh}</Code>
          </div>
        )}
        <ul className="space-y-1.5 my-2">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between text-[13.5px]">
              <span>
                <C>{k.prefix}…</C> {k.label}
                <span style={{ color: 'var(--muted)' }}> · {k.lastUsedAt ? `used ${new Date(k.lastUsedAt * 1000).toLocaleDateString()}` : 'never used'}</span>
              </span>
              <button type="button" className="text-[12.5px]" style={{ color: 'var(--err)' }} onClick={async () => { await call(`/api/print/keys?id=${k.id}`, { method: 'DELETE' }); setKeys(keys.filter((x) => x.id !== k.id)) }}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className="proof-input" placeholder="Label, e.g. Order system" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button
            type="button"
            className="proof-btn primary shrink-0"
            onClick={async () => {
              const k = await call<{ id: string; key: string; prefix: string }>('/api/print/keys', { method: 'POST', body: JSON.stringify({ label }) })
              setFresh(k.key)
              setKeys([{ id: k.id, prefix: k.prefix, label: label || 'API key', createdAt: Date.now() / 1000, lastUsedAt: null }, ...keys])
              setLabel('')
            }}
          >
            New key
          </button>
        </div>
      </div>

      <div className="proof-card p-5">
        <div className="text-[15px] font-semibold">Webhook</div>
        <P>Every job event is POSTed here, signed. Leave empty for none.</P>
        <WebhookForm partner={partner} onSave={save} saving={saving} />
        {partner.webhookSecret && (
          <div className="mt-3 text-[13px]">
            Signing secret: <C>{partner.webhookSecret}</C>{' '}
            <button type="button" className="underline text-[12.5px]" onClick={() => save({ rotateSecret: true })}>
              Rotate
            </button>
          </div>
        )}
      </div>

      <div className="proof-card p-5">
        <div className="text-[15px] font-semibold">Your customers’ pages</div>
        <P>Your name, logo and color on every proof page and email. Customers never see Kanthink’s.</P>
        <BrandForm brand={b} approvalHours={partner.approvalHours} onSave={save} saving={saving} />
        {saved && <div className="text-[13px] mt-2" style={{ color: 'var(--ok)' }}>Saved.</div>}
      </div>
      <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
        API base: <C>{base}/api/v1/print</C>
      </p>
    </div>
  )
}

function WebhookForm({ partner, onSave, saving }: { partner: Partner; onSave: (p: Partial<Partner>) => void; saving: boolean }) {
  const [url, setUrl] = useState(partner.webhookUrl ?? '')
  return (
    <div className="flex gap-2">
      <input className="proof-input" placeholder="https://your-system.example.com/kanthink" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button type="button" className="proof-btn shrink-0" disabled={saving || url === (partner.webhookUrl ?? '')} onClick={() => onSave({ webhookUrl: url.trim() || null })}>
        Save
      </button>
    </div>
  )
}

function BrandForm({ brand, approvalHours, onSave, saving }: { brand: Partner['brand']; approvalHours: number; onSave: (p: Partial<Partner>) => void; saving: boolean }) {
  const [b, setB] = useState(brand)
  const [hours, setHours] = useState(String(approvalHours))
  const field = (k: keyof Partner['brand'], placeholder: string) => (
    <input className="proof-input" placeholder={placeholder} value={b[k] ?? ''} onChange={(e) => setB({ ...b, [k]: e.target.value })} />
  )
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {field('name', 'Business name')}
      {field('logoUrl', 'Logo URL (https://…)')}
      {field('email', 'Reply-to email')}
      {field('phone', 'Phone')}
      {field('website', 'Website')}
      <div className="flex gap-2 items-center">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(b.color ?? '') ? b.color : '#1f2937'} onChange={(e) => setB({ ...b, color: e.target.value })} className="w-10 h-10 rounded" />
        {field('color', '#1f2937')}
      </div>
      <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2">
        Customers have
        <input className="proof-input w-20" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d]/g, ''))} />
        hours to approve or change an order, unless the order says otherwise.
      </label>
      <button type="button" className="proof-btn primary sm:col-span-2" disabled={saving} onClick={() => onSave({ brand: b, approvalHours: Number(hours) || 24 })}>
        Save
      </button>
    </div>
  )
}

export function Developers() {
  // The host the docs are read on, so examples paste straight into a terminal.
  const base = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => 'https://www.kanthink.com',
  )
  const api = `${base}/api/v1/print`

  return (
    <div className="proof h-full overflow-y-auto">
      <header className="border-b bg-white sticky top-0 z-10" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link href="/print/orders" className="text-[13px]" style={{ color: 'var(--muted)' }}>
            ← Orders
          </Link>
          <h1 className="text-[16px] font-semibold flex-1">Print orders API</h1>
        </div>
      </header>
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <article>
          <h1 className="text-[30px] font-semibold tracking-tight">Send print orders in. Get approved artwork out.</h1>
          <P>
            Create an order with one or more jobs — artwork, product, customer — and each job gets a shared proof page. Your team fixes the artwork (fit to the product, fix the safe area and bleed, sharpen), sends the proof, and the customer
            approves or asks for a change with numbered marks, before a deadline. After the deadline the proof is final. You get every step as a webhook, and the print-ready PDF when it’s done.
          </P>
          <nav className="flex flex-wrap gap-1.5 my-4 text-[13px]">
            {[
              ['quickstart', 'Quickstart'],
              ['auth', 'Auth'],
              ['orders', 'Create an order'],
              ['products', 'Products'],
              ['artwork', 'Artwork'],
              ['jobs', 'Jobs'],
              ['lifecycle', 'Statuses & deadline'],
              ['webhooks', 'Webhooks'],
              ['mcp', 'MCP for bots'],
              ['errors', 'Errors & limits'],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="proof-chip">
                {label}
              </a>
            ))}
          </nav>

          <H2 id="quickstart">Quickstart</H2>
          <P>Make a key on this page, then create an order with one job. The response has a link for the customer and one for your team.</P>
          <Code lang="bash">{`curl ${api}/orders \\
  -H "Authorization: Bearer kp_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "externalId": "order-1042",
    "ref": "1042",
    "customer": { "name": "Pat Example", "email": "pat@example.com", "phone": "614-555-0100" },
    "approvalHours": 24,
    "jobs": [{
      "externalId": "line-1",
      "name": "Door hangers",
      "quantity": 500,
      "product": { "key": "door-hanger", "shape": "square", "sku": "DH-425x11", "stock": "14pt gloss" },
      "artwork": [{ "url": "https://files.example.com/1042/hanger.pdf",
                    "origin": { "madeBy": "customer", "madeWith": "Canva", "via": "upload" } }]
    }]
  }'`}</Code>
          <P>
            The customer gets an email with their page (turn it off with <C>{'"notifyCustomer": false'}</C>). Your team opens <C>links.printer</C>.
          </P>

          <H2 id="auth">Auth</H2>
          <P>
            Send <C>Authorization: Bearer kp_live_…</C> on every request. Keys belong to one printer account, are shown once, and can be revoked here. Everything is JSON over HTTPS. Times are ISO 8601 (epoch seconds are accepted too).
          </P>

          <H2 id="orders">Create an order</H2>
          <P>
            <C>POST /orders</C> — returns <C>201</C> with the order, or <C>200</C> with the existing one if you send an <C>externalId</C> you’ve sent before. Retrying is always safe.
          </P>
          <ul className="text-[14px] list-disc pl-5 space-y-1" style={{ color: 'var(--ink-2)' }}>
            <li><C>customer</C> — name, email, phone, company. Email is where the proof link goes.</li>
            <li><C>lockAt</C> or <C>approvalHours</C> — when changes close. Default: your account’s window (24 h).</li>
            <li><C>jobs[]</C> — each with <C>name</C>, <C>quantity</C>, <C>product</C>, <C>artwork[]</C>, <C>notes</C>, and your <C>externalId</C>.</li>
            <li><C>metadata</C> — anything you want back on every read and webhook.</li>
            <li><C>offer</C> — optional <C>{'{ title, body, url, cta }'}</C> shown quietly at the bottom of the customer’s page.</li>
          </ul>
          <P>Each job’s response includes:</P>
          <Code lang="json">{`{
  "id": "8msbLqk2xrd9",
  "externalId": "line-1",
  "status": "received",
  "lockAt": "2026-10-08T12:00:00.000Z",
  "links": {
    "customer": "${base}/proof/oAxkV_PxRvRRpbA-wuLCNQ",
    "printer": "${base}/print/jobs/8msbLqk2xrd9",
    "printFile": "${api}/jobs/8msbLqk2xrd9/print-file"
  },
  "pages": [{ "label": "Front", "final": {…}, "proof": {…}, "current": {…}, "original": {…}, "openMarks": [] }],
  "artwork": [{ "filename": "hanger.pdf", "page": 0, "width": 1350, "height": 3375, "origin": {…} }]
}`}</Code>
          <P>
            An order with several jobs has an order page (<C>links.customer</C> on the order) listing them, and every job page links to the others in its order.
          </P>

          <H2 id="products">Products</H2>
          <P>
            Name a catalog product by <C>key</C> (see <a className="underline" href={`${api}/products`}>GET /products</a>), with an optional <C>shape</C> (e.g. door hanger <C>square</C> or <C>rounded</C>) and page count. Or give any size:
          </P>
          <Code lang="json">{`{ "name": "Banner", "width": 72, "height": 36, "unit": "in", "bleed": 0.5, "safe": 1, "pages": ["Front"] }`}</Code>
          <P>Other fields (sku, stock, finish, coating) are kept on the job and returned as you sent them.</P>

          <H2 id="artwork">Artwork</H2>
          <P>
            Each file is <C>{'{ url, page?, filename?, origin? }'}</C>. <C>url</C> is an https link we fetch (up to 80 MB) or a <C>data:</C> URL for small files. PDF, PNG, JPG, TIFF and WebP. A multi-page PDF fills the pages in order; otherwise say which
            page with an index or label (<C>{'"page": "back"'}</C>).
          </P>
          <P>
            Files are checked as they arrive. Full-bleed files are used as they are; trim-size files get their edges extended into the bleed; a file of a different shape is centered and the job says how much is cut off, so your team can fit it to
            the product with one click. <C>origin</C> (who made it, in what, uploaded or reordered, AI-made) is shown to whoever reviews it.
          </P>
          <Code lang="bash">{`curl ${api}/jobs/JOB_ID/artwork -H "Authorization: Bearer kp_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "artwork": [{ "url": "https://files.example.com/1042/back.png", "page": "back" }] }'`}</Code>

          <H2 id="jobs">Jobs</H2>
          <div className="overflow-x-auto">
            <table className="text-[13.5px] w-full">
              <tbody>
                {[
                  ['GET', '/orders?limit=&since=', 'Orders, newest first, with a summary of each job'],
                  ['GET', '/orders/:id', 'An order and all its jobs (id or your externalId)'],
                  ['PATCH', '/orders/:id', '{ lockAt } moves every job’s deadline'],
                  ['GET', '/jobs/:id', 'A job: status, pages, files, links'],
                  ['PATCH', '/jobs/:id', '{ status } and/or { lockAt } for this job'],
                  ['POST', '/jobs/:id/artwork', 'Add artwork (JSON urls, or multipart file under 4 MB)'],
                  ['POST', '/jobs/:id/proof', '{ message, changes: [{ kind, text }] } — show the customer the current pages and email them'],
                  ['POST', '/jobs/:id/approve', '{ by } — approve for the customer (they said yes by phone)'],
                  ['POST', '/jobs/:id/messages', '{ message } — to the job’s timeline and the customer’s inbox'],
                  ['GET', '/jobs/:id/events', 'The job’s timeline'],
                  ['GET', '/jobs/:id/print-file', 'Press PDF of the final pages, TrimBox and BleedBox set; ?cropMarks=1'],
                  ['GET', '/products', 'Catalog keys and sizes (no key needed)'],
                ].map(([m, path, what]) => (
                  <tr key={m + path} className="border-b align-top" style={{ borderColor: 'var(--line)' }}>
                    <td className="py-2 pr-3 font-mono text-[12px] font-semibold">{m}</td>
                    <td className="py-2 pr-3 font-mono text-[12px] whitespace-nowrap">{path}</td>
                    <td className="py-2" style={{ color: 'var(--ink-2)' }}>
                      {what}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <H2 id="lifecycle">Statuses and the deadline</H2>
          <Code>{`received ──proof──▶ awaiting_approval ──approve──▶ approved
    ▲                     │                         │
    └──── new file ───────┴── changes_requested ◀───┘   (customer can ask until the deadline)

at lockAt, any of the above ──▶ locked   (the proof as it stands is final)
then, from your system:  in_production ──▶ complete      (or canceled)`}</Code>
          <P>
            After <C>lockAt</C> nobody can change the job from the page: the customer sees the version that will print. The print file is always the approved or locked proof (or, before any proof, the current pages); the response header{' '}
            <C>X-Print-Final: true</C> tells you it’s settled.
          </P>

          <H2 id="webhooks">Webhooks</H2>
          <P>
            Set a URL on this page and every job event is POSTed to it: <C>job.created</C>, <C>job.artwork_added</C>, <C>job.checked</C>, <C>job.revised</C>, <C>job.proof_sent</C>, <C>job.approved</C>, <C>job.changes_requested</C>,{' '}
            <C>job.comment</C>, <C>job.locked</C>, <C>job.status_changed</C>, <C>job.deadline_changed</C>. The body carries the event, the whole job, and the order’s ids. Missed one? <C>GET /jobs/:id/events</C>.
          </P>
          <P>
            Each request is signed: <C>Kanthink-Signature: t=TIMESTAMP,v1=HEX</C>, where HEX is HMAC-SHA256 of <C>TIMESTAMP.BODY</C> with your signing secret. Check it, and reject old timestamps:
          </P>
          <Code lang="js">{`import crypto from 'crypto'

function verify(rawBody, header, secret) {
  const t = Number(header.match(/t=(\\d+)/)?.[1])
  const v1 = header.match(/v1=([a-f0-9]{64})/)?.[1]
  if (!t || !v1 || Math.abs(Date.now() / 1000 - t) > 300) return false
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
}`}</Code>

          <H2 id="mcp">MCP for bots</H2>
          <P>
            The same API is an MCP server at <C>{api}/mcp</C> (Streamable HTTP), with tools to list products, create and read orders and jobs, add artwork, send proofs, approve, message the customer, set status and move deadlines. Use the same
            key.
          </P>
          <Code lang="bash">{`claude mcp add --transport http kanthink-print ${api}/mcp \\
  --header "Authorization: Bearer kp_live_YOUR_KEY"`}</Code>
          <Code lang="json">{`{
  "mcpServers": {
    "kanthink-print": {
      "type": "http",
      "url": "${api}/mcp",
      "headers": { "Authorization": "Bearer kp_live_YOUR_KEY" }
    }
  }
}`}</Code>

          <H2 id="errors">Errors and limits</H2>
          <P>
            Errors are <C>{'{ "error": { "message", "path"?, "fields"? } }'}</C> with a matching status: <C>401</C> bad key, <C>404</C> not on your account, <C>409</C> past the deadline or out of order, <C>422</C> the payload — <C>fields</C> lists
            every problem with its path (<C>jobs[1].product</C>).
          </P>
          <Code lang="json">{`{ "error": { "message": "The order isn't valid: jobs[0].product — Give width and height…",
    "path": "jobs[0].product",
    "fields": [{ "path": "jobs[0].product", "message": "Give width and height (in inches, or set unit: \\"mm\\"), or a catalog key." }] } }`}</Code>
          <ul className="text-[14px] list-disc pl-5 space-y-1" style={{ color: 'var(--ink-2)' }}>
            <li>Artwork by URL: up to 80 MB. Inline (data: URL or multipart): under 4 MB.</li>
            <li>Up to 50 jobs per order, 12 files per job.</li>
            <li>Creating an order fetches and checks every file, so allow up to a couple of minutes for big orders.</li>
          </ul>
        </article>
        <aside className="lg:sticky lg:top-20">
          <Settings base={base} />
        </aside>
      </main>
    </div>
  )
}
