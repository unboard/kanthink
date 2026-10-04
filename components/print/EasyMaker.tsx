'use client'

import confetti from 'canvas-confetti'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { catalogProduct } from '@/lib/print/spec'
import type { PrintDesign } from '@/lib/print/types'
import { api, shortId, thumb, uploadImage } from './api'
import { downloadPageJpg, downloadPrintPdf } from './ExportDialog'
import { Sheet, type SheetHandle } from './Sheet'
import { ProductGlyph, SignInGate, SurfaceSwitch, useNotice } from './ui'
import { useDesign } from './useDesign'
import { speak, useDictation } from './useDictation'

/**
 * The easy way: a print piece a seven-year-old can finish.
 *
 * One question per screen, big pictures to tap, a speaker to read each question out,
 * and a microphone so nobody has to type. Every choice is a button; the only words
 * anyone has to produce are what the thing is about, and they can say them.
 */

type Step = 'what' | 'about' | 'look' | 'making' | 'pick' | 'polish' | 'finishing' | 'done'

const C = {
  sky: '#e6f4ff',
  ink: '#1d2654',
  soft: '#5b648f',
  card: '#ffffff',
  tomato: '#ff6b57',
  sun: '#ffc83d',
  grass: '#2fb672',
  grape: '#8a6cf3',
  ocean: '#2f9cf0',
  pink: '#ff7ab8',
}

const THINGS: { key: string; name: string; note: string; color: string }[] = [
  { key: 'flyer-letter', name: 'Flyer', note: 'to hang up', color: C.tomato },
  { key: 'postcard-6x4', name: 'Postcard', note: 'to send', color: C.ocean },
  { key: 'yard-sign', name: 'Sign', note: 'for outside', color: C.grass },
  { key: 'business-card', name: 'Card', note: 'to hand out', color: C.grape },
  { key: 'sticker-circle', name: 'Sticker', note: 'round', color: C.pink },
  { key: 'door-hanger', name: 'Door hanger', note: 'for doors', color: C.sun },
]

const IDEAS: { emoji: string; label: string; start: string }[] = [
  { emoji: '🍋', label: 'Lemonade stand', start: 'My lemonade stand' },
  { emoji: '🎂', label: 'Birthday party', start: 'My birthday party' },
  { emoji: '🐶', label: 'Lost pet', start: 'Lost pet! Please help find' },
  { emoji: '🧁', label: 'Bake sale', start: 'Bake sale' },
  { emoji: '🏷️', label: 'Yard sale', start: 'Yard sale' },
  { emoji: '🚗', label: 'Car wash', start: 'Car wash' },
  { emoji: '🎨', label: 'Art show', start: 'Come see my art show' },
  { emoji: '🐕', label: 'Dog walking', start: 'I can walk your dog' },
]

const LOOKS: { key: string; name: string; colors: string[]; style: string }[] = [
  { key: 'fun', name: 'Bright and fun', colors: ['#ff6b57', '#ffc83d', '#2fb672', '#2f9cf0'], style: 'Bright, cheerful and playful: bold rainbow colors, rounded friendly letters, fun shapes and doodles.' },
  { key: 'calm', name: 'Cool and calm', colors: ['#2f9cf0', '#6fd3c1', '#c9ecff', '#1d6f8f'], style: 'Calm and clean: blues and greens, soft shapes, simple and tidy with lots of space.' },
  { key: 'bold', name: 'Big and bold', colors: ['#111111', '#ffd400', '#ff3b30', '#ffffff'], style: 'Big and bold: black, yellow and red, huge chunky letters, very high contrast.' },
  { key: 'fancy', name: 'Fancy', colors: ['#1d2654', '#d4a94e', '#f4e9d0', '#7a2e3a'], style: 'Elegant and fancy: deep navy and gold, graceful lettering, classy and simple.' },
  { key: 'surprise', name: 'Surprise me', colors: ['#8a6cf3', '#ff7ab8', '#ffc83d', '#2fb672'], style: '' },
]

