'use client';

// Paws & Found — React shell: character select, story & profile, map table,
// celebrations, the Rescue Book, the shop, and the touch-friendly HUD.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type ActionButton, type RescueEvent, type Slot } from './game';
import { paintAnimalPortrait, paintKidPortrait } from './render';
import {
  GEAR,
  GEAR_BY_ID,
  REGIONS,
  SPECIES_BY_ID,
  TRAIT_BY_ID,
  UPGRADES,
  rescuesToNextLevel,
} from './data';
import type { AnimalCharacter, Mission, RegionId, Resident } from './types';

const cream = '#fdf6e8';
const inkc = '#4a3a2c';
const teal = '#3d8a84';
const sun = '#f2a93b';
const blush = '#e87f9a';

// ---- tiny shared pieces ---------------------------------------------------------------

function Portrait({ ch, size = 96 }: { ch: AnimalCharacter; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) paintAnimalPortrait(ref.current, ch);
  }, [ch]);
  return <canvas ref={ref} width={size * 2} height={size * 2} style={{ width: size, height: size }} />;
}

function KidPortrait({ who, size = 110 }: { who: Slot; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) paintKidPortrait(ref.current, who);
  }, [who]);
  return <canvas ref={ref} width={size * 2} height={size * 2} style={{ width: size, height: size }} />;
}

/** renders story text, making *starred* words bold & colored */
function StoryText({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/g);
  return (
    <p className="leading-relaxed">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <b key={i} style={{ color: teal }}>
            {p}
          </b>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </p>
  );
}

function BigButton({ children, onClick, color = teal, disabled = false }: { children: React.ReactNode; onClick: () => void; color?: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="pf-btn px-7 py-3.5 rounded-full text-lg font-extrabold shadow-lg"
      style={{ background: disabled ? '#c9beac' : color, color: '#fff', opacity: disabled ? 0.6 : 1, fontFamily: 'var(--font-baloo)' }}
    >
      {children}
    </button>
  );
}

