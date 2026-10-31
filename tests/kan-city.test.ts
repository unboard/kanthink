import { describe, expect, it } from 'vitest'
import { archetypeFor, layoutCity, sizeFor, type PlotInput } from '@/lib/kan/city/layout'
import { Grid } from '@/components/kan/city/grid'

const plot = (id: string, name: string, district: string | null = null, extra: Partial<PlotInput> = {}): PlotInput =>
  ({ channelId: id, name, district, cards: 5, lastActivityAt: null, attention: null, ...extra })

describe('Kan City', () => {
  it('gives each channel a building that fits its topic', () => {
    const kind = (name: string, description = '') => archetypeFor({ id: name, name, description })
    expect(kind('Espresso Bean Log')).toBe('cafe')
    expect(kind("Scarlett's Learning Apps")).toBe('school')
    expect(kind('Backyard Birds')).toBe('park')
    expect(kind('Backyard Pond')).toBe('pond')
    expect(kind('Flyer Design UX Labs')).toBe('printshop')
    expect(kind('Grok')).toBe('depot')
    expect(kind('Work')).toBe('tower')
    expect(archetypeFor({ id: 'x', name: 'Kan Bookmarks', isShareInbox: true })).toBe('postoffice')
    // A name that says nothing still gets the same building every time.
    expect(kind('Zzyzx')).toBe(kind('Zzyzx'))
  })

  it('keeps building size sane at both ends', () => {
    expect(sizeFor(0)).toBe(1)
    expect(sizeFor(500)).toBeLessThanOrEqual(8)
    expect(sizeFor(20)).toBeGreaterThan(sizeFor(2))
  })

  it('lays out every channel on its own lot, off Town Hall and the park', () => {
    const inputs = Array.from({ length: 37 }, (_, i) => plot(`c${i}`, `Channel ${i}`, ['A', 'B', null, 'C'][i % 4], { lastActivityAt: i * 1000 }))
    const L = layoutCity(inputs)
    expect(L.plots).toHaveLength(37)
    const cells = new Set(L.plots.map((p) => `${p.cx},${p.cz}`))
    expect(cells.size).toBe(37)
    for (const b of [L.townHall, L.park]) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) expect(cells.has(`${b.cx + dx},${b.cz + dz}`)).toBe(false)
    for (const p of L.plots) { expect(p.cx).toBeLessThan(L.cols); expect(p.cz).toBeLessThan(L.rows) }
    for (const f of L.free) expect(cells.has(`${f.cx},${f.cz}`)).toBe(false)
    expect(L.free.length).toBeGreaterThan(0)
  })

  it('is stable: the same channels make the same city', () => {
    const inputs = [plot('a', 'Recipes', 'Home'), plot('b', 'Work'), plot('c', 'Birds', 'Home')]
    expect(layoutCity(inputs)).toEqual(layoutCity([...inputs].reverse()))
  })

  it('grows without moving what is already built', () => {
    const inputs = Array.from({ length: 30 }, (_, i) => plot('c' + i, 'Channel ' + i, ['A', 'B', null][i % 3], { createdAt: i }))
    const rel = (L: ReturnType<typeof layoutCity>) => Object.fromEntries(L.plots.map((p) => [p.channelId, [p.cx - L.townHall.cx, p.cz - L.townHall.cz]]))
    const before = rel(layoutCity(inputs))
    const more = [...inputs, ...Array.from({ length: 40 }, (_, i) => plot('n' + i, 'New ' + i, ['A', 'D', null][i % 3], { createdAt: 100 + i }))]
    const after = rel(layoutCity(more))
    for (const [id, at] of Object.entries(before)) expect(after[id]).toEqual(at)
    expect(Object.keys(after)).toHaveLength(70)
  })

  it('puts a moved plot on its pinned lot and keeps pins across growth', () => {
    const inputs = Array.from({ length: 12 }, (_, i) => plot('c' + i, 'Channel ' + i, ['A', null][i % 2], { createdAt: i }))
    const L = layoutCity(inputs)
    const raw = (id: string, l: ReturnType<typeof layoutCity>) => { const p = l.plots.find((x) => x.channelId === id)!; return { cx: p.cx + l.origin.cx, cz: p.cz + l.origin.cz } }
    // Out past everything, so it's certainly free.
    const lot = { cx: 14, cz: -9 }
    const moved = layoutCity(inputs.map((x) => (x.channelId === 'c7' ? { ...x, pin: lot } : x)))
    expect(raw('c7', moved)).toEqual(lot)
    // A pin on Town Hall is ignored rather than stacking two buildings.
    const th = { cx: L.townHall.cx + L.origin.cx, cz: L.townHall.cz + L.origin.cz }
    const bad = layoutCity(inputs.map((x) => (x.channelId === 'c7' ? { ...x, pin: th } : x)))
    expect(raw('c7', bad)).not.toEqual(th)
    const grown = layoutCity([...inputs.map((x) => (x.channelId === 'c7' ? { ...x, pin: lot } : x)), ...Array.from({ length: 20 }, (_, i) => plot('n' + i, 'New ' + i, 'B', { createdAt: 50 + i }))])
    expect(raw('c7', grown)).toEqual(lot)
  })

  it('routes along the streets to a door', () => {
    const g = new Grid(8, 8)
    const from = g.door(0, 0)
    const to = g.door(5, 5)
    const path = g.route(from, to)
    expect(path.at(-1)).toEqual({ x: to.x, z: to.z })
    // Every leg is straight: along x or along z, never diagonal.
    let prev = { x: from.x, z: from.z }
    for (const p of path) { expect(p.x === prev.x || p.z === prev.z).toBe(true); prev = p }
  })
})