const POLISH: { emoji: string; label: string; ask: string }[] = [
  { emoji: '✨', label: 'Brighter', ask: 'Make the colors brighter and more cheerful. Keep everything else the same.' },
  { emoji: '🔠', label: 'Bigger words', ask: 'Make the main words bigger and easier to read from far away. Keep everything else the same.' },
  { emoji: '🖼️', label: 'New picture', ask: 'Replace the main picture with a different one that fits the same idea. Keep the words and colors.' },
  { emoji: '🎨', label: 'New colors', ask: 'Use a different, fun color scheme that still fits the idea. Keep the words and layout.' },
]

const MAKING_LINES = ['Mixing the colors…', 'Picking the letters…', 'Finding a great picture…', 'Adding the sparkle…', 'Almost there…']

/** "My lemonade stand this saturday at 2…" → "My lemonade stand this saturday". */
function shortName(text: string): string {
  const first = text.trim().split(/[.!?\n,]/)[0].trim()
  const words = first.split(/\s+/).filter(Boolean)
  const name = words.slice(0, 5).join(' ')
  return name ? name[0].toUpperCase() + name.slice(1) : ''
}

function Speak({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      className="w-12 h-12 rounded-full inline-flex items-center justify-center shrink-0 active:scale-95 transition-transform"
      style={{ background: C.card, color: C.ink, boxShadow: '0 3px 0 rgba(29,38,84,.15)' }}
      aria-label="Read it to me"
      title="Read it to me"
    >
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
        <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />
      </svg>
    </button>
  )
}

function Title({ children, say }: { children: string; say?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 text-center">
      <h1 className="text-[30px] sm:text-[40px] leading-tight font-semibold" style={{ color: C.ink }}>
        {children}
      </h1>
      <Speak text={say ?? children} />
    </div>
  )
}

