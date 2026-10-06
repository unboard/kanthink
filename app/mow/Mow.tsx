'use client';

// Clean Cut — React shell: title, job board, HUD, results, day end, leaderboards.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Game } from './game';
import { DAY_END, DAY_START, DECK_HEIGHTS, makeBoard, SHOP, travelMinutes } from './lawns';
import type { Payout } from './field';
import { hashString, todayKey } from './rng';
import {
  addLocalScore, addRescuedCat, fetchBoard, loadCats, loadDay, loadMuted, loadName, loadQuality, localScores, postScore,
  saveDay, saveMuted, saveName, saveQuality, type RescuedCat, type ScoreRow,
} from './save';
import { COATS, hasLostCat, type CoatId, type LostCat } from './cats';
import type { DayState, HudState, JobDef, JobResult, Quality, Toast } from './types';

type Screen = 'title' | 'board' | 'loading' | 'play' | 'results' | 'dayEnd' | 'leaders' | 'help' | 'cats';

type ResultState = { job: JobDef; payout: Payout; timeUp: boolean; style: number; minutes: number; cat: LostCat | null };

const LIME = '#c6f432';
const ORANGE = '#ff6a1f';
const PANEL = 'rgba(9,13,11,0.78)';

function clockStr(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

const PATTERN_LABEL: Record<JobDef['pattern'], string> = {
  any: 'Any pattern',
  stripes: 'Wants stripes',
  diagonal: 'Wants diagonals',
  checker: 'Wants checkerboard',
};

const TEMPLATE_ICON: Record<JobDef['template'], string> = {
  starter: '🏠', corner: '🛣️', backyard: '🌳', estate: '🏛️', field: '⛪', office: '🏢', wedge: '🔺',
};

export default function Mow() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('title');
  const [quality, setQuality] = useState<Quality>('high');
  const [muted, setMuted] = useState(false);
  const [name, setName] = useState('');
  const [day, setDay] = useState<DayState | null>(null);
  const [saved, setSaved] = useState<DayState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loadPct, setLoadPct] = useState(0);
  const [loadClock, setLoadClock] = useState(0);
  const [result, setResult] = useState<ResultState | null>(null);
  const [cats, setCats] = useState<RescuedCat[]>([]);
  const [paused, setPaused] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const [touch, setTouch] = useState(false);
  const jobStart = useRef(0);
  const toastId = useRef(0);
  const dayRef = useRef<DayState | null>(null);
  dayRef.current = day;

  // —— boot: settings + the 3D title scene
  useEffect(() => {
    setQuality(loadQuality());
    setMuted(loadMuted());
    setName(loadName());
    setCats(loadCats());
    const d = loadDay();
    if (d && !d.ended && d.minute < DAY_END - 10) setSaved(d);
    setTouch(window.matchMedia('(hover: none) and (pointer: coarse)').matches || new URLSearchParams(location.search).has('touch'));
  }, []);

  const pushToast = useCallback((text: string, tone: Toast['tone']) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const timeUpRef = useRef<() => void>(() => {});

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const q = loadQuality();
    const game = new Game(el, gameKey === 0 ? q : quality, {
      hud: setHud,
      toast: pushToast,
      timeUp: () => timeUpRef.current(),
      catHome: (c) => {
        addRescuedCat({ name: c.name, coat: c.coat, owner: c.owner, reward: c.reward, day: todayKey(), at: Math.floor(Date.now() / 1000) });
        setCats(loadCats());
      },
    });
    game.audio.setMuted(loadMuted());
    gameRef.current = game;
    (window as unknown as { __mow: Game }).__mow = game;
    let cancelled = false;
    (async () => {
      await game.load(null, 'attract');
      if (cancelled) return;
      game.start();
      setReady(true);
    })();
    return () => {
      cancelled = true;
      game.dispose();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  const board = useMemo(() => (day ? makeBoard(day.seed) : null), [day?.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // —— day flow
  const startDay = (mode: 'daily' | 'free') => {
    const dateKey = mode === 'daily' ? todayKey() : 'free';
    const seed = mode === 'daily' ? hashString(`cleancut:${dateKey}`) : (Math.random() * 2 ** 31) >>> 0;
    const d: DayState = { v: 1, mode, seed, dateKey, minute: DAY_START, money: 0, style: 0, doneJobs: [], results: [], locX: SHOP.x, locY: SHOP.y, ended: false };
    setDay(d);
    saveDay(d);
    setSaved(null);
    setSelected(null);
    setScreen('board');
    gameRef.current?.audio.start();
  };

  const resumeDay = () => {
    if (!saved) return;
    setDay(saved);
    setSaved(null);
    setScreen('board');
    gameRef.current?.audio.start();
  };

  const goTo = async (job: JobDef) => {
    const game = gameRef.current;
    if (!game || !day) return;
    const travel = travelMinutes(day.locX, day.locY, job.mapX, job.mapY);
    const arrive = day.minute + travel;
    setScreen('loading');
    setLoadPct(0);
    setHud(null); // the last job's HUD must not flash up on this one
    const from = day.minute;
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 1400);
      setLoadClock(from + (arrive - from) * k);
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
    // set the clock first: load leaves the game paused, and the old day's clock must never run
    game.minute = arrive;
    await game.load(job, 'play', setLoadPct);
    await new Promise((r) => setTimeout(r, Math.max(0, 1400 - (performance.now() - t0))));
    game.minute = arrive;
    game.money = day.money;
    game.setPaused(false);
    jobStart.current = arrive;
    const d = { ...day, minute: arrive, locX: job.mapX, locY: job.mapY };
    setDay(d);
    saveDay(d);
    setPaused(false);
    setScreen('play');
    pushToast(`${job.client} · ${job.title}`, 'info');
  };

  const finish = useCallback((timeUp = false) => {
    const game = gameRef.current;
    if (!game || !game.job || game.mode !== 'play') return;
    const cat = game.catHome;
    const payout = game.finishJob();
    if (!payout) return;
    const style = Math.round(payout.pattern.score * 100 + game.styleEarned);
    setResult({ job: game.job, payout, timeUp, style, minutes: Math.round(game.minute - jobStart.current), cat });
    setPaused(false);
    setConfirmFinish(false);
    setScreen('results');
    setTimeout(() => game.audio.cash(), 900);
  }, []);
  timeUpRef.current = () => finish(true);

  const collect = () => {
    const game = gameRef.current;
    if (!game || !day || !result) return;
    const p = result.payout;
    const r: JobResult = {
      jobId: result.job.id,
      title: result.job.title,
      client: result.job.client,
      pay: result.job.pay,
      coverage: p.coverage,
      efficiency: p.efficiency,
      edges: p.edges,
      heightMatch: p.heightMatch,
      pattern: p.pattern.score,
      patternName: p.pattern.name,
      damage: p.damage,
      success: p.success,
      tip: p.tip,
      earned: p.earned,
      grade: p.grade,
      minutes: result.minutes,
    };
    const d: DayState = {
      ...day,
      minute: game.minute,
      money: day.money + p.earned,
      style: day.style + result.style,
      doneJobs: [...day.doneJobs, result.job.id],
      results: [...day.results, r],
    };
    const allDone = board ? board.jobs.every((j) => d.doneJobs.includes(j.id)) : false;
    if (d.minute >= DAY_END - 15 || allDone || result.timeUp) d.ended = true;
    setDay(d);
    saveDay(d);
    setResult(null);
    setSelected(null);
    setScreen(d.ended ? 'dayEnd' : 'board');
  };

  const abandon = () => {
    const game = gameRef.current;
    if (!game || !day) return;
    game.finishJob();
    const d = { ...day, minute: game.minute };
    setDay(d);
    saveDay(d);
    setPaused(false);
    setScreen(d.minute >= DAY_END - 15 ? 'dayEnd' : 'board');
    if (d.minute >= DAY_END - 15) {
      d.ended = true;
      saveDay(d);
    }
  };

  const endDay = () => {
    if (!day) return;
    const d = { ...day, ended: true };
    setDay(d);
    saveDay(d);
    setScreen('dayEnd');
  };

  // —— keyboard: pause / finish
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== 'play') return;
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        setPaused((p) => {
          gameRef.current?.setPaused(!p);
          return !p;
        });
        setConfirmFinish(false);
      }
      if (e.key === 'Enter' && !paused) {
        const cov = gameRef.current?.field?.coverage ?? 0;
        if (cov < 0.97) {
          setConfirmFinish(true);
          setPaused(true);
          gameRef.current?.setPaused(true);
        } else finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, paused, finish]);

  useEffect(() => {
    const onLock = () => {
      if (screen === 'play' && !document.pointerLockElement && !paused) {
        // leaving pointer lock with Esc already toggles pause via keydown
      }
    };
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, [screen, paused]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    saveMuted(m);
    gameRef.current?.audio.setMuted(m);
  };

  const changeQuality = (q: Quality) => {
    setQuality(q);
    saveQuality(q);
    setReady(false);
    setGameKey((k) => k + 1);
  };

  const showBg = screen !== 'play';

  return (
    <div className={touch ? 'cc-touchui' : undefined} style={{ position: 'fixed', inset: 0, background: '#0b0f0d', overflow: 'hidden', fontFamily: 'var(--font-inter), system-ui, sans-serif', color: '#f3f5ef', userSelect: 'none' }}>
      <style>{CSS}</style>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {showBg && screen !== 'results' && <div className="cc-scrim" />}

      {!ready && (
        <div className="cc-center">
          <div className="cc-logo">CLEAN CUT</div>
          <div className="cc-sub">Loading the neighborhood…</div>
        </div>
      )}

      {ready && screen === 'title' && (
        <Title
          saved={saved}
          onDaily={() => startDay('daily')}
          onFree={() => startDay('free')}
          onResume={resumeDay}
          onLeaders={() => setScreen('leaders')}
          onHelp={() => setScreen('help')}
          cats={cats.length}
          onCats={() => setScreen('cats')}
          quality={quality}
          onQuality={changeQuality}
          muted={muted}
          onMute={toggleMute}
        />
      )}

      {screen === 'help' && <Help onBack={() => setScreen('title')} />}

      {screen === 'cats' && <CatGallery cats={cats} onBack={() => setScreen('title')} />}

      {screen === 'board' && day && board && (
        <BoardScreen
          day={day}
          jobs={board.jobs}
          selected={selected}
          onSelect={setSelected}
          onGo={goTo}
          onEnd={endDay}
          onQuit={() => setScreen('title')}
        />
      )}

      {screen === 'loading' && (
        <div className="cc-center">
          <div className="cc-logo" style={{ fontSize: 44 }}>ON THE ROAD</div>
          <div className="cc-big-clock">{clockStr(loadClock)}</div>
          <div className="cc-bar" style={{ width: 280 }}><div style={{ width: `${loadPct * 100}%`, background: LIME }} /></div>
        </div>
      )}

      {screen === 'play' && hud && gameRef.current && (
        <Hud
          hud={hud}
          game={gameRef.current}
          job={gameRef.current.job!}
          dayMoney={day?.money ?? 0}
          toasts={toasts}
          touch={touch}
          onPause={() => {
            setPaused(true);
            gameRef.current?.setPaused(true);
          }}
          onFinish={() => {
            setConfirmFinish(true);
            setPaused(true);
            gameRef.current?.setPaused(true);
          }}
        />
      )}

      {screen === 'play' && paused && (
        <div className="cc-center cc-modal-wrap">
          <div className="cc-panel" style={{ width: 380 }}>
            <div className="cc-h">{confirmFinish ? 'FINISH THIS JOB?' : 'PAUSED'}</div>
            {confirmFinish && hud && (
              <p className="cc-p">
                You&apos;ve cut <b>{pct(hud.coverage)}</b> of the lawn and <b>{pct(hud.edges)}</b> of the edges. They pay full price only for a finished lawn.
              </p>
            )}
            <div className="cc-col">
              {confirmFinish ? (
                <button className="cc-btn cc-primary" onClick={() => finish()}>Finish &amp; get paid</button>
              ) : (
                <button className="cc-btn cc-primary" onClick={() => setConfirmFinish(true)}>Finish job</button>
              )}
              <button
                className="cc-btn"
                onClick={() => {
                  setPaused(false);
                  setConfirmFinish(false);
                  gameRef.current?.setPaused(false);
                }}
              >
                Keep mowing
              </button>
              {!confirmFinish && (
                <>
                  <button className="cc-btn" onClick={toggleMute}>{muted ? 'Sound: off' : 'Sound: on'}</button>
                  <button className="cc-btn cc-ghost" onClick={abandon}>Walk away (no pay)</button>
                </>
              )}
            </div>
            {!confirmFinish && <Controls compact />}
          </div>
        </div>
      )}

      {screen === 'results' && result && <Results r={result} onCollect={collect} />}

      {screen === 'dayEnd' && day && (
        <DayEnd
          day={day}
          name={name}
          onName={(n) => {
            setName(n);
            saveName(n);
          }}
          onDone={() => setScreen('leaders')}
          onTitle={() => {
            setDay(null);
            setScreen('title');
          }}
        />
      )}

      {screen === 'leaders' && <Leaders dateKey={day?.mode === 'daily' ? day.dateKey : todayKey()} onBack={() => setScreen('title')} />}
    </div>
  );
}

