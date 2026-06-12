'use client';

// Wildwood — React shell: start screen, HUD, field journal, and event modals.
// The world itself lives on a single <canvas> driven by game.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type GameEvent } from './game';
import { paintBirdCard, paintFishCard } from './render';
import {
  BIRDS,
  BIRD_BY_ID,
  FISH,
  FISH_BY_ID,
  STRUCTURES,
  type BirdSpecies,
} from './species';
import type { Nest, QuizState } from './types';

// ---- shared bits ---------------------------------------------------------------

const paper = '#f3ecd9';
const ink = '#2e2b22';
const moss = '#3d5438';
const gold = '#c9a227';

function BirdArt({ id, w = 150, h = 120, silhouette = false }: { id: string; w?: number; h?: number; silhouette?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) paintBirdCard(ref.current, id, silhouette);
  }, [id, silhouette]);
  return <canvas ref={ref} width={w * 2} height={h * 2} style={{ width: w, height: h }} />;
}

function FishArt({ id, w = 180, h = 90, silhouette = false }: { id: string; w?: number; h?: number; silhouette?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) paintFishCard(ref.current, id, silhouette);
  }, [id, silhouette]);
  return <canvas ref={ref} width={w * 2} height={h * 2} style={{ width: w, height: h }} />;
}

function timeLabel(t: number): { label: string; icon: string } {
  if (t < 0.18) return { label: 'deep night', icon: '🌙' };
  if (t < 0.27) return { label: 'dawn', icon: '🌅' };
  if (t < 0.45) return { label: 'morning', icon: '🌤️' };
  if (t < 0.62) return { label: 'midday', icon: '☀️' };
  if (t < 0.76) return { label: 'afternoon', icon: '🌞' };
  if (t < 0.88) return { label: 'evening', icon: '🌇' };
  return { label: 'night', icon: '🌙' };
}

const RARITY_LABEL = { 1: 'common', 2: 'uncommon', 3: 'rare' } as const;

// ---- modal frame -----------------------------------------------------------------

function Card({ children, onClose, wide = false }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ background: 'rgba(18,24,16,0.55)' }} onClick={onClose}>
      <div
        className={`relative ${wide ? 'max-w-2xl' : 'max-w-md'} w-full rounded-lg shadow-2xl overflow-hidden wf-pop`}
        style={{ background: paper, color: ink, border: `1px solid #cdbf9b`, boxShadow: '0 24px 70px rgba(0,0,0,0.55)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 pointer-events-none wf-grain" />
        {children}
      </div>
    </div>
  );
}

function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center text-lg leading-none hover:bg-black/10"
      style={{ color: ink }}
      aria-label="Close"
    >
      ×
    </button>
  );
}

// =====================================================================================