/** A chunky button with a pressable bottom edge. */
function Big({
  children,
  onClick,
  color = C.grass,
  disabled,
  size = 'lg',
  light,
}: {
  children: React.ReactNode
  onClick: () => void
  color?: string
  disabled?: boolean
  size?: 'lg' | 'md'
  light?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${size === 'lg' ? 'h-[68px] px-8 text-[24px]' : 'h-14 px-5 text-[19px]'} rounded-[22px] font-semibold inline-flex items-center justify-center gap-2.5 active:translate-y-[3px] transition-transform disabled:opacity-40 disabled:active:translate-y-0`}
      style={{ background: light ? C.card : color, color: light ? C.ink : '#fff', boxShadow: `0 5px 0 ${light ? 'rgba(29,38,84,.18)' : 'rgba(0,0,0,.22)'}` }}
    >
      {children}
    </button>
  )
}

export function EasyMaker({ initialId }: { initialId: string | null }) {
  const { notify } = useNotice()
  const h = useDesign(initialId, { notify })
  const { design, ready, loadError } = h
  const [step, setStep] = useState<Step>('what')
  const [thing, setThing] = useState<string | null>(null)
  const [about, setAbout] = useState('')
  const [look, setLook] = useState<string | null>(null)
  const [photo, setPhoto] = useState<{ id: string; url: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const [changeText, setChangeText] = useState('')
  const [pointing, setPointing] = useState(false)
  const [painted, setPainted] = useState(false)
  const [lineIx, setLineIx] = useState(0)
  const [progress, setProgress] = useState(0)
  const [pickFrom, setPickFrom] = useState(0)
  const sheetRef = useRef<SheetHandle>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const dictationBase = useRef('')
  const dictation = useDictation((heard) => setAbout(`${dictationBase.current}${dictationBase.current && heard ? ' ' : ''}${heard}`))
  const changeBase = useRef('')
  const changeDictation = useDictation((heard) => setChangeText(`${changeBase.current}${changeBase.current && heard ? ' ' : ''}${heard}`))
  const [viewport, setViewport] = useState({ w: 1024, h: 768 })

  useEffect(() => {
    const read = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])

  // Opening a design that already has a page goes straight to polishing it.
  const opened = useRef(false)
  useEffect(() => {
    if (!ready || opened.current) return
    opened.current = true
    if (design?.pages[0]?.versions.length) {
      setStep('polish')
    }
  }, [ready, design])

  // The waiting screen keeps moving so a seven-year-old knows it's working.
  const making = step === 'making' || step === 'finishing'
  useEffect(() => {
    if (!making) return
    const started = Date.now()
    const t = setInterval(() => {
      const s = (Date.now() - started) / 1000
      setProgress(Math.min(0.94, 1 - Math.exp(-s / 18)))
      setLineIx(Math.floor(s / 6) % MAKING_LINES.length)
    }, 300)
    return () => {
      clearInterval(t)
      setProgress(0)
      setLineIx(0)
    }
  }, [making])

  const celebrate = useCallback(() => {
    const colors = [C.tomato, C.sun, C.grass, C.ocean, C.grape, C.pink]
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors, disableForReducedMotion: true })
  }, [])

  // ---- making it ----------------------------------------------------------
  const make = async () => {
    setError(null)
    setStep('making')
    try {
      let d: PrintDesign | null = design
      const lookStyle = LOOKS.find((l) => l.key === look)?.style ?? ''
      const prompt = [
        about.trim(),
        lookStyle && `Style: ${lookStyle}`,
        'This was written by a child: keep their idea and their words, fix only the spelling. Keep the words few and big so it reads from far away.',
      ]
        .filter(Boolean)
        .join('\n')
      if (!d) {
        const product = catalogProduct(thing ?? 'flyer-letter')!
        const res = await api<{ design: PrintDesign }>('/api/print/designs', {
          method: 'POST',
          json: { spec: product.spec, name: shortName(about) || `My ${product.name.toLowerCase()}` },
        })
        d = res.design
        h.adopt(d)
        window.history.replaceState(null, '', `/print/easy?d=${d.id}`)
      }
      h.setBrief({ prompt, quality: 'print', useLogo: false, useColors: false, useDetails: false })
      if (photo) {
        const b = await h.ensureBrand('My pictures')
        if (b && !b.data.assets.some((a) => a.id === photo.id)) {
          h.changeBrand({ ...b, data: { ...b.data, assets: [...b.data.assets, { id: photo.id, url: photo.url, note: 'my picture' }] } })
        }
        h.setBrief({ assetIds: [photo.id] })
      }
      const before = d.pages[0].versions.length
      const out = await h.render(0, 'create', { prompt, takes: 2 })
      if (!out.versions.length) throw new Error(out.errors[0] ?? 'It didn’t work.')
      setPickFrom(before)
      setStep(out.versions.length > 1 ? 'pick' : 'polish')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It didn’t work.')
      setStep('look')
    }
  }

  const polish = async (ask: string, mask?: string | null) => {
    setChanging(false)
    setPointing(false)
    setError(null)
    const out = await h.render(0, mask ? 'area' : 'edit', { prompt: ask, mask: mask ?? undefined })
    if (!out.versions.length) setError(out.errors[0] ?? 'That didn’t work. Try again!')
    sheetRef.current?.clearMask()
    setPainted(false)
    setChangeText('')
  }

  const finish = async () => {
    if (!design) return
    setStep('finishing')
    const page = design.pages[0]
    let v = page.versions[page.current]
    // Make sure it's checked, then quietly fix anything that wouldn't print right.
    const check = v.check ?? (await h.runCheck(0, v))
    const issues = (check?.issues ?? []).filter((i) => i.kind !== 'resolution' && i.severity === 'error')
    if (issues.length) {
      const out = await h.render(0, 'fix', { issues })
      if (out.versions[0]) v = out.versions[0]
    }
    setStep('done')
    celebrate()
  }

  const addPhoto = async (file: File) => {
    setUploading(true)
    try {
      const up = await uploadImage(file, 'asset')
      setPhoto({ id: shortId(), url: up.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That picture didn’t work.')
    } finally {
      setUploading(false)
    }
  }

  // ---- screens ------------------------------------------------------------
  if (loadError) {
    if (loadError.status === 401) return <SignInGate callbackUrl={initialId ? `/print/easy?d=${initialId}` : '/print/easy'} />
    return (
      <div className="h-full flex items-center justify-center p-6 text-center" style={{ background: C.sky, color: C.ink }}>
        <div>
          <p className="text-[22px]">We couldn’t find that one.</p>
          <Link href="/print/easy" className="underline text-[18px]">Make something new</Link>
        </div>
      </div>
    )
  }

  const product = catalogProduct(design?.spec.id ?? thing ?? 'flyer-letter')
  const thingName = (THINGS.find((t) => t.key === (design?.spec.id ?? thing))?.name ?? product?.name ?? 'thing').toLowerCase()
  const page = design?.pages[0]
  const version = page ? page.versions[page.current] : null
  const busy = !!h.pending[0]
  const sheetW = design ? Math.min(viewport.w - 48, 520, ((viewport.h - 330) * design.spec.widthIn) / design.spec.heightIn) : 300

  const back = (to: Step) => (
    <button type="button" onClick={() => setStep(to)} className="text-[18px] font-medium px-3 h-12 rounded-full" style={{ color: C.soft }}>
      ← Back
    </button>
  )

  return (
    <div className="print-easy h-full overflow-y-auto" style={{ background: C.sky, color: C.ink, fontFamily: 'var(--font-easy), var(--font-print), ui-rounded, system-ui, sans-serif' }}>
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4">
        <Link href="/print" className="text-[15px] font-medium" style={{ color: C.soft }}>
          Print studio
        </Link>
        <SurfaceSwitch current="easy" designId={design?.id ?? null} tone="light" />
      </header>

      <main className="max-w-[980px] mx-auto px-4 sm:px-6 pb-16 pt-6 sm:pt-10">
        {step === 'what' && (
          <section className="space-y-8">
            <Title>What do you want to make?</Title>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5">
              {THINGS.map((t) => {
                const p = catalogProduct(t.key)!
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setThing(t.key)
                      setStep('about')
                    }}
                    className="rounded-[28px] p-5 flex flex-col items-center gap-3 active:translate-y-[3px] transition-transform"
                    style={{ background: t.color, boxShadow: '0 6px 0 rgba(0,0,0,.18)' }}
                  >
                    <span className="w-full h-[110px] sm:h-[130px] rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,.22)' }}>
                      <ProductGlyph spec={p.spec} box={104} active />
                    </span>
                    <span className="text-[24px] sm:text-[26px] font-semibold text-white leading-none">{t.name}</span>
                    <span className="text-[16px] text-white/90 -mt-1">{t.note}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {step === 'about' && (
          <section className="space-y-7 max-w-[760px] mx-auto">
            <Title say={`What is your ${thingName} about? Tap the microphone and tell me.`}>{`What is your ${thingName} about?`}</Title>
            <div className="rounded-[28px] p-4 sm:p-5" style={{ background: C.card, boxShadow: '0 6px 0 rgba(29,38,84,.1)' }}>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                rows={3}
                placeholder={dictation.listening ? 'I’m listening…' : 'Tell me what it’s for, when and where'}
                className="w-full resize-none bg-transparent outline-none text-[24px] leading-snug placeholder:text-[#a3aacb]"
                style={{ color: C.ink }}
                aria-label={`What your ${thingName} is about`}
              />
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {dictation.supported && (
                  <button
                    type="button"
                    onClick={() => {
                      dictationBase.current = about
                      dictation.toggle()
                    }}
                    className="h-16 px-6 rounded-full inline-flex items-center gap-3 text-[20px] font-semibold active:scale-95 transition-transform"
                    style={{ background: dictation.listening ? C.tomato : C.ocean, color: '#fff', boxShadow: '0 4px 0 rgba(0,0,0,.2)' }}
                    aria-pressed={dictation.listening}
                  >
                    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
                      <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" />
                    </svg>
                    {dictation.listening ? 'Stop' : 'Tap and talk'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => photoInput.current?.click()}
                  disabled={uploading}
                  className="h-16 px-5 rounded-full inline-flex items-center gap-3 text-[20px] font-semibold border-2 active:scale-95 transition-transform disabled:opacity-50"
                  style={{ borderColor: '#d6dcf3', color: C.ink }}
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb(photo.url, 120)} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <span aria-hidden>📷</span>
                  )}
                  {uploading ? 'Adding…' : photo ? 'Change picture' : 'Add a picture'}
                </button>
                <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addPhoto(f) }} />
              </div>
            </div>
            {!about && (
              <div>
                <p className="text-center text-[18px] mb-3" style={{ color: C.soft }}>
                  Or pick one to start
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {IDEAS.map((idea) => (
                    <button
                      key={idea.label}
                      type="button"
                      onClick={() => setAbout(`${idea.start} `)}
                      className="h-14 px-5 rounded-full text-[19px] font-medium inline-flex items-center gap-2 active:scale-95 transition-transform"
                      style={{ background: C.card, color: C.ink, boxShadow: '0 3px 0 rgba(29,38,84,.12)' }}
                    >
                      <span className="text-[24px]" aria-hidden>
                        {idea.emoji}
                      </span>
                      {idea.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {about.trim() && about.trim().split(/\s+/).length < 6 && (
              <p className="text-center text-[19px]" style={{ color: C.soft }}>
                Add when and where, so people can come!
              </p>
            )}
            <div className="flex items-center justify-between">
              {back('what')}
              <Big onClick={() => setStep('look')} disabled={about.trim().length < 3}>
                Next →
              </Big>
            </div>
          </section>
        )}

        {step === 'look' && (
          <section className="space-y-8 max-w-[860px] mx-auto">
            <Title>How should it look?</Title>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {LOOKS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setLook(l.key)}
                  aria-pressed={look === l.key}
                  className="rounded-[26px] p-3 pb-4 flex flex-col gap-3 active:translate-y-[3px] transition-transform"
                  style={{
                    background: C.card,
                    boxShadow: look === l.key ? `0 0 0 5px ${C.ink}, 0 6px 0 rgba(29,38,84,.15)` : '0 6px 0 rgba(29,38,84,.12)',
                  }}
                >
                  <span className="h-24 rounded-[18px] overflow-hidden flex">
                    {l.key === 'surprise' ? (
                      <span className="flex-1 flex items-center justify-center text-[44px]" style={{ background: 'conic-gradient(from 0deg, #ff6b57, #ffc83d, #2fb672, #2f9cf0, #8a6cf3, #ff7ab8, #ff6b57)' }} aria-hidden>
                        ?
                      </span>
                    ) : (
                      l.colors.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)
                    )}
                  </span>
                  <span className="text-[21px] font-semibold text-center" style={{ color: C.ink }}>
                    {l.name}
                  </span>
                </button>
              ))}
            </div>
            {error && (
              <p className="text-center text-[19px]" style={{ color: C.tomato }}>
                Oops — {error}
              </p>
            )}
            <div className="flex items-center justify-between">
              {back('about')}
              <Big onClick={make} disabled={!look}>
                Make it! ✨
              </Big>
            </div>
          </section>
        )}

        {making && (
          <section className="min-h-[60vh] flex flex-col items-center justify-center gap-8 text-center">
            <div className="flex gap-3" aria-hidden>
              {[C.tomato, C.sun, C.grass, C.ocean, C.grape].map((c, i) => (
                <span key={c} className="w-6 h-6 rounded-full animate-bounce" style={{ background: c, animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
            <Title say={step === 'making' ? `Making your ${thingName}!` : 'Getting it ready to print!'}>
              {step === 'making' ? `Making your ${thingName}!` : 'Getting it ready to print!'}
            </Title>
            <p className="text-[22px]" style={{ color: C.soft }} aria-live="polite">
              {MAKING_LINES[lineIx]}
            </p>
            <div className="w-full max-w-[460px] h-6 rounded-full overflow-hidden" style={{ background: '#fff' }} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${C.grass}, ${C.ocean})` }} />
            </div>
          </section>
        )}

        {step === 'pick' && design && page && (
          <section className="space-y-8">
            <Title>Tap the one you like best!</Title>
            <div className="flex flex-wrap justify-center gap-6">
              {page.versions.slice(pickFrom).map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    h.selectVersion(0, pickFrom + i)
                    setStep('polish')
                  }}
                  className="rounded-[24px] p-3 active:translate-y-[3px] transition-transform"
                  style={{ background: C.card, boxShadow: '0 6px 0 rgba(29,38,84,.14)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb(v.url, 700)} alt={`Choice ${i + 1}`} className="block rounded-xl" style={{ height: Math.min(460, viewport.h - 300), width: 'auto' }} />
                  <span className="block text-[21px] font-semibold mt-3">This one!</span>
                </button>
              ))}
            </div>
            <div className="text-center">
              <Big size="md" light onClick={make}>
                🔄 Show me two more
              </Big>
            </div>
          </section>
        )}

        {step === 'polish' && design && page && (
          <section className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-8">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-[20px] p-3" style={{ background: C.card, boxShadow: '0 6px 0 rgba(29,38,84,.12)' }}>
                <Sheet
                  ref={sheetRef}
                  spec={design.spec}
                  version={version}
                  width={Math.max(220, Math.round(sheetW))}
                  showGuides={false}
                  pending={h.pending[0] ?? null}
                  brush={pointing ? 'paint' : 'off'}
                  brushSize={56}
                  onMaskChange={setPainted}
                />
              </div>
              {pointing && (
                <p className="text-[19px] text-center" style={{ color: C.soft }}>
                  Color over the part you want to change
                </p>
              )}
            </div>

            <div className="w-full max-w-[400px] space-y-5">
              <Title say="Want to change anything? Tap a button, or press I'm done.">Want to change anything?</Title>
              {error && (
                <p className="text-center text-[18px]" style={{ color: C.tomato }}>
                  Oops — {error}
                </p>
              )}
              {!changing ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {POLISH.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        disabled={busy}
                        onClick={() => polish(p.ask)}
                        className="h-[84px] rounded-[22px] flex flex-col items-center justify-center gap-0.5 text-[19px] font-semibold active:translate-y-[3px] transition-transform disabled:opacity-40"
                        style={{ background: C.card, color: C.ink, boxShadow: '0 5px 0 rgba(29,38,84,.14)' }}
                      >
                        <span className="text-[28px] leading-none" aria-hidden>
                          {p.emoji}
                        </span>
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setChanging(true)}
                      className="h-[84px] rounded-[22px] flex flex-col items-center justify-center gap-0.5 text-[19px] font-semibold active:translate-y-[3px] transition-transform disabled:opacity-40"
                      style={{ background: C.card, color: C.ink, boxShadow: '0 5px 0 rgba(29,38,84,.14)' }}
                    >
                      <span className="text-[28px] leading-none" aria-hidden>
                        ✏️
                      </span>
                      Something else
                    </button>
                    <button
                      type="button"
                      disabled={busy || page.current === 0}
                      onClick={() => h.selectVersion(0, page.current - 1)}
                      className="h-[84px] rounded-[22px] flex flex-col items-center justify-center gap-0.5 text-[19px] font-semibold active:translate-y-[3px] transition-transform disabled:opacity-40"
                      style={{ background: C.card, color: C.ink, boxShadow: '0 5px 0 rgba(29,38,84,.14)' }}
                    >
                      <span className="text-[28px] leading-none" aria-hidden>
                        ↩️
                      </span>
                      Go back
                    </button>
                  </div>
                  <div className="flex justify-center pt-2">
                    <Big onClick={finish} disabled={busy}>
                      I’m done! 🎉
                    </Big>
                  </div>
                </>
              ) : (
                <div className="rounded-[24px] p-4 space-y-3" style={{ background: C.card, boxShadow: '0 6px 0 rgba(29,38,84,.12)' }}>
                  <textarea
                    value={changeText}
                    onChange={(e) => setChangeText(e.target.value)}
                    rows={2}
                    placeholder={changeDictation.listening ? 'I’m listening…' : 'What should change?'}
                    className="w-full resize-none bg-transparent outline-none text-[22px] leading-snug placeholder:text-[#a3aacb]"
                    style={{ color: C.ink }}
                    aria-label="What should change"
                  />
                  <div className="flex flex-wrap gap-2.5">
                    {changeDictation.supported && (
                      <button
                        type="button"
                        onClick={() => {
                          changeBase.current = changeText
                          changeDictation.toggle()
                        }}
                        className="h-14 px-5 rounded-full text-[18px] font-semibold inline-flex items-center gap-2"
                        style={{ background: changeDictation.listening ? C.tomato : C.ocean, color: '#fff' }}
                      >
                        🎤 {changeDictation.listening ? 'Stop' : 'Talk'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPointing((p) => !p)
                        if (pointing) {
                          sheetRef.current?.clearMask()
                          setPainted(false)
                        }
                      }}
                      aria-pressed={pointing}
                      className="h-14 px-5 rounded-full text-[18px] font-semibold border-2"
                      style={{ borderColor: pointing ? C.pink : '#d6dcf3', background: pointing ? '#ffe3f0' : 'transparent', color: C.ink }}
                    >
                      👆 {pointing ? (painted ? 'Got it!' : 'Show me where') : 'Show me where'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setChanging(false)
                        setPointing(false)
                        sheetRef.current?.clearMask()
                        setPainted(false)
                      }}
                      className="text-[18px] px-2 h-12"
                      style={{ color: C.soft }}
                    >
                      Never mind
                    </button>
                    <Big size="md" disabled={!changeText.trim() || busy} onClick={() => polish(changeText.trim(), painted ? sheetRef.current?.maskPng() : null)}>
                      Do it!
                    </Big>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {step === 'done' && design && page && version && (
          <section className="flex flex-col items-center gap-7 text-center">
            <Title say="It's ready! You made it!">It’s ready! You made it!</Title>
            <div className="rounded-[20px] p-3" style={{ background: C.card, boxShadow: '0 6px 0 rgba(29,38,84,.12)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb(version.url, 900)} alt={`Your ${thingName}`} className="block rounded-xl" style={{ height: Math.min(440, viewport.h - 340), width: 'auto' }} />
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              <Big onClick={() => downloadPrintPdf(design).catch(() => setError('The download didn’t work.'))} color={C.ocean}>
                🖨️ Get it to print
              </Big>
              <Big onClick={() => downloadPageJpg(design, 0).catch(() => setError('The download didn’t work.'))} light>
                🖼️ Save the picture
              </Big>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Big size="md" light onClick={() => setStep('polish')}>
                ✏️ Change it more
              </Big>
              <Big size="md" light onClick={() => (window.location.href = '/print/easy')}>
                ⭐ Make something new
              </Big>
            </div>
            {error && (
              <p className="text-[18px]" style={{ color: C.tomato }}>
                {error}
              </p>
            )}
          </section>
        )}

        {!ready && step === 'what' && (
          <p className="text-center text-[18px] mt-6" style={{ color: C.soft }}>
            Getting ready…
          </p>
        )}
      </main>
    </div>
  )
}