// ———————————————————————————————————————— title

function Title(props: {
  saved: DayState | null;
  onDaily: () => void;
  onFree: () => void;
  onResume: () => void;
  onLeaders: () => void;
  onHelp: () => void;
  cats: number;
  onCats: () => void;
  quality: Quality;
  onQuality: (q: Quality) => void;
  muted: boolean;
  onMute: () => void;
}) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return (
    <div className="cc-title">
      <div>
        <div className="cc-kicker">Lawn care · {today}</div>
        <div className="cc-logo cc-logo-xl">CLEAN<br />CUT</div>
        <div className="cc-tag">Ride. Stripe. Trim. Get paid before sundown.</div>
      </div>
      <div className="cc-menu">
        {props.saved && (
          <button className="cc-btn cc-primary" onClick={props.onResume}>
            Continue day · {clockStr(props.saved.minute)} · {money(props.saved.money)}
          </button>
        )}
        <button className={`cc-btn ${props.saved ? '' : 'cc-primary'}`} onClick={props.onDaily}>
          Daily challenge <span className="cc-dim">— same lawns for everyone today</span>
        </button>
        <button className="cc-btn" onClick={props.onFree}>Free play <span className="cc-dim">— a random day</span></button>
        <button className="cc-btn" onClick={props.onLeaders}>Leaderboards</button>
        {props.cats > 0 && (
          <button className="cc-btn cc-catbtn" onClick={props.onCats}>
            🐾 Cats rescued <span className="cc-catcount">{props.cats}</span>
          </button>
        )}
        <button className="cc-btn" onClick={props.onHelp}>How to play</button>
        <div className="cc-row" style={{ marginTop: 6 }}>
          <span className="cc-dim" style={{ fontSize: 12 }}>Graphics</span>
          {(['low', 'medium', 'high', 'ultra'] as Quality[]).map((q) => (
            <button key={q} className={`cc-chip ${props.quality === q ? 'on' : ''}`} onClick={() => props.onQuality(q)}>{q}</button>
          ))}
          <button className="cc-chip" onClick={props.onMute}>{props.muted ? '🔇' : '🔊'}</button>
        </div>
      </div>
    </div>
  );
}

function Controls({ compact }: { compact?: boolean }) {
  const rows: [string, string][] = [
    ['W A S D / arrows', 'Drive · walk'],
    ['Space', 'Blades on/off · hold to trim on foot'],
    ['R / F', 'Deck up / down'],
    ['E', 'Hop off with the trimmer / climb back on'],
    ['Walk up to a cat', 'Pick it up (on foot)'],
    ['Mouse', 'Look around (click to capture)'],
    ['C · wheel', 'Camera distance (4th is overhead)'],
    ['Enter', 'Finish job'],
    ['Esc / P', 'Pause'],
  ];
  return (
    <div className={compact ? 'cc-controls compact' : 'cc-controls'}>
      {rows.map(([k, v]) => (
        <div key={k} className="cc-ctl"><span className="cc-key">{k}</span><span>{v}</span></div>
      ))}
    </div>
  );
}