export default function Wildwood() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ seeds: 0, day: 1, t: 0.22, muted: false, mode: 'explore', nearWater: false, fishing: false });
  const [toasts, setToasts] = useState<{ id: number; msg: string; icon?: string }[]>([]);
  const [discover, setDiscover] = useState<{ speciesId: string; how: 'seen' | 'heard' } | null>(null);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [quizResult, setQuizResult] = useState<null | { correct: boolean; speciesId: string }>(null);
  const [caught, setCaught] = useState<{ fishId: string; len: number; isNew: boolean; isRecord: boolean } | null>(null);
  const [nestFound, setNestFound] = useState<Nest | null>(null);
  const [fledge, setFledge] = useState<string | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const toastId = useRef(0);

  const pushToast = useCallback((msg: string, icon?: string) => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts.slice(-3), { id, msg, icon }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 4200);
  }, []);

  const start = useCallback(() => {
    if (!canvasRef.current || gameRef.current) return;
    const game = new Game(canvasRef.current);
    gameRef.current = game;
    game.audio.init();
    game.on((e: GameEvent) => {
      switch (e.kind) {
        case 'toast':
          pushToast(e.msg, e.icon);
          break;
        case 'discover':
          if (e.isNew && e.how === 'seen') setDiscover({ speciesId: e.speciesId, how: 'seen' });
          break;
        case 'quiz':
          setQuizResult(null);
          setQuiz(e.quiz);
          break;
        case 'catch':
          setCaught(e);
          break;
        case 'nest':
          setNestFound(e.nest);
          break;
        case 'fledge':
          setFledge(e.speciesId);
          break;
        case 'hud':
          break;
      }
    });
    setStarted(true);
  }, [pushToast]);

  // HUD polling (cheap)
  useEffect(() => {
    if (!started) return;
    const iv = setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      setHud({
        seeds: g.s.seeds,
        day: g.s.time.day,
        t: g.s.time.t,
        muted: g.s.muted,
        mode: g.s.mode,
        nearWater: g.s.hintFish,
        fishing: !!g.s.fishing,
      });
    }, 400);
    return () => clearInterval(iv);
  }, [started]);

  useEffect(() => () => gameRef.current?.destroy(), []);

  // pause the sim while any overlay is up
  const anyModal = !!(discover || quiz || caught || nestFound || fledge || journalOpen || buildOpen || helpOpen);
  useEffect(() => {
    gameRef.current?.setPaused(anyModal);
  }, [anyModal]);

  const g = gameRef.current;
  const tl = timeLabel(hud.t);

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden select-none" style={{ background: '#16301c', fontFamily: 'var(--font-spectral), Georgia, serif' }}>
      <style>{`
        .wf-pop { animation: wfPop .28s cubic-bezier(.2,1.4,.4,1); }
        @keyframes wfPop { from { transform: scale(.92) translateY(10px); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .wf-rise { animation: wfRise .35s ease-out; }
        @keyframes wfRise { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .wf-grain { background-image: radial-gradient(rgba(90,70,30,0.05) 1px, transparent 1px); background-size: 3px 3px; }
        .wf-title { letter-spacing: 0.04em; }
        .wf-btn { transition: transform .12s ease, box-shadow .12s ease; }
        .wf-btn:hover { transform: translateY(-1px); }
        .wf-btn:active { transform: translateY(1px) scale(.98); }
        @keyframes wfFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
        @keyframes wfShimmer { 0%,100% { opacity: .65; } 50% { opacity: 1; } }
      `}</style>

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" style={{ cursor: hud.mode === 'bino' ? 'none' : 'pointer' }} />

      {/* ---------- START SCREEN ---------- */}
      {!started && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center text-center px-6"
          style={{
            background:
              'radial-gradient(ellipse at 50% 110%, #2a4a2c 0%, #1b3320 45%, #10220f 100%)',
          }}
        >
          <div className="wf-rise" style={{ animation: 'wfFloat 5s ease-in-out infinite' }}>
            <div className="text-6xl mb-2">🦜</div>
          </div>
          <h1
            className="wf-title text-6xl sm:text-7xl font-semibold mb-3"
            style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', color: paper, textShadow: '0 4px 30px rgba(0,0,0,.6)' }}
          >
            Wildwood
          </h1>
          <p className="text-lg sm:text-xl mb-1" style={{ color: '#cfe0b8' }}>
            a valley of birdsong &amp; still water
          </p>
          <p className="text-sm mb-10 italic" style={{ color: '#8fae7e' }}>
            for two people who like to watch, listen, and wait
          </p>
          <button
            onClick={start}
            className="wf-btn px-10 py-4 rounded-full text-lg font-semibold"
            style={{ background: gold, color: '#241d08', boxShadow: '0 10px 36px rgba(201,162,39,0.4)' }}
          >
            Step outside →
          </button>
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-x-10 gap-y-3 text-sm max-w-2xl" style={{ color: '#a8c294' }}>
            <div>🚶 <b>WASD</b> / click to wander</div>
            <div>🔭 <b>B</b> — raise binoculars</div>
            <div>🎣 <b>F</b> — fish at the water</div>
            <div>❓ tap a gold ring to ID a song</div>
          </div>
          <p className="mt-10 text-xs" style={{ color: '#5d7a52' }}>
            headphones recommended — every bird in the valley really sings
          </p>
        </div>
      )}

      {started && (
        <>
          {/* ---------- TOP HUD ---------- */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between p-3 sm:p-4 pointer-events-none">
            <div
              className="pointer-events-auto rounded-full px-4 py-2 flex items-center gap-2 text-sm"
              style={{ background: 'rgba(20,28,18,0.78)', color: paper, backdropFilter: 'blur(6px)' }}
            >
              <span>{tl.icon}</span>
              <span style={{ fontFamily: 'var(--font-fraunces)' }}>
                Day {hud.day} · {tl.label}
              </span>
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <div
                className="rounded-full px-4 py-2 text-sm flex items-center gap-1.5"
                style={{ background: 'rgba(20,28,18,0.78)', color: '#ffe9a8', backdropFilter: 'blur(6px)' }}
              >
                🌰 <b>{hud.seeds}</b>
              </div>
              <HudButton label="Journal" icon="📔" onClick={() => { g?.audio.uiOpen(); setJournalOpen(true); }} />
              <HudButton label="Build" icon="🌻" onClick={() => { g?.audio.uiOpen(); setBuildOpen(true); }} />
              <HudButton label={hud.muted ? 'Unmute' : 'Mute'} icon={hud.muted ? '🔇' : '🔊'} onClick={() => g?.setMuted(!hud.muted)} />
              <HudButton label="Help" icon="？" onClick={() => setHelpOpen(true)} />
            </div>
          </div>

          {/* ---------- BOTTOM HUD ---------- */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex items-end justify-between p-3 sm:p-4 pointer-events-none">
            <div
              className="rounded-full px-4 py-1.5 text-xs hidden sm:block"
              style={{ background: 'rgba(20,28,18,0.6)', color: '#b8cba6' }}
            >
              {hud.mode === 'bino'
                ? 'steady… hold the lens on a bird to identify it · B to lower'
                : hud.fishing
                  ? 'watch the bobber… SPACE or tap when it strikes! · F to give up'
                  : hud.mode === 'build'
                    ? 'click open ground near the cabin to place it · Esc to cancel'
                    : hud.nearWater
                      ? 'B — binoculars · F — cast a line 🎣'
                      : 'B — binoculars · walk softly, birds startle'}
            </div>
            {/* action buttons (handy on touch) */}
            <div className="pointer-events-auto flex gap-2 ml-auto">
              <ActionButton
                active={hud.mode === 'bino'}
                icon="🔭"
                label="Binoculars"
                onClick={() => g?.toggleBinoculars()}
              />
              <ActionButton
                active={hud.fishing}
                icon="🎣"
                label="Fish"
                onClick={() => g?.actionFish()}
                glow={hud.nearWater && !hud.fishing}
              />
            </div>
          </div>

          {/* ---------- TOASTS ---------- */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="wf-rise rounded-full px-4 py-2 text-sm shadow-lg"
                style={{ background: 'rgba(243,236,217,0.95)', color: ink, border: '1px solid #cdbf9b' }}
              >
                {t.icon && <span className="mr-1.5">{t.icon}</span>}
                {t.msg}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---------- NEW SPECIES CARD ---------- */}
      {discover && (
        <SpeciesCard
          sp={BIRD_BY_ID[discover.speciesId]}
          how={discover.how}
          onPlay={() => g?.playPreview(discover.speciesId)}
          onClose={() => setDiscover(null)}
        />
      )}

      {/* ---------- SONG QUIZ ---------- */}
      {quiz && (
        <Card onClose={() => { setQuiz(null); setQuizResult(null); }} wide>
          <CloseBtn onClose={() => { setQuiz(null); setQuizResult(null); }} />
          <div className="p-6">
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: moss }}>
              song identification
            </p>
            <h2 className="text-3xl mb-1" style={{ fontFamily: 'var(--font-fraunces)' }}>
              Who&apos;s singing?
            </h2>
            {!quizResult && (
              <>
                <button
                  onClick={() => g?.replayQuizSong(quiz)}
                  className="wf-btn mt-2 mb-5 px-4 py-2 rounded-full text-sm font-semibold"
                  style={{ background: moss, color: paper }}
                >
                  ▶ play the song again
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {quiz.options.map((id) => {
                    const sp = BIRD_BY_ID[id];
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          const ok = g!.answerQuiz(quiz, id);
                          setQuizResult({ correct: ok, speciesId: quiz.speciesId });
                        }}
                        className="wf-btn rounded-lg p-3 text-center border"
                        style={{ borderColor: '#cdbf9b', background: '#faf5e6' }}
                      >
                        <BirdArt id={id} w={120} h={92} />
                        <div className="text-sm font-semibold mt-1">{sp.name}</div>
                        <div className="text-xs italic opacity-70">{sp.songHint}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {quizResult && (
              <div className="mt-3 text-center">
                <div className="text-5xl mb-2">{quizResult.correct ? '🎉' : '🤫'}</div>
                <p className="text-xl mb-1" style={{ fontFamily: 'var(--font-fraunces)' }}>
                  {quizResult.correct
                    ? `Yes! That's the ${BIRD_BY_ID[quizResult.speciesId].name}.`
                    : 'Not this time — the singer slipped away.'}
                </p>
                {quizResult.correct && (
                  <>
                    <div className="flex justify-center my-2">
                      <BirdArt id={quizResult.speciesId} w={170} h={120} />
                    </div>
                    <p className="text-sm max-w-md mx-auto opacity-85">{BIRD_BY_ID[quizResult.speciesId].fact}</p>
                    <p className="text-sm mt-2 font-semibold" style={{ color: moss }}>
                      logged as <i>heard</i> in your journal · +8 🌰
                    </p>
                  </>
                )}
                {!quizResult.correct && (
                  <p className="text-sm opacity-75">Listen again next time it sings — you&apos;ll get it.</p>
                )}
                <button
                  onClick={() => { setQuiz(null); setQuizResult(null); }}
                  className="wf-btn mt-4 px-6 py-2 rounded-full font-semibold"
                  style={{ background: moss, color: paper }}
                >
                  back to the valley
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ---------- CATCH CARD ---------- */}
      {caught && (
        <Card onClose={() => setCaught(null)}>
          <CloseBtn onClose={() => setCaught(null)} />
          <div className="p-6 text-center">
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: moss }}>
              {caught.isNew ? '✨ first catch — new species!' : caught.isRecord ? '🏆 new personal record!' : 'a fine catch'}
            </p>
            <h2 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-fraunces)' }}>
              {FISH_BY_ID[caught.fishId].name}
            </h2>
            <div className="flex justify-center my-1" style={{ animation: 'wfFloat 3s ease-in-out infinite' }}>
              <FishArt id={caught.fishId} w={230} h={110} />
            </div>
            <div className="text-2xl font-bold mb-2" style={{ color: moss }}>
              {caught.len}&quot; <span className="text-sm font-normal opacity-70">· {RARITY_LABEL[FISH_BY_ID[caught.fishId].rarity]}</span>
            </div>
            <p className="text-sm italic opacity-70 mb-2">{FISH_BY_ID[caught.fishId].sci}</p>
            <p className="text-sm opacity-90 max-w-sm mx-auto">{FISH_BY_ID[caught.fishId].fact}</p>
            <button onClick={() => setCaught(null)} className="wf-btn mt-5 px-6 py-2 rounded-full font-semibold" style={{ background: moss, color: paper }}>
              release it gently 🌊
            </button>
          </div>
        </Card>
      )}

      {/* ---------- NEST DISCOVERED ---------- */}
      {nestFound && (
        <Card onClose={() => setNestFound(null)}>
          <CloseBtn onClose={() => setNestFound(null)} />
          <div className="p-6 text-center">
            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: moss }}>
              🪺 nest discovered · +15 🌰
            </p>
            <h2 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-fraunces)' }}>
              {BIRD_BY_ID[nestFound.species].name}
            </h2>
            <div className="flex justify-center my-2">
              <BirdArt id={nestFound.species} w={170} h={120} />
            </div>
            <p className="text-sm opacity-90 max-w-sm mx-auto">
              {nestFound.stage === 'building' && 'The pair is still weaving it — grass, twigs, and patience. Check back over the coming days.'}
              {nestFound.stage === 'eggs' && 'There are eggs inside! Keep your distance and visit again — they\'ll hatch soon.'}
              {nestFound.stage === 'chicks' && 'Hungry chicks! Tiny beaks gaping skyward. They\'ll fledge in a day or two.'}
              {nestFound.stage === 'fledged' && 'The young have already flown — an empty cup, a finished story.'}
            </p>
            <p className="text-xs italic mt-3 opacity-60">It stays marked in your world — watch the whole story unfold.</p>
            <button onClick={() => setNestFound(null)} className="wf-btn mt-4 px-6 py-2 rounded-full font-semibold" style={{ background: moss, color: paper }}>
              leave them be 🤍
            </button>
          </div>
        </Card>
      )}

      {/* ---------- FLEDGE CELEBRATION ---------- */}
      {fledge && (
        <Card onClose={() => setFledge(null)}>
          <CloseBtn onClose={() => setFledge(null)} />
          <div className="p-6 text-center">
            <div className="text-5xl mb-2">🐦‍⬛✨</div>
            <h2 className="text-3xl mb-2" style={{ fontFamily: 'var(--font-fraunces)' }}>
              They fledged!
            </h2>
            <p className="text-sm opacity-90 max-w-sm mx-auto">
              The young {BIRD_BY_ID[fledge].name}s left the nest this morning. You watched the whole thing happen — from first twig to first flight. +25 🌰
            </p>
            <button onClick={() => setFledge(null)} className="wf-btn mt-5 px-6 py-2 rounded-full font-semibold" style={{ background: moss, color: paper }}>
              wonderful 🌿
            </button>
          </div>
        </Card>
      )}

      {/* ---------- FIELD JOURNAL ---------- */}
      {journalOpen && g && <Journal game={g} onClose={() => setJournalOpen(false)} />}

      {/* ---------- BUILD MENU ---------- */}
      {buildOpen && g && (
        <BuildMenu
          game={g}
          seeds={hud.seeds}
          onPick={(id) => {
            setBuildOpen(false);
            g.enterBuildMode(id);
            pushToast('Click open ground near the cabin to place it', '📍');
          }}
          onClose={() => setBuildOpen(false)}
        />
      )}

      {/* ---------- HELP ---------- */}
      {helpOpen && (
        <Card onClose={() => setHelpOpen(false)} wide>
          <CloseBtn onClose={() => setHelpOpen(false)} />
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-3xl mb-3" style={{ fontFamily: 'var(--font-fraunces)' }}>
              A field guide to Wildwood
            </h2>
            <div className="space-y-3 text-sm leading-relaxed">
              <p>🚶 <b>Wander.</b> WASD / arrow keys, or click (tap) anywhere to walk. The valley has a lake, a river, marshes, meadows, and deep woods — different birds live in each, and different ones wake at dawn, day, dusk, and night.</p>
              <p>🔭 <b>Watch.</b> Press <b>B</b> to raise your binoculars, hold the lens steady on a bird until the ring fills, and it joins your journal. Move slowly — get too close, or rush, and birds flush.</p>
              <p>🎵 <b>Listen.</b> Every species really sings (headphones!). When an unknown bird sings, a gold <b>?</b> ring appears — tap it and pick who you think is singing, Merlin-style. Identifying by ear logs the bird as <i>heard</i>.</p>
              <p>🎣 <b>Fish.</b> Press <b>F</b> at the water&apos;s edge. When the bobber plunges — strike! Then hold to reel, easing off before the line snaps. The river holds trout; the deep lake holds the big ones; dusk and night change what bites.</p>
              <p>🌻 <b>Attract.</b> Identifications and catches earn <b>seeds 🌰</b>. Spend them on feeders, a bird bath, berry bushes, and nest boxes around your cabin — each draws different species to you.</p>
              <p>🪺 <b>Nests.</b> Once you know a species well, pairs may start nesting. Scan the trees with binoculars for a glint, find the nest, and follow it: building → eggs → chicks → first flight.</p>
              <p className="italic opacity-70">The valley saves itself on this device as you play. Come back at a different hour — dawn chorus is around first light, owls own the dark.</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---- HUD bits -------------------------------------------------------------------

function HudButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="wf-btn w-10 h-10 rounded-full flex items-center justify-center text-lg"
      style={{ background: 'rgba(20,28,18,0.78)', backdropFilter: 'blur(6px)' }}
    >
      {icon}
    </button>
  );
}

function ActionButton({ icon, label, onClick, active, glow }: { icon: string; label: string; onClick: () => void; active?: boolean; glow?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="wf-btn w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg"
      style={{
        background: active ? gold : 'rgba(243,236,217,0.92)',
        boxShadow: glow ? `0 0 22px 4px rgba(201,162,39,0.55)` : '0 6px 18px rgba(0,0,0,0.4)',
        animation: glow ? 'wfShimmer 1.6s ease-in-out infinite' : undefined,
      }}
    >
      {icon}
    </button>
  );
}

// ---- species card ------------------------------------------------------------------

function SpeciesCard({ sp, how, onPlay, onClose }: { sp: BirdSpecies; how: 'seen' | 'heard'; onPlay: () => void; onClose: () => void }) {
  return (
    <Card onClose={onClose}>
      <CloseBtn onClose={onClose} />
      <div className="p-6 text-center">
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: moss }}>
          ✨ new species · {how} · +{how === 'seen' ? 12 : 10} 🌰
        </p>
        <h2 className="text-3xl mb-0.5" style={{ fontFamily: 'var(--font-fraunces)' }}>
          {sp.name}
        </h2>
        <p className="text-sm italic opacity-65 mb-1">{sp.sci}</p>
        <p className="text-xs mb-2 uppercase tracking-wide opacity-60">{RARITY_LABEL[sp.rarity]} · {sp.habitats.join(' · ')}</p>
        <div className="flex justify-center my-1" style={{ animation: 'wfFloat 3.5s ease-in-out infinite' }}>
          <BirdArt id={sp.id} w={190} h={140} />
        </div>
        <p className="text-sm opacity-90 leading-relaxed">{sp.fact}</p>
        <button
          onClick={onPlay}
          className="wf-btn mt-4 mr-2 px-4 py-2 rounded-full text-sm font-semibold"
          style={{ background: '#e9e0c6', color: ink, border: '1px solid #cdbf9b' }}
        >
          ▶ {sp.songHint}
        </button>
        <button onClick={onClose} className="wf-btn mt-4 px-6 py-2 rounded-full text-sm font-semibold" style={{ background: moss, color: paper }}>
          add to journal 📔
        </button>
      </div>
    </Card>
  );
}

