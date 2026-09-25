/**
 * Handing somebody a file.
 *
 * This was reported as "the app builder says it can't enable downloading a file",
 * and the app had been talked into telling people — on Android — to right-click an
 * image to save it. Two separate faults produced that:
 *
 *   1. the iframe had no `allow-downloads`, so Chrome dropped every download
 *      silently, leaving only a console line; and
 *   2. having watched that fail, the model reclassified downloading as a capability
 *      the runtime does not have, so preflight started refusing to build it.
 *
 * The first is a missing attribute. The second is the one that would have kept
 * coming back on every app that exports a PNG, a CSV or a PDF, so the tests below
 * cover both the runtime helper and the sandbox flag that lets it work.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { buildPlaygroundDoc } from '../components/playground/buildPlaygroundDoc'

const APP = 'export default function App() { return <div>hi</div>; }'

/** The runtime script block, run in a context with just enough browser in it. */
function runRuntime() {
  const doc = buildPlaygroundDoc(APP, { appToken: 'app-1.abc' })
  const blocks = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  const src = blocks.find((b) => b.includes('kanthinkDownload'))
  expect(src, 'the runtime should define kanthinkDownload').toBeTruthy()

  /** Every anchor the helper clicked, in order. */
  const clicks: { href: string; download: string }[] = []
  const revoked: string[] = []
  let objectUrlSeq = 0

  class FakeBlob {
    parts: unknown[]
    type: string
    constructor(parts: unknown[], opts?: { type?: string }) {
      this.parts = parts
      this.type = opts?.type ?? ''
    }
  }

  const makeAnchor = () => ({
    href: '', download: '', rel: '',
    click() { clicks.push({ href: this.href, download: this.download }) },
    remove() {},
    setAttribute() {},
    style: {},
  })

  const ctx: Record<string, unknown> = {
    Blob: FakeBlob,
    HTMLCanvasElement: class {},
    Uint8Array,
    atob: (b64: string) => Buffer.from(b64, 'base64').toString('binary'),
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
    JSON,
    Promise,
    Error,
    setTimeout,
    clearTimeout,
    decodeURIComponent,
    encodeURIComponent,
    console,
    fetch: async () => ({ ok: true, status: 200, blob: async () => new FakeBlob(['remote'], { type: 'image/png' }) }),
    URL: {
      createObjectURL: () => `blob:fake/${++objectUrlSeq}`,
      revokeObjectURL: (u: string) => { revoked.push(u) },
    },
    document: {
      createElement: (tag: string) => (tag === 'a' ? makeAnchor() : { style: {}, appendChild() {}, setAttribute() {} }),
      body: { appendChild() {} },
      getElementById: () => null,
      addEventListener() {},
      documentElement: { style: {} },
    },
    parent: { postMessage() {} },
    location: { href: 'about:srcdoc' },
    navigator: { userAgent: 'test' },
    addEventListener() {},
  }
  ctx.window = ctx
  ctx.globalThis = ctx
  ctx.self = ctx

  vm.createContext(ctx)
  new vm.Script(src!).runInContext(ctx)

  return {
    download: ctx.kanthinkDownload as (d: unknown, n: string, m?: string) => Promise<void>,
    clicks,
    revoked,
    FakeBlob,
  }
}