function Help({ onBack }: { onBack: () => void }) {
  return (
    <div className="cc-center cc-modal-wrap">
      <div className="cc-panel" style={{ width: 640, maxWidth: '92vw', maxHeight: '88vh', overflow: 'auto' }}>
        <div className="cc-h">HOW TO PLAY</div>
        <p className="cc-p">You have one day — 8 AM to 6 PM — to earn as much as you can. Pick jobs off the board; driving between them costs time.</p>
        <p className="cc-p"><b>Get paid in full</b> by cutting the whole lawn. Every clump you miss costs you. Pass over the same grass twice with the blades down and your <b>efficiency</b> drops — lift the blades (Space) when you turn or cross the cut.</p>
        <p className="cc-p"><b>Stripes are real.</b> Grass bends the way you drive. Mow alternating lanes and the lawn shows light and dark bands. Lay a couple of laps around the edge first, keep your runs straight, and match the client&apos;s request — stripes, diagonals or a checkerboard (mow it twice, crossways; the second pass is free when they ask for it). Style earns tips.</p>
        <p className="cc-p"><b>Trim last.</b> The deck can&apos;t reach right up to fences, trunks and walls. Hop off (E) and run the string trimmer along them — each edge you finish rings a bell. Long grass glows while you&apos;re on foot.</p>
        <p className="cc-p">Set the deck to the height they asked for, stay off the flower beds, and don&apos;t ram the shed.</p>
        <p className="cc-p"><b>🐾 Lost cats.</b> Some yards have a neighbor&apos;s cat hiding in them. Listen for meows. The mower scares cats, so hop off and walk up softly to pick it up, then carry it back to its owner for a reward. Every cat you bring home goes in your collection.</p>
        <Controls />
        <button className="cc-btn cc-primary" style={{ marginTop: 14 }} onClick={onBack}>Got it</button>
      </div>
    </div>
  );
}

// ———————————————————————————————————————— job board