// ---- field journal -------------------------------------------------------------------

function Journal({ game, onClose }: { game: Game; onClose: () => void }) {
  const [tab, setTab] = useState<'birds' | 'fish' | 'nests'>('birds');
  const [detail, setDetail] = useState<string | null>(null);
  const j = game.s.journal;
  const fr = game.s.fishRecords;
  const seenCount = BIRDS.filter((b) => j[b.id]?.seen || j[b.id]?.heard).length;
  const fishCount = FISH.filter((f) => fr[f.id]).length;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(18,24,16,0.6)' }} onClick={onClose}>
      <div
        className="wf-pop relative w-full max-w-4xl h-full max-h-[88vh] rounded-lg overflow-hidden flex flex-col"
        style={{ background: paper, color: ink, border: '1px solid #cdbf9b', boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 pointer-events-none wf-grain" />
        <div className="flex items-center justify-between px-6 pt-5 pb-3" style={{ borderBottom: '2px solid #d8caa4' }}>
          <div>
            <h2 className="text-3xl" style={{ fontFamily: 'var(--font-fraunces)' }}>
              Field Journal
            </h2>
            <p className="text-xs opacity-60 mt-0.5">
              {seenCount} of {BIRDS.length} birds · {fishCount} of {FISH.length} fish · {game.s.nestsFledged} broods fledged
            </p>
          </div>
          <div className="flex gap-1 mr-8">
            {(['birds', 'fish', 'nests'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setDetail(null); }}
                className="px-4 py-1.5 rounded-full text-sm font-semibold capitalize"
                style={tab === t ? { background: moss, color: paper } : { color: moss }}
              >
                {t === 'birds' ? `🪶 birds` : t === 'fish' ? '🐟 fish' : '🪺 nests'}
              </button>
            ))}
          </div>
        </div>
        <CloseBtn onClose={onClose} />

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'birds' && !detail && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {BIRDS.map((sp) => {
                const e = j[sp.id];
                const known = !!(e?.seen || e?.heard);
                return (
                  <button
                    key={sp.id}
                    onClick={() => known && setDetail(sp.id)}
                    className={`rounded-lg border p-2 text-center ${known ? 'wf-btn cursor-pointer' : 'opacity-70 cursor-default'}`}
                    style={{ borderColor: '#d4c69e', background: known ? '#faf5e6' : '#ece4cd' }}
                  >
                    <BirdArt id={sp.id} w={110} h={84} silhouette={!known} />
                    <div className="text-xs font-semibold mt-1 truncate">{known ? sp.name : '— ? —'}</div>
                    <div className="text-[10px] mt-0.5 flex items-center justify-center gap-1.5" style={{ color: moss }}>
                      {e?.seen && <span title="seen">👁 {e.count}</span>}
                      {e?.heard && <span title="heard">🎵</span>}
                      {!known && <span className="opacity-60">{RARITY_LABEL[sp.rarity]}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {tab === 'birds' && detail && (
            <BirdDetail sp={BIRD_BY_ID[detail]} entry={j[detail]} onPlay={() => game.playPreview(detail)} onBack={() => setDetail(null)} />
          )}
          {tab === 'fish' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FISH.map((fs) => {
                const r = fr[fs.id];
                return (
                  <div key={fs.id} className="rounded-lg border p-3 flex items-center gap-3" style={{ borderColor: '#d4c69e', background: r ? '#faf5e6' : '#ece4cd' }}>
                    <FishArt id={fs.id} w={130} h={66} silhouette={!r} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{r ? fs.name : '— ? —'}</div>
                      <div className="text-[11px] italic opacity-60">{r ? fs.sci : `${RARITY_LABEL[fs.rarity]} · ${fs.water.join('/')}`}</div>
                      {r && (
                        <div className="text-xs mt-1" style={{ color: moss }}>
                          caught <b>{r.count}</b> · best <b>{r.best}&quot;</b>
                        </div>
                      )}
                      {r && <p className="text-[11px] opacity-75 mt-1 leading-snug line-clamp-3">{fs.fact}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {tab === 'nests' && (
            <div className="space-y-3 max-w-xl mx-auto">
              {game.s.nests.filter((n) => n.discovered).length === 0 && (
                <p className="text-center text-sm opacity-70 mt-8 italic">
                  No nests found yet. Once you&apos;ve met a species a few times, pairs may start building near the cabin —
                  scan the trees with your binoculars for a telltale glint. 🔭
                </p>
              )}
              {game.s.nests
                .filter((n) => n.discovered)
                .map((n) => (
                  <div key={n.id} className="rounded-lg border p-3 flex items-center gap-3" style={{ borderColor: '#d4c69e', background: '#faf5e6' }}>
                    <BirdArt id={n.species} w={90} h={70} />
                    <div>
                      <div className="text-sm font-semibold">{BIRD_BY_ID[n.species].name}</div>
                      <div className="text-xs mt-0.5" style={{ color: moss }}>
                        {n.stage === 'building' && '🪺 under construction'}
                        {n.stage === 'eggs' && '🥚 incubating eggs'}
                        {n.stage === 'chicks' && '🐣 feeding chicks'}
                        {n.stage === 'fledged' && '🐦 fledged!'}
                        {n.inBox ? ' · in your nest box' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              <p className="text-center text-xs opacity-60 pt-2">
                {game.s.nestsFound} nests found · {game.s.nestsFledged} broods fledged on your watch
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BirdDetail({ sp, entry, onPlay, onBack }: { sp: BirdSpecies; entry?: { seen: boolean; heard: boolean; count: number; firstDay: number }; onPlay: () => void; onBack: () => void }) {
  return (
    <div className="max-w-xl mx-auto text-center">
      <button onClick={onBack} className="text-sm mb-2 underline opacity-70">
        ← all birds
      </button>
      <h3 className="text-3xl" style={{ fontFamily: 'var(--font-fraunces)' }}>
        {sp.name}
      </h3>
      <p className="text-sm italic opacity-65">{sp.sci}</p>
      <div className="flex justify-center my-2">
        <BirdArt id={sp.id} w={210} h={150} />
      </div>
      <p className="text-xs uppercase tracking-wide opacity-60 mb-2">
        {RARITY_LABEL[sp.rarity]} · {sp.habitats.join(' · ')} ·{' '}
        {sp.time === 'night' ? 'after dark' : sp.time === 'dawnDusk' ? 'dawn & dusk' : sp.time === 'all' ? 'any hour' : 'daytime'}
      </p>
      <p className="text-sm leading-relaxed opacity-90">{sp.fact}</p>
      <button onClick={onPlay} className="wf-btn mt-3 px-4 py-2 rounded-full text-sm font-semibold" style={{ background: '#e9e0c6', border: '1px solid #cdbf9b' }}>
        ▶ {sp.songHint}
      </button>
      {entry && (
        <p className="text-xs mt-3" style={{ color: moss }}>
          {entry.seen ? `seen ${entry.count} time${entry.count === 1 ? '' : 's'}` : 'not yet seen'} ·{' '}
          {entry.heard ? 'identified by song 🎵' : 'song not yet identified'} · first met day {entry.firstDay}
        </p>
      )}
    </div>
  );
}

// ---- build menu -----------------------------------------------------------------------

function BuildMenu({ game, seeds, onPick, onClose }: { game: Game; seeds: number; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <Card onClose={onClose} wide>
      <CloseBtn onClose={onClose} />
      <div className="p-6 max-h-[82vh] overflow-y-auto">
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: moss }}>
          around the cabin · you have {seeds} 🌰
        </p>
        <h2 className="text-3xl mb-4" style={{ fontFamily: 'var(--font-fraunces)' }}>
          Bring the birds to you
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {STRUCTURES.map((st) => {
            const affordable = seeds >= st.cost;
            const placed = game.s.structures.filter((x) => x.type === st.id).length;
            return (
              <button
                key={st.id}
                disabled={!affordable}
                onClick={() => onPick(st.id)}
                className={`rounded-lg border p-3 text-left flex gap-3 ${affordable ? 'wf-btn' : 'opacity-45 cursor-not-allowed'}`}
                style={{ borderColor: '#d4c69e', background: '#faf5e6' }}
              >
                <div className="text-3xl">{st.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{st.name}</span>
                    <span className="text-xs font-bold whitespace-nowrap" style={{ color: affordable ? moss : '#a05030' }}>
                      {st.cost} 🌰
                    </span>
                  </div>
                  <p className="text-[11px] opacity-75 leading-snug mt-0.5">{st.desc}</p>
                  <p className="text-[10px] mt-1" style={{ color: moss }}>
                    attracts:{' '}
                    {st.attracts
                      .map((id) => BIRD_BY_ID[id].name.split(' ').slice(-1)[0])
                      .join(', ') || '—'}
                    {placed > 0 && <span className="opacity-60"> · {placed} placed</span>}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs italic opacity-60 mt-4 text-center">
          Earn seeds by identifying birds (sight 12 🌰 / song 8 🌰), catching fish, and finding nests.
        </p>
      </div>
    </Card>
  );
}