describe('plot styles', () => {
  it('keeps only known themes, buildings and hex colors', async () => {
    const { cleanStyle, parseStyle } = await import('@/lib/kan/city/style')
    expect(cleanStyle({ theme: 'cat', building: 'house', walls: '#FBE3C8', roof: '#f28fae' })).toEqual({ theme: 'cat', building: 'house', walls: '#fbe3c8', roof: '#f28fae' })
    expect(cleanStyle({ theme: 'dragons', building: 'volcano', walls: 'red', roof: 'url(x)' })).toEqual({})
    expect(parseStyle('{not json')).toEqual({})
    expect(parseStyle(null)).toEqual({})
  })
})

describe('building interiors', () => {
  const cols = [
    { id: 'a', name: 'Inbox', cards: 12 },
    { id: 'b', name: 'Doing', cards: 3 },
    { id: 'c', name: 'Done', cards: 60 },
  ]

  it('keeps only known, well-formed layout choices', async () => {
    const { cleanInterior } = await import('@/lib/kan/city/interior')
    expect(cleanInterior({ plan: 'open', floor: 'lava', light: 'party', walls: 'red', features: ['fireplace', 'moat', 'fireplace'], rooms: { ' Done ': { display: 'shelves', color: '#ABCDEF' }, x: { display: 'nope' } }, order: ['Done', 3] }))
      .toEqual({ plan: 'open', light: 'party', features: ['fireplace'], rooms: { done: { display: 'shelves', color: '#abcdef' } }, order: ['done'] })
    expect(cleanInterior('nonsense')).toEqual({})
  })

  for (const plan of ['hallway', 'open', 'atrium'] as const) {
    it(`gives every column a room with its cards on the walls (${plan})`, async () => {
      const { planInterior, roomAt } = await import('@/lib/kan/city/interior')
      const p = planInterior({ columns: cols, apps: 2, style: { plan } })
      const rooms = p.rooms.filter((r) => r.kind === 'column')
      expect(rooms.map((r) => r.name).sort()).toEqual(['Doing', 'Done', 'Inbox'])
      expect(p.rooms.some((r) => r.kind === 'arcade' && r.slots.length >= 2)).toBe(true)
      for (const r of rooms) {
        expect(r.shown).toBe(Math.min(r.count, 40, r.slots.length * r.perSlot))
        expect(r.shown).toBeGreaterThan(0)
        // A slot sits on a real wall.
        for (const s of r.slots) expect(p.walls.some((w) => (w.z0 === w.z1 ? s.z === w.z0 && s.x > w.x0 && s.x < w.x1 : s.x === w.x0 && s.z > w.z0 && s.z < w.z1))).toBe(true)
        expect(roomAt(p, (r.rect.x0 + r.rect.x1) / 2, (r.rect.z0 + r.rect.z1) / 2)?.id).toBe(r.id)
      }
      // The front door is open.
      expect(p.walls.some((w) => w.z0 === w.z1 && w.z0 === p.entrance.z && w.x0 < p.entrance.x && w.x1 > p.entrance.x)).toBe(false)
    })
  }

  it('puts rooms in the order asked and shows a column the way asked', async () => {
    const { planInterior } = await import('@/lib/kan/city/interior')
    const p = planInterior({ columns: cols, apps: 0, style: { order: ['done'], rooms: { inbox: { display: 'gallery' } } } })
    const rooms = p.rooms.filter((r) => r.kind === 'column')
    expect(rooms[0].name).toBe('Done')
    expect(rooms.find((r) => r.name === 'Inbox')?.display).toBe('gallery')
    expect(rooms.find((r) => r.name === 'Done')?.display).toBe('shelves')
  })
})

describe('the TV', () => {
  it('finds YouTube videos on cards, newest card first, each once', async () => {
    const { videosIn, youtubeIds } = await import('@/lib/kan/city/watch')
    expect(youtubeIds('see https://youtu.be/dQw4w9WgXcQ and https://www.youtube.com/watch?si=x&v=abcdefghijk, again youtu.be/dQw4w9WgXcQ; shorts: youtube.com/shorts/ZZZZZZZZZZZ'))
      .toEqual(['dQw4w9WgXcQ', 'abcdefghijk', 'ZZZZZZZZZZZ'])
    const v = videosIn([
      { id: 'old', title: 'Old', messages: [{ content: 'https://youtu.be/dQw4w9WgXcQ' }], updatedAt: new Date(1000) },
      { id: 'new', title: 'New https://youtu.be/dQw4w9WgXcQ', messages: [{ content: 'notes', watched: 'dQw4w9WgXcQ' }], updatedAt: new Date(2000) },
      { id: 'none', title: 'No video', messages: [], updatedAt: new Date(3000) },
    ])
    expect(v).toEqual([{ videoId: 'dQw4w9WgXcQ', cardId: 'new', cardTitle: 'New https://youtu.be/dQw4w9WgXcQ', watched: true }])
  })
})