function BoardScreen(props: { day: DayState; jobs: JobDef[]; selected: string | null; onSelect: (id: string) => void; onGo: (j: JobDef) => void; onEnd: () => void; onQuit: () => void }) {
  const { day, jobs } = props;
  const sel = jobs.find((j) => j.id === props.selected) ?? null;
  return (
    <div className="cc-board">
      <div className="cc-topbar">
        <div className="cc-logo" style={{ fontSize: 28 }}>CLEAN CUT</div>
        <div className="cc-dim">{day.mode === 'daily' ? `Daily · ${day.dateKey}` : 'Free play'}</div>
        <div style={{ flex: 1 }} />
        <div className="cc-stat"><span>Time</span><b>{clockStr(day.minute)}</b></div>
        <div className="cc-stat"><span>Earned</span><b style={{ color: LIME }}>{money(day.money)}</b></div>
        <button className="cc-btn cc-small" onClick={props.onEnd}>End day</button>
        <button className="cc-btn cc-small cc-ghost" onClick={props.onQuit}>Menu</button>
      </div>
      <div className="cc-board-body">
        <TownMap day={day} jobs={jobs} selected={props.selected} onSelect={props.onSelect} />
        <div className="cc-jobs">
          {jobs.map((j) => {
            const done = day.doneJobs.includes(j.id);
            const travel = travelMinutes(day.locX, day.locY, j.mapX, j.mapY);
            const late = day.minute + travel >= DAY_END - 10;
            const res = day.results.find((r) => r.jobId === j.id);
            return (
              <button key={j.id} className={`cc-job ${props.selected === j.id ? 'on' : ''} ${done ? 'done' : ''}`} onClick={() => !done && props.onSelect(j.id)} disabled={done}>
                <div className="cc-job-icon">{TEMPLATE_ICON[j.template]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cc-job-title">{j.title}{!done && hasLostCat(j) && <span title="A lost cat is around here" style={{ marginLeft: 6 }}>🐾</span>}</div>
                  <div className="cc-job-meta">{j.client} · {j.area.toLocaleString()} m² · {'●'.repeat(j.difficulty)}<span style={{ opacity: 0.3 }}>{'●'.repeat(5 - j.difficulty)}</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {done && res ? (
                    <>
                      <div className="cc-job-pay" style={{ color: LIME }}>{money(res.earned)}</div>
                      <div className="cc-job-meta">Grade {res.grade}</div>
                    </>
                  ) : (
                    <>
                      <div className="cc-job-pay">{money(j.pay)}</div>
                      <div className="cc-job-meta" style={{ color: late ? '#ff8a7a' : undefined }}>{travel} min drive</div>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {sel && (
          <div className="cc-detail">
            <div className="cc-kicker">{sel.street}</div>
            <div className="cc-h" style={{ fontSize: 34 }}>{sel.title.toUpperCase()}</div>
            <div className="cc-p" style={{ marginTop: 0 }}>{sel.client} — {sel.blurb}</div>
            <div className="cc-chips">
              <span className="cc-tagchip">{sel.area.toLocaleString()} m² of grass</span>
              <span className="cc-tagchip">{PATTERN_LABEL[sel.pattern]}</span>
              <span className="cc-tagchip">Cut at {sel.heightIn}&quot;</span>
              <span className="cc-tagchip">{sel.obstacles} things in the way</span>
              {hasLostCat(sel) && <span className="cc-tagchip cc-catchip">🐾 A neighbor lost their cat here</span>}
            </div>
            <DetailGo day={day} job={sel} onGo={props.onGo} />
          </div>
        )}
      </div>
    </div>
  );
}

function DetailGo({ day, job, onGo }: { day: DayState; job: JobDef; onGo: (j: JobDef) => void }) {
  const travel = travelMinutes(day.locX, day.locY, job.mapX, job.mapY);
  const arrive = day.minute + travel;
  const left = DAY_END - arrive;
  const late = left < 10;
  return (
    <div className="cc-row" style={{ marginTop: 14, gap: 14 }}>
      <div>
        <div className="cc-job-pay" style={{ fontSize: 34 }}>{money(job.pay)}</div>
        <div className="cc-dim" style={{ fontSize: 12 }}>at 100% · tips for style</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700 }}>Arrive {clockStr(arrive)}</div>
        <div className="cc-dim" style={{ fontSize: 12 }}>{late ? 'Too late today' : `${Math.floor(left / 60)}h ${left % 60}m of light left`}</div>
      </div>
      <button className="cc-btn cc-primary" disabled={late} onClick={() => onGo(job)}>Drive there →</button>
    </div>
  );
}

function TownMap({ day, jobs, selected, onSelect }: { day: DayState; jobs: JobDef[]; selected: string | null; onSelect: (id: string) => void }) {
  const roads = useMemo(() => {
    const out: string[] = [];
    let s = day.seed;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 1; i < 8; i++) {
      const y = i / 8 + (rnd() - 0.5) * 0.04;
      out.push(`M0 ${y * 100} C 30 ${(y + (rnd() - 0.5) * 0.08) * 100}, 70 ${(y + (rnd() - 0.5) * 0.08) * 100}, 100 ${y * 100}`);
    }
    for (let i = 1; i < 8; i++) {
      const x = i / 8 + (rnd() - 0.5) * 0.05;
      out.push(`M${x * 100} 0 C ${(x + (rnd() - 0.5) * 0.08) * 100} 35, ${(x + (rnd() - 0.5) * 0.08) * 100} 65, ${x * 100} 100`);
    }
    return out;
  }, [day.seed]);
  const sel = jobs.find((j) => j.id === selected);
  return (
    <div className="cc-map">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <pattern id="cc-grid" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M4 0H0V4" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.3" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="#14241a" />
        <rect width="100" height="100" fill="url(#cc-grid)" />
        <path d="M-5 72 C 20 60, 40 90, 62 70 S 95 55, 105 62" stroke="#1d4258" strokeWidth="5" fill="none" opacity="0.8" />
        {roads.map((d, i) => <path key={i} d={d} stroke="#2c3d33" strokeWidth={i % 3 === 0 ? 1.4 : 0.8} fill="none" />)}
        {sel && <line x1={day.locX * 100} y1={day.locY * 100} x2={sel.mapX * 100} y2={sel.mapY * 100} stroke={LIME} strokeWidth="0.5" strokeDasharray="1.5 1" />}
      </svg>
      <div className="cc-pin cc-shop" style={{ left: `${SHOP.x * 100}%`, top: `${SHOP.y * 100}%` }}>🏁<span>Shop</span></div>
      <div className="cc-truck" style={{ left: `${day.locX * 100}%`, top: `${day.locY * 100}%` }}>🛻</div>
      {jobs.map((j) => {
        const done = day.doneJobs.includes(j.id);
        return (
          <button key={j.id} className={`cc-pin ${selected === j.id ? 'on' : ''} ${done ? 'done' : ''}`} style={{ left: `${j.mapX * 100}%`, top: `${j.mapY * 100}%` }} onClick={() => !done && onSelect(j.id)}>
            {done ? '✓' : money(j.pay)}
          </button>
        );
      })}
    </div>
  );
}

// ———————————————————————————————————————— HUD

function Hud(props: { hud: HudState; game: Game; job: JobDef; dayMoney: number; toasts: Toast[]; touch: boolean; onPause: () => void; onFinish: () => void }) {
  const { hud, job } = props;
  const wantedIdx = DECK_HEIGHTS.indexOf(job.heightIn);
  const carrying = hud.cat?.state === 'carried';
  const hint = hud.nearCat
    ? `E — hop off and pick up ${hud.cat!.name}`
    : hud.mode === 'foot'
      ? hud.nearMower ? 'E — climb back on' : carrying ? `Carry ${hud.cat!.name} to ${hud.cat!.owner}` : 'Hold Space / click — trim · E near the mower to ride'
      : hud.blades ? (hud.coverage > 0.9 && hud.edges < 0.9 ? 'E — hop off and trim the edges' : 'Space — lift the blades for turns') : 'Space — blades down';
  return (
    <>
      {props.touch && <TouchSurface game={props.game} />}
      {hud.overlapFlash > 0.05 && <div className="cc-overlap" style={{ opacity: hud.overlapFlash * 0.8 }} />}
      <div className="cc-hud-tl">
        <div className="cc-jobcard">
          <div className="cc-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="cc-kicker" style={{ marginBottom: 2 }}>{job.client}</div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{job.title}</div>
            </div>
            <div className="cc-job-pay">{money(job.pay)}</div>
          </div>
          <div className="cc-chips" style={{ marginTop: 6 }}>
            <span className="cc-tagchip">{PATTERN_LABEL[job.pattern]}</span>
            <span className={`cc-tagchip ${hud.deckIndex === wantedIdx ? 'ok' : 'warn'}`}>Cut at {job.heightIn}&quot;</span>
          </div>
          <Meter label="Lawn cut" v={hud.coverage} color={LIME} />
          <Meter label="Efficiency" v={hud.efficiency} color={hud.efficiency > 0.85 ? '#7fd6ff' : hud.efficiency > 0.7 ? '#ffd166' : '#ff7a6b'} />
          <Meter label="Edges" v={hud.edges} color="#ffd166" />
          <button className="cc-btn cc-small" style={{ marginTop: 8, width: '100%' }} onClick={props.onFinish}>Finish job ⏎</button>
        </div>
        {hud.cat && <CatPoster cat={hud.cat} />}
      </div>
      <div className="cc-hud-tr">
        <div className="cc-clock">{clockStr(hud.clock)}</div>
        <div className="cc-money">{money(props.dayMoney)}</div>
        <button className="cc-chip" style={{ marginTop: 6 }} onClick={props.onPause}>❚❚ Pause</button>
      </div>
      <div className="cc-toasts">
        {props.toasts.map((t) => <div key={t.id} className={`cc-toast ${t.tone}`}>{t.text}</div>)}
      </div>
      <div className="cc-hud-bl">
        <Radar game={props.game} />
      </div>
      <div className="cc-hud-br">
        {hud.mode === 'mower' ? (
          <>
            <div className="cc-speed"><b>{hud.speedMph.toFixed(1)}</b><span>MPH</span></div>
            <div className={`cc-blades ${hud.blades ? 'on' : ''}`}>
              <div className="cc-spinner" style={{ animationDuration: `${hud.bladeRpm > 0.05 ? 0.25 / hud.bladeRpm : 999}s` }}>✶</div>
              BLADES {hud.blades ? 'DOWN' : 'UP'}
            </div>
            <div className="cc-deck">
              {DECK_HEIGHTS.map((h, i) => (
                <div key={h} className={`cc-deck-step ${i === hud.deckIndex ? 'on' : ''} ${i === wantedIdx ? 'want' : ''}`} title={`${h}"`} />
              ))}
              <span>{hud.heightIn.toFixed(1)}&quot; deck</span>
            </div>
          </>
        ) : (
          <div className={`cc-blades ${hud.trimming ? 'on' : ''}`}>TRIMMER {hud.trimming ? 'ON' : 'READY'}</div>
        )}
      </div>
      {!props.touch && (
        <div className="cc-hud-bc">
          <button
            className={`cc-btn cc-small cc-mount ${hud.mode === 'foot' ? '' : 'go'}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => props.game.toggleMount()}
          >
            {hud.mode === 'mower' ? (hud.nearCat ? `🐾 Hop off · get ${hud.cat!.name}` : '✂ Hop off & trim') : '🚜 Climb back on'} <span className="cc-key cc-key-sm">E</span>
          </button>
          <div className="cc-hint">{hint}</div>
        </div>
      )}
      {hud.stripeRun > 3 && <div className="cc-stripe">STRAIGHT · {Math.round(hud.stripeRun)} m</div>}
      {props.touch && <TouchButtons game={props.game} hud={hud} />}
      {props.touch && <div className="cc-rotate">↻ Turn your phone sideways for a bigger view</div>}
    </>
  );
}

function Meter({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="cc-meter" style={{ marginTop: 7 }}>
      <div className="cc-row" style={{ justifyContent: 'space-between', fontSize: 11, fontWeight: 600, opacity: 0.85 }}>
        <span>{label}</span>
        <span>{pct(v)}</span>
      </div>
      <div className="cc-bar"><div style={{ width: `${Math.min(100, v * 100)}%`, background: color }} /></div>
    </div>
  );
}

function Radar({ game }: { game: Game }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      const m = game.minimap();
      if (!c || !m) return;
      const ctx = c.getContext('2d')!;
      const S = c.width;
      const r = S / 2;
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r - 3, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#22361d';
      ctx.fillRect(0, 0, S, S);
      const scale = (S / 2) / 22; // px per meter: ~22 m radius
      const rot = -Math.PI / 2 - m.camYaw;
      ctx.translate(r, r);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      ctx.translate(-m.x, -m.z);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(m.bg, m.bgBox[0], m.bgBox[1], m.bgBox[2], m.bgBox[3]);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(m.lawn, m.lawnBox[0], m.lawnBox[1], m.lawnBox[2], m.lawnBox[3]);
      if (m.onFoot) {
        ctx.save();
        ctx.translate(m.mower.x, m.mower.z);
        ctx.rotate(m.mower.heading);
        ctx.fillStyle = ORANGE;
        ctx.fillRect(-0.9, -0.55, 1.8, 1.1);
        ctx.restore();
      }
      ctx.restore();
      // player arrow
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate(m.heading + rot + Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6.5, 7);
      ctx.lineTo(0, 3.5);
      ctx.lineTo(-6.5, 7);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
      // the cat's owner: a pink heart, pinned to the rim when they're off the map
      if (m.owner) {
        const dx = m.owner.x - m.x;
        const dz = m.owner.z - m.z;
        let sx = (dx * Math.cos(rot) - dz * Math.sin(rot)) * scale;
        let sy = (dx * Math.sin(rot) + dz * Math.cos(rot)) * scale;
        const lim = r - 12;
        const l = Math.hypot(sx, sy);
        if (l > lim) {
          sx = (sx / l) * lim;
          sy = (sy / l) * lim;
        }
        const pulse = m.owner.urgent ? 1 + Math.sin(performance.now() / 150) * 0.25 : 0.8;
        ctx.font = `${Math.round(16 * pulse)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💗', r + sx, r + sy);
      }
      // north marker
      const nAng = rot - Math.PI / 2;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', r + Math.cos(nAng) * (r - 12), r + Math.sin(nAng) * (r - 12));
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [game]);
  return <canvas ref={ref} width={190} height={190} className="cc-radar" />;
}

/** The drive/look surface. It sits *under* the rest of the HUD so Pause and Finish stay tappable. */
function TouchSurface({ game }: { game: Game }) {
  const move = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stickId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });
  const R = 52;
  const onStart = (e: React.TouchEvent) => {
    game.audio.start();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth * 0.45 && stickId.current === null) {
        stickId.current = t.identifier;
        origin.current = { x: t.clientX, y: t.clientY };
      } else if (lookId.current === null) {
        lookId.current = t.identifier;
        lookLast.current = { x: t.clientX, y: t.clientY };
      }
    }
  };
  const onMove = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId.current) {
        let dx = t.clientX - origin.current.x;
        let dy = t.clientY - origin.current.y;
        const l = Math.hypot(dx, dy);
        if (l > R) {
          dx = (dx / l) * R;
          dy = (dy / l) * R;
        }
        move.current = { x: dx / R, y: dy / R };
        setKnob({ x: dx, y: dy });
        game.setTouch(move.current, { x: 0, y: 0 });
      } else if (t.identifier === lookId.current) {
        const dx = t.clientX - lookLast.current.x;
        const dy = t.clientY - lookLast.current.y;
        lookLast.current = { x: t.clientX, y: t.clientY };
        game.setTouch(move.current, { x: dx, y: dy });
      }
    }
  };
  const onEnd = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId.current) {
        stickId.current = null;
        move.current = { x: 0, y: 0 };
        setKnob({ x: 0, y: 0 });
        game.setTouch(move.current, { x: 0, y: 0 });
      } else if (t.identifier === lookId.current) lookId.current = null;
    }
  };
  // a finger lifted mid-drive must never leave the mower stuck at full throttle
  useEffect(() => () => game.setTouch({ x: 0, y: 0 }, { x: 0, y: 0 }), [game]);
  return (
    <>
      <div className="cc-touch" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd} />
      <div className="cc-stick"><div style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} /></div>
    </>
  );
}