describe('kanthinkDownload', () => {
  it('exists in the runtime every app gets', () => {
    const { download } = runRuntime()
    expect(typeof download).toBe('function')
  })

  it('saves a plain string as a named file', async () => {
    const { download, clicks } = runRuntime()
    await download('a,b,c\n1,2,3', 'rows.csv')
    expect(clicks).toHaveLength(1)
    expect(clicks[0].download).toBe('rows.csv')
    expect(clicks[0].href).toMatch(/^blob:/)
  })

  it('saves an object as JSON without the app stringifying it first', async () => {
    const { download, clicks } = runRuntime()
    await download({ streak: 4 }, 'progress.json')
    expect(clicks[0].download).toBe('progress.json')
  })

  it('decodes a data URL rather than handing it over as an href', async () => {
    // The shape kanthinkAI.generateImage returns. A giant data: href is slow at
    // best and refused at worst, so it becomes a blob first.
    const { download, clicks } = runRuntime()
    await download('data:image/png;base64,aGVsbG8=', 'logo.png')
    expect(clicks[0].href).toMatch(/^blob:/)
    expect(clicks[0].download).toBe('logo.png')
  })

  it('fetches a remote URL into a blob, because download is ignored cross-origin', async () => {
    // Linking straight at a Cloudinary URL navigates to the image instead of
    // saving it — which is one of the ways this looked broken.
    const { download, clicks } = runRuntime()
    await download('https://res.cloudinary.com/demo/image/upload/logo.png', 'logo.png')
    expect(clicks[0].href).toMatch(/^blob:/)
  })

  it('takes a Blob as-is', async () => {
    const { download, clicks, FakeBlob } = runRuntime()
    await download(new FakeBlob(['x'], { type: 'text/plain' }), 'note.txt')
    expect(clicks).toHaveLength(1)
  })

  it('strips path separators out of the filename', async () => {
    const { download, clicks } = runRuntime()
    await download('x', '../../etc/passwd')
    expect(clicks[0].download).not.toContain('/')
    expect(clicks[0].download).not.toContain('..' + '/')
  })

  it('rejects with something worth showing when given nothing', async () => {
    const { download } = runRuntime()
    await expect(download(null, 'x.txt')).rejects.toThrow(/something to save/i)
    await expect(download('x', '')).rejects.toThrow(/filename/i)
  })

  it('does not revoke the object URL before the download can start', async () => {
    // Revoking synchronously cancels the download in Safari.
    const { download, revoked } = runRuntime()
    await download('x', 'x.txt')
    expect(revoked).toHaveLength(0)
  })
})

/**
 * The helper is useless without this. Chrome blocks a download started by a
 * sandboxed frame unless the flag is present, and says so only in the console — so
 * the app looks like it simply did nothing.
 */
describe('every frame that runs a generated app allows downloads', () => {
  const FRAMES = [
    'app/play/[token]/PublicPlaygroundFrame.tsx',
    'app/play/preview/[appId]/PreviewPlaygroundFrame.tsx',
    'components/playground/AppDrawer.tsx',
  ]

  for (const frame of FRAMES) {
    it(`${frame} sets allow-downloads`, () => {
      const src = fs.readFileSync(path.join(process.cwd(), frame), 'utf8')
      const sandboxes = [...src.matchAll(/sandbox="([^"]*)"/g)].map((m) => m[1])
      expect(sandboxes.length).toBeGreaterThan(0)
      for (const sandbox of sandboxes) {
        expect(sandbox, frame).toContain('allow-downloads')
        // Without it, a tab the app opens (an "Order prints" link to another site)
        // inherits this sandbox: no cookies, no storage, a null origin — and that
        // site's uploads and sign-ins break in ways that look like its own bug.
        expect(sandbox, frame).toContain('allow-popups-to-escape-sandbox')
      }
    })
  }
})

/**
 * The half that would otherwise keep coming back.
 *
 * The flag makes downloads work; these keep the builder from deciding they don't.
 * Preflight refusing the request is what turned a missing attribute into "I can't
 * build that as described", and it would have done the same to every app that
 * exports a PNG, a CSV or a PDF.
 *
 * As with the other prompt guards: this cannot prove the model obeys the
 * instruction, only that nobody deleted it.
 */
describe('the builder is told that downloading is supported', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

  it('lists kanthinkDownload among the things the runtime HAS', () => {
    const src = read('lib/playground/generateApp.ts')
    expect(src).toMatch(/window\.kanthinkDownload IS available/)
  })

  it('carves downloads out of the unsupported rule', () => {
    const src = read('lib/playground/generateApp.ts')
    expect(src).toMatch(/Saving a file to the device IS supported/i)
    // The general form, so the next browser capability does not need its own fix.
    expect(src).toMatch(/capability the BROWSER has is a capability you have/i)
  })

  it('forbids the right-click fallback that was shipped to a phone', () => {
    const src = read('lib/playground/generateApp.ts')
    expect(src).toMatch(/NEVER tell someone to right-click/i)
    // And the two dead ends the app tried before giving up.
    expect(src).toMatch(/never set target="_top"/i)
  })

  it('stops preflight returning UNSUPPORTED for a browser capability', () => {
    const src = read('lib/playground/preflight.ts')
    expect(src).toMatch(/ANYTHING THE BROWSER ITSELF DOES IS SUPPORTED/)
    expect(src).toMatch(/downloading a file the app made/i)
    // The verdict schema is a separate prompt and needs saying separately.
    expect(src).toMatch(/Neither is anything the browser itself does on the device/i)
  })

  it('guards the capability so a rebuild cannot silently drop it', () => {
    const src = read('lib/playground/capabilityGuard.ts')
    expect(src).toMatch(/kanthinkDownload/)
    expect(src).toMatch(/saving a file to the device/i)
  })
})