function Modal({ children, onClose, wide = false }: { children: React.ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-3" style={{ background: 'rgba(50,40,25,0.5)' }} onClick={onClose}>
      <div
        className={`pf-pop relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto rounded-3xl p-5 sm:p-6`}
        style={{ background: cream, color: inkc, border: '4px solid #e8cf9a', boxShadow: '0 20px 60px rgba(40,25,10,0.45)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-10 h-10 rounded-full text-xl font-black flex items-center justify-center"
            style={{ background: '#f0e2c4', color: inkc }}
            aria-label="Close"
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

// ===========================================================================================

export default function Rescue() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [hud, setHud] = useState({ coins: 0, level: 1, rescues: 0, hint: '', muted: false });
  const [buttons, setButtons] = useState<ActionButton[]>([]);
  const [story, setStory] = useState<Mission | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [clue, setClue] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<Extract<RescueEvent, { kind: 'celebrate' }> | null>(null);
  const [birth, setBirth] = useState<Extract<RescueEvent, { kind: 'birth' }> | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; icon?: string }[]>([]);
  const [canMapBtn, setCanMapBtn] = useState(false);
  const toastId = useRef(0);
  const birthQueue = useRef<Extract<RescueEvent, { kind: 'birth' }>[]>([]);

  const pushToast = useCallback((msg: string, icon?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, msg, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const begin = useCallback(
    (who: Slot) => {
      if (!canvasRef.current) return;
      gameRef.current?.destroy();
      const game = new Game(canvasRef.current, who);
      gameRef.current = game;
      (window as unknown as { pawsGame?: Game }).pawsGame = game;
      game.audio.init();
      game.on((e) => {
        switch (e.kind) {
          case 'story':
            setStory(e.mission);
            break;
          case 'map':
            setMapOpen(true);
            break;
          case 'clue':
            setClue(e.text);
            break;
          case 'celebrate':
            setCelebrate(e);
            break;
          case 'birth':
            birthQueue.current.push(e);
            break;
          case 'toast':
            pushToast(e.msg, e.icon);
            break;
          default:
            break;
        }
      });
      setSlot(who);
    },
    [pushToast]
  );

  // HUD polling
  useEffect(() => {
    if (!slot) return;
    const iv = setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      setHud({ coins: g.save.coins, level: g.save.level, rescues: g.save.rescues, hint: g.hint(), muted: g.muted });
      setButtons(g.buttons());
      setCanMapBtn(g.canOpenMapAnywhere());
    }, 250);
    return () => clearInterval(iv);
  }, [slot]);

  useEffect(() => () => gameRef.current?.destroy(), []);

  const anyModal = !!(story || mapOpen || celebrate || birth || bookOpen || shopOpen || helpOpen || clue);
  useEffect(() => {
    gameRef.current?.setPaused(anyModal);
  }, [anyModal]);

  // birth events show after celebration closes
  useEffect(() => {
    if (!celebrate && !birth && birthQueue.current.length) {
      setBirth(birthQueue.current.shift()!);
    }
  }, [celebrate, birth]);

  const g = gameRef.current;

  return (
    <div
      className="fixed inset-0 z-[80] overflow-hidden select-none"
      style={{ background: '#7db35e', fontFamily: 'var(--font-nunito), system-ui', color: inkc }}
    >
      <style>{`
        .pf-pop { animation: pfPop .3s cubic-bezier(.2,1.5,.4,1); }
        @keyframes pfPop { from { transform: scale(.85) translateY(16px); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .pf-btn { transition: transform .1s ease; }
        .pf-btn:active { transform: scale(.94); }
        .pf-rise { animation: pfRise .3s ease-out; }
        @keyframes pfRise { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes pfBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes pfWiggle { 0%,100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
        @keyframes pfConfetti { 0% { transform: translateY(-10px) rotate(0); opacity: 1; } 100% { transform: translateY(90px) rotate(360deg); opacity: 0; } }
      `}</style>

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

      {/* ============ CHARACTER SELECT ============ */}
      {!slot && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center px-4 text-center"
          style={{ background: 'linear-gradient(180deg, #a8d8e8 0%, #cdead0 55%, #8fc46e 100%)' }}
        >
          <div style={{ animation: 'pfBounce 3s ease-in-out infinite' }} className="text-6xl mb-1">
            🐾
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold mb-1" style={{ fontFamily: 'var(--font-baloo)', color: '#3d6a44', textShadow: '0 3px 0 rgba(255,255,255,0.5)' }}>
            Paws &amp; Found
          </h1>
          <p className="text-lg mb-8 font-bold" style={{ color: '#5d8a52' }}>
            Animal Rescue Adventures
          </p>
          <p className="text-base mb-4 font-bold" style={{ color: inkc }}>
            Who&apos;s rescuing today?
          </p>
          <div className="flex gap-5">
            {(['scarlett', 'lennon'] as Slot[]).map((who) => (
              <button
                key={who}
                onClick={() => begin(who)}
                className="pf-btn rounded-3xl px-6 pt-4 pb-3 shadow-xl"
                style={{ background: cream, border: `5px solid ${who === 'scarlett' ? blush : sun}` }}
              >
                <KidPortrait who={who} />
                <div className="text-xl font-extrabold capitalize mt-1" style={{ fontFamily: 'var(--font-baloo)', color: who === 'scarlett' ? blush : '#c4882e' }}>
                  {who}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-8 text-sm font-semibold" style={{ color: '#5d8a52' }}>
            Each rescuer keeps her own rescue center, animals, and story 💚
          </p>
        </div>
      )}

      {slot && (
        <>
          {/* ============ TOP HUD ============ */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between p-2.5 pointer-events-none">
            <div className="flex gap-2 pointer-events-auto">
              <div className="rounded-full px-4 py-2 text-sm font-extrabold flex items-center gap-2" style={{ background: 'rgba(253,246,232,0.94)', border: '3px solid #e8cf9a' }}>
                <span style={{ fontFamily: 'var(--font-baloo)', color: teal }}>⭐ Lv {hud.level}</span>
                <span style={{ color: '#c4882e' }}>🪙 {hud.coins}</span>
              </div>
            </div>
            <div className="flex gap-1.5 pointer-events-auto">
              {canMapBtn && <RoundBtn icon="🗺️" label="Map" onClick={() => g?.openMap()} />}
              <RoundBtn icon="📔" label="Rescue Book" onClick={() => setBookOpen(true)} />
              <RoundBtn icon="🛒" label="Shop" onClick={() => setShopOpen(true)} />
              <RoundBtn icon={hud.muted ? '🔇' : '🔊'} label="Sound" onClick={() => g?.setMuted(!hud.muted)} />
              <RoundBtn icon="❓" label="Help" onClick={() => setHelpOpen(true)} />
            </div>
          </div>

          {/* ============ BOTTOM HUD ============ */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-2 p-3 pointer-events-none">
            <div className="flex flex-wrap justify-center gap-2 pointer-events-auto">
              {buttons.map((b) => (
                <button
                  key={b.id}
                  onClick={() => g?.action(b.id)}
                  className="pf-btn pf-rise rounded-full px-5 py-3 text-base font-extrabold shadow-xl flex items-center gap-2"
                  style={{
                    background: b.primary ? teal : cream,
                    color: b.primary ? '#fff' : inkc,
                    border: `3px solid ${b.primary ? '#2d6a64' : '#e8cf9a'}`,
                    fontFamily: 'var(--font-baloo)',
                  }}
                >
                  <span className="text-xl">{b.icon}</span> {b.label}
                </button>
              ))}
            </div>
            <div className="rounded-full px-4 py-1.5 text-[13px] font-bold" style={{ background: 'rgba(50,40,25,0.65)', color: '#fdf2cf' }}>
              {hud.hint}
            </div>
          </div>

          {/* ============ TOASTS ============ */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 w-[94%] max-w-md pointer-events-none">
            {toasts.map((t) => (
              <div key={t.id} className="pf-rise rounded-2xl px-4 py-2 text-sm font-bold text-center shadow-lg" style={{ background: 'rgba(253,246,232,0.96)', border: '3px solid #e8cf9a' }}>
                {t.icon && <span className="mr-1">{t.icon}</span>}
                {t.msg}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ============ OWNER STORY ============ */}
      {story && g && (
        <Modal wide>
          <div className="text-center mb-2">
            <span className="text-4xl">{story.kind === 'wildlife' ? '🦺' : '🧑‍🌾'}</span>
            <h2 className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-baloo)', color: teal }}>
              {story.owner} needs your help!
            </h2>
          </div>
          <div className="space-y-2 text-[15px] font-semibold mb-3">
            {story.story.map((s, i) => (
              <StoryText key={i} text={s} />
            ))}
          </div>
          <button
            onClick={() => g.audio.speak(story.story.join(' '))}
            className="pf-btn rounded-full px-4 py-2 text-sm font-extrabold mb-3"
            style={{ background: '#f0e2c4', color: inkc }}
          >
            🔊 Read it to me
          </button>
          {/* profile card */}
          <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: '#fff', border: '3px dashed #e8cf9a' }}>
            <div className="shrink-0 rounded-xl" style={{ background: '#eef6e4' }}>
              <Portrait ch={story.animal} size={104} />
            </div>
            <div className="text-left min-w-0">
              <div className="text-xl font-extrabold" style={{ fontFamily: 'var(--font-baloo)' }}>
                {story.animal.name} {SPECIES_BY_ID[story.animal.species].emoji}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {story.traitIds.map((t) => (
                  <span key={t} className="rounded-full px-2.5 py-1 text-[11.5px] font-extrabold" style={{ background: '#e4f0e0', color: '#3d6a44' }}>
                    {TRAIT_BY_ID[t].chip}
                  </span>
                ))}
              </div>
              <p className="text-[12px] mt-1.5 font-bold opacity-70">Think: where would an animal like this go? 🤔</p>
            </div>
          </div>
          <div className="text-center mt-4">
            <BigButton
              onClick={() => {
                g.audio.stopSpeaking();
                setStory(null);
                g.acceptMission();
              }}
            >
              We&apos;ll find {story.animal.sex === 'f' ? 'her' : 'him'}! 💪
            </BigButton>
          </div>
        </Modal>
      )}

      {/* ============ MAP TABLE ============ */}
      {mapOpen && g && <MapScreen game={g} onClose={() => { setMapOpen(false); g.setPaused(false); }} onTravel={() => setMapOpen(false)} />}

      {/* ============ CLUE FOUND ============ */}
      {clue && (
        <Modal onClose={() => setClue(null)}>
          <div className="text-center">
            <div className="text-4xl mb-1">🔍</div>
            <h3 className="text-xl font-extrabold mb-2" style={{ fontFamily: 'var(--font-baloo)', color: teal }}>
              You found a clue!
            </h3>
            <p className="text-[15px] font-bold leading-relaxed">{clue}</p>
            <div className="mt-4">
              <BigButton onClick={() => setClue(null)}>Keep searching! 🐾</BigButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ CELEBRATION ============ */}
      {celebrate && g && (
        <Modal>
          <div className="text-center relative overflow-hidden">
            {/* confetti */}
            <div className="absolute inset-x-0 top-0 h-0 pointer-events-none">
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute text-lg"
                  style={{ left: `${(i * 41) % 100}%`, animation: `pfConfetti ${1.4 + (i % 5) * 0.3}s ease-in ${(i % 7) * 0.18}s infinite` }}
                >
                  {['🎉', '✨', '💛', '🌸', '⭐'][i % 5]}
                </span>
              ))}
            </div>
            <h2 className="text-3xl font-extrabold mt-1" style={{ fontFamily: 'var(--font-baloo)', color: blush }}>
              {celebrate.outcome === 'reunited' && 'Reunited! 🥹'}
              {celebrate.outcome === 'released' && 'Safe & Wild Again! 🌿'}
              {celebrate.outcome === 'adopted' && 'Welcome Home! 🏡'}
            </h2>
            <div className="flex justify-center my-2" style={{ animation: 'pfWiggle 1.6s ease-in-out infinite' }}>
              <Portrait ch={celebrate.mission.animal} size={130} />
            </div>
            <p className="text-[15px] font-bold px-2">
              {celebrate.outcome === 'reunited' &&
                `${celebrate.mission.owner} hugs ${celebrate.mission.animal.name} tight. "You found ${celebrate.mission.animal.sex === 'f' ? 'her' : 'him'}! Thank you, thank you!"`}
              {celebrate.outcome === 'released' &&
                `${celebrate.mission.animal.name} bounds off into the wild, healthy and free — then looks back at you one last time. 💚`}
              {celebrate.outcome === 'adopted' &&
                `${celebrate.mission.animal.name} ${celebrate.mission.kind === 'litter' ? 'and the babies are' : 'is'} now part of your rescue center family! Visit and pet them anytime.`}
            </p>
            <div className="text-2xl font-extrabold mt-3" style={{ color: '#c4882e', fontFamily: 'var(--font-baloo)' }}>
              +{celebrate.coins} 🪙
            </div>
            {celebrate.pregnant && (
              <div className="mt-2 rounded-2xl px-4 py-2.5 text-[14px] font-extrabold pf-rise" style={{ background: '#fbe4ec', color: '#b04a6a' }}>
                💕 Dr. Fig checks {celebrate.mission.animal.name} over… &quot;Oh my — she&apos;s going to be a mama! Babies are coming soon!&quot;
              </div>
            )}
            {celebrate.leveledTo && (
              <div className="mt-2 rounded-2xl px-4 py-2.5 text-[14px] font-extrabold pf-rise" style={{ background: '#e4f0e0', color: '#3d6a44' }}>
                ⭐ LEVEL UP! You&apos;re a Level {celebrate.leveledTo} Rescuer!{' '}
                {REGIONS.filter((r) => r.minLevel === celebrate.leveledTo).map((r) => `${r.emoji} ${r.name} is now on your map!`)}
              </div>
            )}
            <div className="mt-4">
              <BigButton onClick={() => setCelebrate(null)} color={blush}>
                Hooray! 🎉
              </BigButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ BABIES ARRIVE ============ */}
      {birth && (
        <Modal>
          <div className="text-center">
            <h2 className="text-3xl font-extrabold" style={{ fontFamily: 'var(--font-baloo)', color: blush }}>
              The babies are here! 🍼
            </h2>
            <p className="text-[15px] font-bold mt-1">
              {birth.mom.name} had {birth.babies.length} tiny {SPECIES_BY_ID[birth.mom.species].babyWord}
              {birth.babies.length === 1 ? '' : 's'}!
            </p>
            <div className="flex justify-center items-end gap-1 my-3">
              <Portrait ch={birth.mom} size={110} />
              {birth.babies.map((b) => (
                <div key={b.id} style={{ animation: 'pfBounce 2s ease-in-out infinite' }}>
                  <Portrait ch={b} size={64} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {birth.babies.map((b) => (
                <span key={b.id} className="rounded-full px-3 py-1 text-[12px] font-extrabold" style={{ background: '#fbe4ec', color: '#b04a6a' }}>
                  {b.name}
                </span>
              ))}
            </div>
            <p className="text-[12.5px] font-bold opacity-70 mt-2">Look closely — each baby got something from their mama! 🧬</p>
            <div className="mt-4">
              <BigButton onClick={() => setBirth(null)} color={blush}>
                Welcome, little ones 💕
              </BigButton>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ RESCUE BOOK ============ */}
      {bookOpen && g && <RescueBook game={g} onClose={() => setBookOpen(false)} />}

      {/* ============ SHOP ============ */}
      {shopOpen && g && <Shop game={g} coins={hud.coins} onClose={() => setShopOpen(false)} />}

      {/* ============ HELP ============ */}
      {helpOpen && (
        <Modal onClose={() => setHelpOpen(false)} wide>
          <h2 className="text-2xl font-extrabold mb-3 text-center" style={{ fontFamily: 'var(--font-baloo)', color: teal }}>
            How to be a great rescuer 🐾
          </h2>
          <div className="space-y-2.5 text-[14px] font-bold">
            <p>💬 <b>Listen.</b> Someone at the gate needs help. Their story has clues about where their animal went!</p>
            <p>🗺️ <b>Think.</b> At the map table, pick where to search. Scared of water? Probably not the creek! Loves climbing? Hmm…</p>
            <p>🎒 <b>Pack smart.</b> Bring 2 things. If you bring a snack they love, rescuing is much easier!</p>
            <p>🔍 <b>Follow clues.</b> Glowing paw prints, fur tufts, and nibbled snacks show the way.</p>
            <p>🤫 <b>Sneak.</b> When you spot the animal, creep close — but FREEZE when they look up (you&apos;ll see the ❗). Too fast and they&apos;ll run!</p>
            <p>🤚 <b>Be gentle.</b> Offer a treat, pet them softly, and carry them home for the celebration.</p>
            <p>🏡 <b>Grow.</b> Coins buy gear and buildings. Stray animals stay and live with you — pet them every day! Some mamas even have babies. 🍼</p>
            <p>🚶 <b>Moving:</b> tap anywhere to walk there (or use arrow keys).</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RoundBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="pf-btn w-11 h-11 rounded-full text-xl flex items-center justify-center shadow"
      style={{ background: 'rgba(253,246,232,0.94)', border: '3px solid #e8cf9a' }}
    >
      {icon}
    </button>
  );
}

// ---- map screen ----------------------------------------------------------------------------

function MapScreen({ game, onClose, onTravel }: { game: Game; onClose: () => void; onTravel: () => void }) {
  const [region, setRegion] = useState<RegionId | null>(null);
  const [pack, setPack] = useState<string[]>(game.pack.length ? game.pack : ['apple', 'blanket'].filter((x) => game.save.gear.includes(x)));
  const level = game.save.level;
  const mission = game.mission!;

  const togglePack = (id: string) => {
    setPack((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : [p[1], id]));
  };

  return (
    <Modal onClose={onClose} wide>
      <h2 className="text-2xl font-extrabold text-center mb-1" style={{ fontFamily: 'var(--font-baloo)', color: teal }}>
        Where should we search for {mission.animal.name}? 🗺️
      </h2>
      <p className="text-center text-[13px] font-bold opacity-75 mb-3">Remember the story… think like {mission.animal.sex === 'f' ? 'she' : 'he'} would!</p>
      <div className="flex flex-wrap justify-center gap-1.5 mb-3">
        {mission.traitIds.map((t) => (
          <span key={t} className="rounded-full px-2.5 py-1 text-[11.5px] font-extrabold" style={{ background: '#e4f0e0', color: '#3d6a44' }}>
            {TRAIT_BY_ID[t].chip}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        {REGIONS.map((r) => {
          const locked = r.minLevel > level || (r.needsGear && !game.save.gear.includes(r.needsGear));
          const ruledOut = game.ruledOut === r.id;
          const sel = region === r.id;
          return (
            <button
              key={r.id}
              disabled={locked || ruledOut}
              onClick={() => setRegion(r.id)}
              className={`pf-btn rounded-2xl p-3 text-left flex items-center gap-3 ${locked || ruledOut ? 'opacity-50' : ''}`}
              style={{
                background: sel ? '#dff0e8' : '#fff',
                border: `3px solid ${sel ? teal : '#e8cf9a'}`,
              }}
            >
              <span className="text-3xl">{r.emoji}</span>
              <span className="min-w-0">
                <span className="block text-base font-extrabold" style={{ fontFamily: 'var(--font-baloo)' }}>
                  {r.name} {ruledOut && '❌'}
                </span>
                <span className="block text-[12px] font-bold opacity-75">
                  {ruledOut
                    ? 'The lookout tower says: not here!'
                    : locked
                      ? r.needsGear && r.minLevel <= level
                        ? `You need ${GEAR_BY_ID[r.needsGear].name} ${GEAR_BY_ID[r.needsGear].icon}`
                        : `Unlocks at Level ${r.minLevel} ⭐`
                      : r.blurb}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <h3 className="text-lg font-extrabold mb-1.5" style={{ fontFamily: 'var(--font-baloo)' }}>
        🎒 Pack 2 things:
      </h3>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {game.save.gear
          .filter((id) => GEAR_BY_ID[id]?.kind === 'lure')
          .map((id) => (
            <button
              key={id}
              onClick={() => togglePack(id)}
              className="pf-btn rounded-full px-3 py-1.5 text-[13px] font-extrabold"
              style={{
                background: pack.includes(id) ? teal : '#fff',
                color: pack.includes(id) ? '#fff' : inkc,
                border: `3px solid ${pack.includes(id) ? '#2d6a64' : '#e8cf9a'}`,
              }}
            >
              {GEAR_BY_ID[id].icon} {GEAR_BY_ID[id].name}
            </button>
          ))}
      </div>
      <div className="text-center">
        <BigButton
          disabled={!region}
          onClick={() => {
            if (region) {
              game.travelTo(region, pack);
              onTravel();
            }
          }}
        >
          Let&apos;s go! 🚐
        </BigButton>
      </div>
    </Modal>
  );
}

// ---- rescue book ---------------------------------------------------------------------------------

function RescueBook({ game, onClose }: { game: Game; onClose: () => void }) {
  const [tab, setTab] = useState<'residents' | 'rescues'>('residents');
  const residents = game.save.residents;
  const book = [...game.save.book].reverse();
  const next = rescuesToNextLevel(game.save.rescues);

  return (
    <Modal onClose={onClose} wide>
      <h2 className="text-2xl font-extrabold text-center" style={{ fontFamily: 'var(--font-baloo)', color: teal }}>
        📔 Rescue Book
      </h2>
      <p className="text-center text-[12.5px] font-bold opacity-70 mb-2">
        {game.save.rescues} rescues · Level {game.save.level} · {next.need - next.have} more to level up ⭐
      </p>
      <div className="flex justify-center gap-1.5 mb-3">
        {(['residents', 'rescues'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="pf-btn rounded-full px-4 py-1.5 text-sm font-extrabold capitalize"
            style={{ background: tab === t ? teal : '#f0e2c4', color: tab === t ? '#fff' : inkc }}
          >
            {t === 'residents' ? `🏡 Our animals (${residents.length})` : `📖 All rescues (${book.length})`}
          </button>
        ))}
      </div>
      {tab === 'residents' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {residents.length === 0 && (
            <p className="col-span-3 text-center text-sm font-bold opacity-70 py-6">
              No residents yet! Rescue a stray with no owner and they&apos;ll come live with you. 🏡
            </p>
          )}
          {residents.map((r: Resident) => (
            <div key={r.id} className="rounded-2xl p-2 text-center" style={{ background: '#fff', border: '3px solid #e8cf9a' }}>
              <Portrait ch={r} size={84} />
              <div className="text-[14px] font-extrabold" style={{ fontFamily: 'var(--font-baloo)' }}>
                {r.name} {r.baby ? '🍼' : SPECIES_BY_ID[r.species].emoji}
              </div>
              <div className="text-[11px] font-bold opacity-70">
                {r.pregnant ? '💕 expecting babies!' : r.baby ? `baby ${SPECIES_BY_ID[r.species].babyWord}` : SPECIES_BY_ID[r.species].label}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'rescues' && (
        <div className="space-y-2">
          {book.length === 0 && <p className="text-center text-sm font-bold opacity-70 py-6">Your first rescue story will be written here! 💪</p>}
          {book.map((e, i) => (
            <div key={i} className="rounded-2xl p-2 flex items-center gap-3" style={{ background: '#fff', border: '3px solid #e8cf9a' }}>
              <Portrait ch={e.animal} size={64} />
              <div className="min-w-0 text-left">
                <div className="text-[14px] font-extrabold" style={{ fontFamily: 'var(--font-baloo)' }}>
                  {e.animal.name} {SPECIES_BY_ID[e.animal.species].emoji}
                </div>
                <div className="text-[11.5px] font-bold opacity-70">
                  Day {e.day} · {e.outcome === 'reunited' ? `back home with ${e.owner} 🥹` : e.outcome === 'released' ? 'released to the wild 🌿' : 'adopted into our family 🏡'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---- shop -------------------------------------------------------------------------------------------

function Shop({ game, coins, onClose }: { game: Game; coins: number; onClose: () => void }) {
  const [, force] = useState(0);
  return (
    <Modal onClose={onClose} wide>
      <h2 className="text-2xl font-extrabold text-center" style={{ fontFamily: 'var(--font-baloo)', color: teal }}>
        🛒 Rescue Shop
      </h2>
      <p className="text-center text-[13px] font-extrabold mb-3" style={{ color: '#c4882e' }}>
        You have {coins} 🪙
      </p>
      <h3 className="text-lg font-extrabold mb-1.5" style={{ fontFamily: 'var(--font-baloo)' }}>
        🎒 Gear
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        {GEAR.filter((gd) => gd.cost > 0).map((gd) => {
          const owned = game.save.gear.includes(gd.id);
          return (
            <div key={gd.id} className="rounded-2xl p-2.5 flex items-center gap-2.5" style={{ background: '#fff', border: '3px solid #e8cf9a', opacity: owned ? 0.65 : 1 }}>
              <span className="text-2xl">{gd.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-extrabold">{gd.name}</div>
                <div className="text-[11.5px] font-bold opacity-70 leading-tight">{gd.desc}</div>
              </div>
              <button
                disabled={owned || coins < gd.cost}
                onClick={() => {
                  game.buyGear(gd.id);
                  force((x) => x + 1);
                }}
                className="pf-btn rounded-full px-3 py-1.5 text-[12.5px] font-extrabold whitespace-nowrap"
                style={{ background: owned ? '#c9beac' : coins >= gd.cost ? sun : '#e8ddc8', color: owned || coins >= gd.cost ? '#fff' : '#a89878' }}
              >
                {owned ? 'Owned ✓' : `${gd.cost} 🪙`}
              </button>
            </div>
          );
        })}
      </div>
      <h3 className="text-lg font-extrabold mb-1.5" style={{ fontFamily: 'var(--font-baloo)' }}>
        🏡 Rescue Center
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {UPGRADES.map((u) => {
          const owned = game.save.upgrades.includes(u.id);
          return (
            <div key={u.id} className="rounded-2xl p-2.5 flex items-center gap-2.5" style={{ background: '#fff', border: '3px solid #e8cf9a', opacity: owned ? 0.65 : 1 }}>
              <span className="text-2xl">{u.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-extrabold">{u.name}</div>
                <div className="text-[11.5px] font-bold opacity-70 leading-tight">{u.desc}</div>
              </div>
              <button
                disabled={owned || coins < u.cost}
                onClick={() => {
                  game.buyUpgrade(u.id);
                  force((x) => x + 1);
                }}
                className="pf-btn rounded-full px-3 py-1.5 text-[12.5px] font-extrabold whitespace-nowrap"
                style={{ background: owned ? '#c9beac' : coins >= u.cost ? sun : '#e8ddc8', color: owned || coins >= u.cost ? '#fff' : '#a89878' }}
              >
                {owned ? 'Built ✓' : `${u.cost} 🪙`}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