function TouchButtons({ game, hud }: { game: Game; hud: HudState }) {
  const tap = (fn: () => void) => (e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };
  return (
    <div className="cc-tbtns">
      {hud.mode === 'mower' ? (
        <>
          <button className={`cc-tbtn ${hud.blades ? 'on' : ''}`} onTouchStart={tap(() => game.toggleBlades())}>Blades</button>
          <button className="cc-tbtn" onTouchStart={tap(() => game.deck(1))}>Deck ▲ <small>{hud.heightIn}&quot;</small></button>
          <button className="cc-tbtn" onTouchStart={tap(() => game.deck(-1))}>Deck ▼</button>
        </>
      ) : (
        <button
          className={`cc-tbtn big ${hud.trimming ? 'on' : ''}`}
          onTouchStart={tap(() => game.setTrigger(true))}
          onTouchEnd={tap(() => game.setTrigger(false))}
          onTouchCancel={tap(() => game.setTrigger(false))}
        >
          Trim
        </button>
      )}
      <button className={`cc-tbtn ${hud.nearCat ? 'cat' : ''}`} onTouchStart={tap(() => game.toggleMount())}>
        {hud.mode === 'mower' ? (hud.nearCat ? '🐾 Hop off' : 'Hop off') : 'Ride'}
      </button>
      <button className="cc-tbtn" onTouchStart={tap(() => game.cycleCam())}>Cam</button>
    </div>
  );
}

// ———————————————————————————————————————— cats

/** A little cat face in the coat's colors, for the poster and the collection. */
function CatFace({ coat, size = 56 }: { coat: string; size?: number }) {
  const c = COATS[coat as CoatId] ?? COATS.ginger;
  const ear = c.pattern === 'points' && c.marks ? c.marks : c.base;
  const muzzle = c.bib || coat === 'calico' || coat === 'snow' ? '#f7f5ef' : c.pattern === 'points' && c.marks ? c.marks : c.base;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d="M14 46 L20 8 L44 30 Z" fill={ear} stroke="#0003" strokeWidth="2" />
      <path d="M86 46 L80 8 L56 30 Z" fill={ear} stroke="#0003" strokeWidth="2" />
      <path d="M21 36 L24 17 L36 30 Z" fill="#f2a0a8" />
      <path d="M79 36 L76 17 L64 30 Z" fill="#f2a0a8" />
      <ellipse cx="50" cy="56" rx="38" ry="34" fill={c.base} stroke="#0003" strokeWidth="2" />
      {c.pattern === 'tabby' && c.marks && (
        <g stroke={c.marks} strokeWidth="4" strokeLinecap="round">
          <path d="M50 24 L50 36" /><path d="M40 26 L42 36" /><path d="M60 26 L58 36" />
          <path d="M14 54 L24 56" /><path d="M86 54 L76 56" />
        </g>
      )}
      {c.pattern === 'patches' && (
        <>
          <ellipse cx="30" cy="40" rx="14" ry="12" fill={c.marks ?? '#000'} />
          <ellipse cx="72" cy="36" rx="12" ry="10" fill={c.marks2 ?? '#000'} />
        </>
      )}
      {c.pattern === 'points' && c.marks && <ellipse cx="50" cy="66" rx="20" ry="18" fill={c.marks} opacity="0.85" />}
      <ellipse cx="50" cy="70" rx="17" ry="12" fill={muzzle} opacity={muzzle === c.base ? 0 : 1} />
      <ellipse cx="35" cy="52" rx="8" ry="9" fill={c.eyes} />
      <ellipse cx="65" cy="52" rx="8" ry="9" fill={c.eyes} />
      <ellipse cx="35" cy="53" rx="2.6" ry="7" fill="#111" />
      <ellipse cx="65" cy="53" rx="2.6" ry="7" fill="#111" />
      <circle cx="37" cy="49" r="2" fill="#fff" />
      <circle cx="67" cy="49" r="2" fill="#fff" />
      <path d="M45 64 L55 64 L50 70 Z" fill="#f2a0a8" />
      <path d="M50 70 Q45 76 40 73 M50 70 Q55 76 60 73" stroke="#0007" strokeWidth="2" fill="none" />
      <g stroke="#fff" strokeWidth="1.5" opacity="0.8">
        <path d="M30 68 L6 64" /><path d="M30 72 L6 74" /><path d="M70 68 L94 64" /><path d="M70 72 L94 74" />
      </g>
    </svg>
  );
}

function CatPoster({ cat }: { cat: NonNullable<HudState['cat']> }) {
  const coat = COATS[cat.coat as CoatId];
  const line =
    cat.state === 'lost' ? 'Listen for meows. Hop off and walk up slowly.'
    : cat.state === 'carried' ? `Got ${cat.name}! Bring them to ${cat.owner} 💗`
    : `${cat.name} is home ♥`;
  return (
    <div className={`cc-poster ${cat.state}`}>
      <div className="cc-poster-face"><CatFace coat={cat.coat} size={52} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="cc-poster-k">{cat.state === 'home' ? 'Reunited' : 'Lost cat'} · ${cat.reward} reward</div>
        <div className="cc-poster-n">{cat.name}</div>
        <div className="cc-poster-d">{coat?.label} · {cat.owner}</div>
        <div className="cc-poster-l">{line}</div>
      </div>
    </div>
  );
}

function CatGallery({ cats, onBack }: { cats: RescuedCat[]; onBack: () => void }) {
  const total = cats.reduce((a, c) => a + c.reward, 0);
  return (
    <div className="cc-center cc-modal-wrap">
      <div className="cc-panel" style={{ width: 640, maxWidth: '94vw', maxHeight: '88vh', overflow: 'auto' }}>
        <div className="cc-h">CATS YOU BROUGHT HOME</div>
        <div className="cc-dim" style={{ marginBottom: 12 }}>{cats.length} {cats.length === 1 ? 'cat' : 'cats'} back with their families · ${total} in rewards</div>
        <div className="cc-catgrid">
          {[...cats].reverse().map((c, i) => (
            <div key={`${c.at}-${i}`} className="cc-catcard">
              <CatFace coat={c.coat} size={72} />
              <div className="cc-poster-n" style={{ fontSize: 18 }}>{c.name}</div>
              <div className="cc-poster-d">{COATS[c.coat as CoatId]?.label}</div>
              <div className="cc-poster-d">home with {c.owner}</div>
            </div>
          ))}
        </div>
        <button className="cc-btn" style={{ marginTop: 14 }} onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

// ———————————————————————————————————————— results

function useCountUp(target: number, delay: number, dur = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const step = () => {
      const k = Math.max(0, Math.min(1, (performance.now() - t0) / dur));
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, delay, dur]);
  return v;
}

function Results({ r, onCollect }: { r: ResultState; onCollect: () => void }) {
  const p = r.payout;
  const earned = useCountUp(p.earned, 700, 1400);
  const base = Math.round(r.job.pay * p.success);
  const rows: [string, number, string][] = [
    ['Lawn cut', p.coverage, LIME],
    ['Efficiency', p.efficiency, '#7fd6ff'],
    ['Edges trimmed', p.edges, '#ffd166'],
    ['Cut height', p.heightMatch, '#c9a7ff'],
    [`Pattern — ${p.pattern.name}`, Math.min(1, p.pattern.score), '#ff9bd2'],
  ];
  return (
    <div className="cc-results">
      <div className="cc-panel cc-results-panel">
        {r.timeUp && <div className="cc-kicker" style={{ color: '#ffb36b' }}>Sun&apos;s going down — job called</div>}
        <div className="cc-kicker">{r.job.client} · {r.minutes} min</div>
        <div className="cc-row" style={{ alignItems: 'center', gap: 16 }}>
          <div className="cc-h" style={{ fontSize: 40, margin: 0 }}>{r.job.title.toUpperCase()}</div>
          <div className={`cc-grade g-${p.grade}`}>{p.grade}</div>
        </div>
        {rows.map(([label, v, c], i) => (
          <ResultBar key={label} label={label} v={v} color={c} delay={150 + i * 140} />
        ))}
        {p.pattern.kind !== 'freestyle' && (
          <div className="cc-dim" style={{ fontSize: 12, marginTop: 6 }}>
            Lines {pct(p.pattern.coherence)} · Banding {pct(p.pattern.regularity)} · Border laps {pct(p.pattern.border)}
            {r.job.pattern !== 'any' && (p.patternMatched ? ' · ✓ what they asked for' : ' · ✗ not what they asked for')}
          </div>
        )}
        <div className="cc-ledger">
          <div><span>Pay at {pct(p.success)}</span><b>{money(base)}</b></div>
          <div><span>Tip for style</span><b style={{ color: LIME }}>+{money(p.tip)}</b></div>
          {p.damage > 0 && <div><span>Damage</span><b style={{ color: '#ff7a6b' }}>−{money(p.damage)}</b></div>}
          {r.cat && <div><span>🐾 Brought {r.cat.name} home to {r.cat.owner}</span><b style={{ color: '#ff8fb3' }}>+{money(r.cat.reward)}</b></div>}
          <div className="total"><span>Earned</span><b>{money(earned)}</b></div>
        </div>
        <button className="cc-btn cc-primary" style={{ width: '100%', marginTop: 14 }} onClick={onCollect}>Collect {money(p.earned)}</button>
      </div>
    </div>
  );
}

function ResultBar({ label, v, color, delay }: { label: string; v: number; color: string; delay: number }) {
  const val = useCountUp(v, delay, 700);
  return (
    <div style={{ marginTop: 10 }}>
      <div className="cc-row" style={{ justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
        <span>{label}</span>
        <span>{pct(val)}</span>
      </div>
      <div className="cc-bar" style={{ height: 8 }}><div style={{ width: `${val * 100}%`, background: color }} /></div>
    </div>
  );
}

// ———————————————————————————————————————— day end + leaderboards

function DayEnd({ day, name, onName, onDone, onTitle }: { day: DayState; name: string; onName: (n: string) => void; onDone: () => void; onTitle: () => void }) {
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const total = useCountUp(day.money, 300, 1600);
  const avg = day.results.length ? day.results.reduce((a, r) => a + r.success, 0) / day.results.length : 0;
  const submit = async () => {
    const n = name.trim();
    if (!n) {
      setErr('Put your name on it');
      return;
    }
    setPosting(true);
    const row = { name: n, day: day.dateKey, mode: day.mode, money: day.money, jobs: day.results.length, style: day.style, quality: Math.round(avg * 100) };
    addLocalScore({ ...row, at: Math.floor(Date.now() / 1000) });
    const e = await postScore(row);
    setPosting(false);
    setErr(e);
    setPosted(true);
    if (!e) setTimeout(onDone, 600);
  };
  return (
    <div className="cc-center cc-modal-wrap">
      <div className="cc-panel" style={{ width: 560, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="cc-kicker">{day.mode === 'daily' ? `Daily challenge · ${day.dateKey}` : 'Free play'} · day&apos;s done</div>
        <div className="cc-money" style={{ fontSize: 64, textAlign: 'left' }}>{money(total)}</div>
        <div className="cc-dim">{day.results.length} jobs · average job {pct(avg)} · {day.style} style points</div>
        <div className="cc-table">
          {day.results.map((r) => (
            <div key={r.jobId} className="cc-trow">
              <span className={`cc-grade sm g-${r.grade}`}>{r.grade}</span>
              <span style={{ flex: 1 }}>{r.title} <span className="cc-dim">· {r.client}</span></span>
              <span className="cc-dim" style={{ fontSize: 12 }}>{r.patternName}</span>
              <b style={{ width: 70, textAlign: 'right' }}>{money(r.earned)}</b>
            </div>
          ))}
          {day.results.length === 0 && <div className="cc-dim">No jobs finished today.</div>}
        </div>
        {!posted || err ? (
          <div className="cc-row" style={{ marginTop: 16, gap: 8 }}>
            <input className="cc-input" placeholder="Your name for the board" maxLength={18} value={name} onChange={(e) => onName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            <button className="cc-btn cc-primary" disabled={posting || day.money <= 0} onClick={submit}>{posting ? 'Posting…' : 'Post score'}</button>
          </div>
        ) : (
          <div style={{ marginTop: 16, color: LIME, fontWeight: 700 }}>Posted!</div>
        )}
        {err && <div style={{ color: '#ff9a8a', marginTop: 8, fontSize: 13 }}>{err}</div>}
        <div className="cc-row" style={{ marginTop: 12, gap: 8 }}>
          <button className="cc-btn" onClick={onDone}>Leaderboards</button>
          <button className="cc-btn cc-ghost" onClick={onTitle}>Main menu</button>
        </div>
      </div>
    </div>
  );
}

function Leaders({ dateKey, onBack }: { dateKey: string; onBack: () => void }) {
  const [tab, setTab] = useState<'today' | 'all' | 'free' | 'mine'>('today');
  const [data, setData] = useState<{ today: ScoreRow[]; allTime: ScoreRow[] } | null>(null);
  const [free, setFree] = useState<ScoreRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    void fetchBoard('daily', dateKey).then((d) => {
      if (d) setData(d);
      else setOffline(true);
    });
    void fetchBoard('free', '').then((d) => d && setFree(d.allTime));
  }, [dateKey]);
  const rows = tab === 'today' ? data?.today : tab === 'all' ? data?.allTime : tab === 'free' ? free : localScores();
  return (
    <div className="cc-center cc-modal-wrap">
      <div className="cc-panel" style={{ width: 560, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="cc-h">LEADERBOARDS</div>
        <div className="cc-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {([['today', `Today (${dateKey})`], ['all', 'Daily · all time'], ['free', 'Free play'], ['mine', 'This device']] as const).map(([k, l]) => (
            <button key={k} className={`cc-chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {offline && tab !== 'mine' && <div className="cc-dim" style={{ marginTop: 10 }}>Couldn&apos;t reach the online board.</div>}
        <div className="cc-table">
          {(rows ?? []).map((r, i) => (
            <div key={`${r.name}-${r.at}-${i}`} className="cc-trow">
              <span className="cc-rank">{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{r.name}</span>
              <span className="cc-dim" style={{ fontSize: 12 }}>{r.jobs} jobs · {r.quality}%{tab !== 'today' && r.mode === 'daily' ? ` · ${r.day}` : ''}</span>
              <b style={{ width: 80, textAlign: 'right', color: LIME }}>{money(r.money)}</b>
            </div>
          ))}
          {rows && rows.length === 0 && <div className="cc-dim">Nobody yet. Be first.</div>}
          {!rows && !offline && <div className="cc-dim">Loading…</div>}
        </div>
        <button className="cc-btn" style={{ marginTop: 14 }} onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

// ———————————————————————————————————————— styles

const CSS = `
.cc-scrim{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,8,6,.82) 0%,rgba(5,8,6,.35) 55%,rgba(5,8,6,.1) 100%);pointer-events:none}
.cc-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
.cc-modal-wrap{background:rgba(4,6,5,.45);backdrop-filter:blur(3px)}
.cc-logo{font-family:var(--font-anton),Impact,sans-serif;font-size:56px;letter-spacing:.02em;line-height:.9;color:#fff;text-shadow:0 3px 0 #000,0 0 24px rgba(0,0,0,.4)}
.cc-logo-xl{font-size:clamp(84px,13vw,170px);background:linear-gradient(180deg,#fff 0%,#e9ffb0 60%,${LIME} 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 4px 0 #0a0a0a) drop-shadow(0 12px 30px rgba(0,0,0,.5))}
.cc-sub{opacity:.7;font-size:14px}
.cc-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.16em;font-weight:700;opacity:.75;margin-bottom:6px}
.cc-tag{font-size:18px;font-weight:500;margin-top:14px;opacity:.9}
.cc-dim{opacity:.6}
.cc-title{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:clamp(24px,6vh,64px) clamp(20px,6vw,80px)}
.cc-menu{display:flex;flex-direction:column;gap:9px;max-width:420px}
.cc-btn{font:inherit;font-weight:700;font-size:15px;text-align:left;padding:13px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:${PANEL};color:#fff;cursor:pointer;transition:transform .12s,background .12s,border-color .12s;backdrop-filter:blur(8px)}
.cc-btn:hover:not(:disabled){transform:translateX(3px);border-color:rgba(198,244,50,.6)}
.cc-btn:disabled{opacity:.4;cursor:not-allowed}
.cc-primary{background:${LIME};color:#0c1206;border-color:${LIME}}
.cc-primary:hover:not(:disabled){background:#d8ff5a}
.cc-ghost{background:transparent}
.cc-small{padding:7px 12px;font-size:13px}
.cc-chip{font:inherit;font-size:12px;font-weight:700;padding:6px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.45);color:#fff;cursor:pointer;text-transform:capitalize}
.cc-chip.on{background:#fff;color:#000}
.cc-row{display:flex;align-items:center;gap:6px}
.cc-col{display:flex;flex-direction:column;gap:8px}
.cc-panel{background:rgba(10,14,12,.9);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:22px;box-shadow:0 30px 80px rgba(0,0,0,.5);backdrop-filter:blur(10px)}
.cc-h{font-family:var(--font-anton),Impact,sans-serif;font-size:30px;letter-spacing:.02em;margin-bottom:10px}
.cc-p{font-size:14px;line-height:1.55;opacity:.88;margin:8px 0}
.cc-bar{height:6px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:3px}
.cc-bar>div{height:100%;border-radius:4px;transition:width .25s}
.cc-big-clock{font-family:var(--font-anton),Impact,sans-serif;font-size:72px;color:#fff;text-shadow:0 3px 0 #000}
.cc-controls{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin-top:12px;font-size:13px}
.cc-controls.compact{grid-template-columns:1fr;font-size:12px;opacity:.8}
.cc-ctl{display:flex;gap:10px;align-items:center}
.cc-key{font-weight:800;font-size:11px;padding:3px 7px;border-radius:5px;background:rgba(255,255,255,.12);white-space:nowrap;min-width:90px;text-align:center}
.cc-board{position:absolute;inset:0;display:flex;flex-direction:column}
.cc-topbar{display:flex;align-items:center;gap:16px;padding:14px 20px;background:linear-gradient(180deg,rgba(0,0,0,.7),rgba(0,0,0,0))}
.cc-stat{display:flex;flex-direction:column;align-items:flex-end;line-height:1.1}
.cc-stat span{font-size:10px;text-transform:uppercase;letter-spacing:.14em;opacity:.6;font-weight:700}
.cc-stat b{font-family:var(--font-anton),Impact,sans-serif;font-size:24px;font-weight:400}
.cc-board-body{flex:1;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.9fr);grid-template-rows:1fr auto;gap:14px;padding:0 20px 20px;min-height:0}
.cc-map{position:relative;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.1);min-height:260px;box-shadow:inset 0 0 80px rgba(0,0,0,.5)}
.cc-pin{position:absolute;transform:translate(-50%,-100%);font:inherit;font-weight:800;font-size:13px;padding:5px 9px;border-radius:8px;background:#fff;color:#0c1206;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.5);white-space:nowrap}
.cc-pin::after{content:'';position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);border:6px solid transparent;border-top-color:inherit;border-top-color:#fff;border-bottom:0}
.cc-pin.on{background:${LIME};transform:translate(-50%,-100%) scale(1.15);z-index:2}
.cc-pin.on::after{border-top-color:${LIME}}
.cc-pin.done{background:#3a4a3e;color:#9fb59f;cursor:default}
.cc-pin.done::after{border-top-color:#3a4a3e}
.cc-shop{background:#ffd166;cursor:default;display:flex;gap:4px;align-items:center}
.cc-shop::after{border-top-color:#ffd166}
.cc-truck{position:absolute;transform:translate(-50%,-50%);font-size:24px;filter:drop-shadow(0 2px 3px #000);transition:left .6s,top .6s;pointer-events:none}
.cc-jobs{display:flex;flex-direction:column;gap:8px;overflow:auto;min-height:0}
.cc-job{display:flex;align-items:center;gap:12px;text-align:left;font:inherit;color:#fff;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:${PANEL};cursor:pointer;transition:border-color .12s,transform .12s}
.cc-job:hover:not(:disabled){border-color:rgba(198,244,50,.5)}
.cc-job.on{border-color:${LIME};box-shadow:0 0 0 1px ${LIME} inset}
.cc-job.done{opacity:.55;cursor:default}
.cc-job-icon{font-size:26px;width:40px;height:40px;display:grid;place-items:center;background:rgba(255,255,255,.06);border-radius:10px}
.cc-job-title{font-weight:800;font-size:15px}
.cc-job-meta{font-size:12px;opacity:.65;margin-top:2px}
.cc-job-pay{font-family:var(--font-anton),Impact,sans-serif;font-size:24px;color:#fff;letter-spacing:.01em}
.cc-detail{grid-column:1 / -1;background:${PANEL};border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:16px 20px;backdrop-filter:blur(8px)}
.cc-chips{display:flex;flex-wrap:wrap;gap:6px}
.cc-tagchip{font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.1)}
.cc-tagchip.ok{background:rgba(198,244,50,.2);color:${LIME}}
.cc-tagchip.warn{background:rgba(255,160,90,.2);color:#ffb37a}
.cc-hud-tl{position:absolute;top:16px;left:16px;width:250px}
.cc-jobcard{background:${PANEL};border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 14px;backdrop-filter:blur(6px)}
.cc-hud-tr{position:absolute;top:14px;right:20px;text-align:right;display:flex;flex-direction:column;align-items:flex-end}
.cc-clock{font-family:var(--font-anton),Impact,sans-serif;font-size:38px;color:#fff;-webkit-text-stroke:1.5px #000;text-shadow:0 3px 0 #000;line-height:1}
.cc-money{font-family:var(--font-anton),Impact,sans-serif;font-size:44px;color:#7ee25a;-webkit-text-stroke:1.5px #000;text-shadow:0 3px 0 #000;line-height:1.05}
.cc-hud-bl{position:absolute;left:18px;bottom:18px}
.cc-radar{width:190px;height:190px;border-radius:50%;border:3px solid rgba(0,0,0,.85);box-shadow:0 0 0 2px rgba(255,255,255,.25),0 8px 24px rgba(0,0,0,.5)}
.cc-hud-br{position:absolute;right:20px;bottom:20px;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.cc-speed{display:flex;align-items:baseline;gap:6px}
.cc-speed b{font-family:var(--font-anton),Impact,sans-serif;font-size:56px;font-weight:400;-webkit-text-stroke:1.5px #000;text-shadow:0 3px 0 #000;line-height:1}
.cc-speed span{font-weight:800;font-size:13px;opacity:.85;text-shadow:0 1px 2px #000}
.cc-blades{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;letter-spacing:.08em;padding:7px 12px;border-radius:999px;background:${PANEL};border:1px solid rgba(255,255,255,.15)}
.cc-blades.on{background:${ORANGE};border-color:${ORANGE};color:#fff;box-shadow:0 0 18px rgba(255,106,31,.5)}
.cc-spinner{display:inline-block;animation:cc-spin linear infinite}
@keyframes cc-spin{to{transform:rotate(360deg)}}
.cc-deck{display:flex;align-items:flex-end;gap:3px;font-weight:700;font-size:12px;background:${PANEL};padding:7px 10px;border-radius:10px}
.cc-deck span{margin-left:8px}
.cc-deck-step{width:7px;height:16px;border-radius:2px;background:rgba(255,255,255,.18);position:relative}
.cc-deck-step.want{box-shadow:0 0 0 1.5px ${LIME}}
.cc-deck-step.on{background:#fff}
.cc-hud-bc{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px}
.cc-hint{font-size:13px;font-weight:600;padding:7px 14px;border-radius:999px;background:rgba(0,0,0,.5);white-space:nowrap}
.cc-mount{display:flex;align-items:center;gap:10px}
.cc-mount.go{border-color:rgba(255,209,102,.6)}
.cc-mount:hover:not(:disabled){transform:translateY(-2px)}
.cc-key-sm{min-width:0;padding:2px 7px}
.cc-poster{margin-top:10px;display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;background:#fff8ec;color:#2a1d14;border:2px dashed #e8a35b;box-shadow:0 6px 18px rgba(0,0,0,.35);transform:rotate(-1.2deg)}
.cc-poster.carried{background:#ffe3ee;border-color:#ff5c8a;animation:cc-wiggle 1.2s ease-in-out infinite}
.cc-poster.home{background:#e9ffd6;border-color:${LIME};border-style:solid}
@keyframes cc-wiggle{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(1.2deg) scale(1.02)}}
.cc-poster-face{flex:none;border-radius:50%;background:#fff;box-shadow:0 0 0 2px rgba(0,0,0,.08)}
.cc-poster-k{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#c2410c}
.cc-poster.carried .cc-poster-k{color:#d6336c}
.cc-poster-n{font-family:var(--font-anton),Impact,sans-serif;font-size:22px;line-height:1.05}
.cc-poster-d{font-size:11px;opacity:.75}
.cc-poster-l{font-size:11.5px;font-weight:700;margin-top:3px}
.cc-catbtn{background:linear-gradient(90deg,rgba(255,92,138,.3),${PANEL});border-color:rgba(255,143,179,.5);display:flex;align-items:center;gap:8px}
.cc-catcount{margin-left:auto;background:#ff5c8a;color:#fff;border-radius:999px;padding:1px 9px;font-size:13px}
.cc-catchip{background:rgba(255,92,138,.22);color:#ffb3cb}
.cc-catgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
.cc-catcard{background:#fff8ec;color:#2a1d14;border-radius:14px;padding:12px 8px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px;box-shadow:0 6px 16px rgba(0,0,0,.3)}
.cc-tbtn.cat{background:#ff5c8a;border-color:#ff8fb3}
.cc-tbtn small{font-size:10px;opacity:.7}
.cc-rotate{display:none}
/* phones and tablets: thumbs own the bottom corners, everything else gets out of their way */
.cc-touchui .cc-hud-br{display:none}
.cc-touchui .cc-hud-tl{width:200px;top:8px;left:8px}
.cc-touchui .cc-jobcard{padding:8px 10px}
.cc-touchui .cc-jobcard .cc-chips,.cc-touchui .cc-jobcard .cc-meter+.cc-meter{display:none}
.cc-touchui .cc-poster{padding:6px 8px;gap:8px}
.cc-touchui .cc-poster-face svg{width:38px;height:38px}
.cc-touchui .cc-poster-n{font-size:17px}
.cc-touchui .cc-poster-l{display:none}
.cc-touchui .cc-hud-tr{top:8px;right:10px}
.cc-touchui .cc-clock{font-size:24px}
.cc-touchui .cc-money{font-size:28px}
.cc-touchui .cc-hud-bl{left:auto;bottom:auto;right:10px;top:96px}
.cc-touchui .cc-radar{width:104px;height:104px}
.cc-touchui .cc-stick{left:24px;bottom:24px}
.cc-touchui .cc-tbtns{right:12px;bottom:14px;grid-template-columns:repeat(3,auto)}
.cc-touchui .cc-toasts{top:auto;bottom:150px}
.cc-touchui .cc-toast{font-size:13px}
.cc-touchui .cc-toast.gold{font-size:18px}
@media (orientation: portrait){
  .cc-touchui .cc-rotate{display:block;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.6);padding:8px 14px;border-radius:999px;font-size:13px;font-weight:700;pointer-events:none;white-space:nowrap;animation:cc-fade 6s forwards}
  .cc-touchui .cc-hud-bl{top:auto;bottom:200px}
}
@keyframes cc-fade{0%,70%{opacity:1}100%{opacity:0}}
.cc-stripe{position:absolute;bottom:62px;left:50%;transform:translateX(-50%);font-family:var(--font-anton),Impact,sans-serif;font-size:22px;color:${LIME};text-shadow:0 2px 0 #000;letter-spacing:.06em}
.cc-toasts{position:absolute;top:18px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.cc-toast{font-weight:800;font-size:15px;padding:8px 16px;border-radius:10px;background:rgba(0,0,0,.72);border:1px solid rgba(255,255,255,.1);animation:cc-pop .35s cubic-bezier(.2,1.6,.4,1)}
.cc-toast.good{color:${LIME}}
.cc-toast.bad{color:#ff8a7a}
.cc-toast.gold{color:#ffd166;font-family:var(--font-anton),Impact,sans-serif;font-weight:400;font-size:22px;letter-spacing:.03em}
@keyframes cc-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
.cc-overlap{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 120px 30px rgba(255,60,40,.55)}
.cc-results{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-start;padding:0 clamp(16px,5vw,64px);background:linear-gradient(90deg,rgba(0,0,0,.6),rgba(0,0,0,0) 60%)}
.cc-results-panel{width:440px;max-width:92vw;animation:cc-pop .45s cubic-bezier(.2,1.3,.4,1)}
.cc-grade{font-family:var(--font-anton),Impact,sans-serif;font-size:54px;width:74px;height:74px;display:grid;place-items:center;border-radius:14px;transform:rotate(-8deg);border:4px solid currentColor;animation:cc-stamp .5s .5s both cubic-bezier(.2,1.8,.4,1)}
.cc-grade.sm{font-size:16px;width:28px;height:28px;border-width:2px;border-radius:7px;animation:none;transform:none}
@keyframes cc-stamp{from{transform:rotate(-8deg) scale(2.6);opacity:0}to{transform:rotate(-8deg) scale(1);opacity:1}}
.g-S{color:#ffd166}.g-A{color:${LIME}}.g-B{color:#7fd6ff}.g-C{color:#c9a7ff}.g-D{color:#ffb37a}.g-F{color:#ff7a6b}
.cc-ledger{margin-top:16px;border-top:1px solid rgba(255,255,255,.12);padding-top:10px;display:flex;flex-direction:column;gap:5px;font-size:14px}
.cc-ledger>div{display:flex;justify-content:space-between}
.cc-ledger .total{margin-top:6px;font-size:16px}
.cc-ledger .total b{font-family:var(--font-anton),Impact,sans-serif;font-size:40px;font-weight:400;color:#7ee25a;line-height:1}
.cc-table{display:flex;flex-direction:column;gap:4px;margin-top:14px}
.cc-trow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.04);font-size:14px}
.cc-rank{font-family:var(--font-anton),Impact,sans-serif;width:24px;opacity:.7}
.cc-input{flex:1;font:inherit;font-size:15px;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.4);color:#fff;outline:none}
.cc-input:focus{border-color:${LIME}}
.cc-touch{position:absolute;inset:0;touch-action:none}
.cc-stick{position:absolute;left:44px;bottom:44px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.2);pointer-events:none;display:grid;place-items:center}
.cc-stick>div{width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.5)}
.cc-tbtns{position:absolute;right:16px;bottom:120px;display:grid;grid-template-columns:repeat(2,auto);gap:8px}
.cc-tbtn{font:inherit;font-weight:800;font-size:13px;padding:14px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.55);color:#fff;min-width:74px}
.cc-tbtn.on{background:${ORANGE}}
.cc-tbtn.big{grid-column:span 2;padding:22px}
@media (max-width: 820px){
  .cc-board-body{grid-template-columns:1fr;grid-template-rows:220px auto auto;overflow:auto}
  .cc-hud-tl{width:200px;top:10px;left:10px}
  .cc-radar{width:130px;height:130px}
  .cc-hud-bl{left:auto;right:12px;top:110px;bottom:auto}
  .cc-hud-tr{top:10px;right:12px}
  .cc-clock{font-size:26px}.cc-money{font-size:30px}
  .cc-speed b{font-size:36px}
  .cc-hud-br{bottom:auto;top:250px;right:12px}
  .cc-stick{left:28px;bottom:28px}
}
`;
