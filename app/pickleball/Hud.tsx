'use client';

// Pickleball: what's on screen during a game. The court is the star; this stays at the
// edges: the scoreboard with everyone's face and heat, the announcer's banner, and the
// awards when it's over.

import { DEVICE_LABEL, type Hud as HudData } from './controller';
import { TEAM_COLORS } from './render';
import type { Team } from './sim';
import type { Sport } from './sport';
import { Center, Key, Portrait, Spinner, btnGhost, btnPrimary, panel } from './ui';

export function GameHud({ sport, hud, onLeave, onRematch, onLobby, devices }: {
  sport: Sport;
  hud: HudData;
  onLeave: () => void;
  onRematch: () => void;
  onLobby?: () => void;
  devices: string[];
}) {
  const online = hud.mode === 'host' || hud.mode === 'guest';
  const team = (t: Team) => hud.players.map((p, i) => ({ ...p, i })).filter((p) => p.team === t);
  const teamName = (t: Team) => team(t).map((p) => p.name).join(' & ');
  const point = hud.phase === 'point' && hud.lastPoint ? hud.lastPoint : null;
  const hostGone = hud.mode === 'guest' && !hud.hostHere;
  const reconnecting = online && (hud.status === 'reconnecting' || hud.status === 'connecting');
  const serverName = hud.players[hud.server]?.name ?? '';
  const myServe = hud.localSeats.includes(hud.server);
  const act = sport.action.toLowerCase();

  return (
    <>
      {/* scoreboard */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2 pt-[max(8px,env(safe-area-inset-top))] sm:p-4">
        <div className={`${panel} flex origin-top scale-[0.82] items-stretch gap-0 overflow-hidden rounded-[28px] p-0 sm:scale-100`}>
          {([0, 1] as Team[]).map((t) => (
            <div key={t} className={`flex items-center gap-3 px-3 py-2.5 sm:px-4 ${t === 1 ? 'flex-row-reverse' : ''}`} style={{ background: `linear-gradient(${t === 0 ? 90 : 270}deg, ${TEAM_COLORS[t]}33, transparent)` }}>
              <div className={`flex ${t === 1 ? 'flex-row-reverse' : ''} -space-x-2`}>
                {team(t).map((p) => (
                  <div key={p.i} className="relative flex flex-col items-center">
                    <Portrait c={p.char} size={42} ring={p.fire ? '#ff6a1a' : TEAM_COLORS[t]} className={p.fire ? 'animate-pulse' : ''} />
                    <div className="mt-1 h-1.5 w-10 overflow-hidden rounded-full bg-black/40">
                      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${p.fire ? 100 : p.heat}%`, background: p.fire ? 'linear-gradient(90deg,#ffd166,#ff3d00)' : p.heat >= 50 ? '#ff8c42' : '#ffd166' }} />
                    </div>
                    {p.fire && <span className="absolute -top-2 text-[15px]">🔥</span>}
                  </div>
                ))}
              </div>
              <div className={`hidden min-w-0 sm:block ${t === 1 ? 'text-right' : ''}`}>
                <div className="max-w-[150px] truncate text-[13px] font-bold">{teamName(t)}</div>
                <div className="text-[11px] text-white/50">{hud.servingTeam === t ? (hud.sport === 'pickleball' && hud.format === 'doubles' ? `serving · ${hud.serverNum === 1 ? '1st' : '2nd'} server` : 'serving') : ' '}</div>
              </div>
              <div className="w-12 text-center font-mono text-[40px] font-black leading-none tabular-nums" style={{ color: TEAM_COLORS[t] }}>{hud.scores[t]}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[calc(max(8px,env(safe-area-inset-top))+66px)] flex justify-center sm:top-[92px]">
        <div className="rounded-full bg-black/40 px-3 py-1 text-[12px] font-semibold text-white/75 backdrop-blur">
          <span className="font-mono text-white">{hud.scoreCall}</span> · {serverName} serves
        </div>
      </div>

      <div className="pointer-events-auto absolute right-[max(8px,env(safe-area-inset-right))] top-[max(8px,env(safe-area-inset-top))] flex items-center gap-2 sm:right-4 sm:top-4">
        {online && hud.roomCode && <div className={`${panel} hidden rounded-2xl px-3 py-2 font-mono text-[13px] tracking-[0.2em] text-[#dcff3d] md:block`}>{hud.roomCode}</div>}
        <button className={`${panel} rounded-2xl px-3 py-1.5 text-[12px] font-semibold hover:bg-white/10 sm:px-3.5 sm:py-2 sm:text-[13px]`} onClick={onLeave}>Leave</button>
      </div>

      {/* the announcer */}
      {hud.callout && (
        <div key={hud.callout.seq} className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center px-4">
          <div
            className="pb-callout -skew-x-6 rounded-2xl border-2 px-7 py-3 text-center shadow-2xl"
            style={{
              borderColor: ['fire', 'smash', 'super', 'boom', 'kill'].includes(hud.callout.kind) ? '#ff6a1a' : hud.callout.kind === 'cooled' || hud.callout.kind === 'doused' ? '#7fd8ff' : hud.callout.team !== null ? TEAM_COLORS[hud.callout.team] : '#dcff3d',
              background: ['fire', 'super', 'boom'].includes(hud.callout.kind) ? 'linear-gradient(135deg,#3a1204ee,#7a2a00ee)' : 'linear-gradient(135deg,#0b1424ee,#16284aee)',
            }}
          >
            <div className="skew-x-6 text-[clamp(22px,4vw,38px)] font-black uppercase italic leading-none tracking-tight text-white">{hud.callout.text}</div>
            <div className="mt-1 skew-x-6 text-[14px] font-semibold text-white/75">{hud.callout.sub}</div>
          </div>
        </div>
      )}

      {/* the rally */}
      {point && !hud.callout && (
        <div className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center px-4">
          <div className={`${panel} rounded-2xl px-5 py-3 text-center`}>
            <div className="text-[19px] font-black">
              {sport.pointTitle(point, teamName)}
            </div>
            <div className="mt-0.5 text-[13.5px] text-white/65">
              {point.faultBy >= 0 ? `${hud.players[point.faultBy]?.name}: ` : ''}{sport.faultText(point.reason)}
            </div>
          </div>
        </div>
      )}

      {hud.toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[38%] flex justify-center sm:bottom-24">
          <div className="rounded-full bg-[#dcff3d] px-4 py-2 text-[14px] font-bold text-[#14200a] shadow-xl">{hud.toast}</div>
        </div>
      )}

      {hud.phase === 'serve' && myServe && !hostGone && (
        <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-3 ${hud.touch ? 'top-[calc(max(8px,env(safe-area-inset-top))+104px)]' : 'bottom-[76px]'}`}>
          <div className={`${panel} rounded-2xl px-4 py-2 text-center text-[13px] sm:text-[14px]`}>
            {sport.serveHint(null as never, serverName, hud.localSeats.length > 1)}
          </div>
        </div>
      )}

      {/* controls */}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 hidden justify-center p-3 ${hud.touch ? '' : 'sm:flex'}`}>
        <div className={`${panel} flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 rounded-2xl px-4 py-2 text-[12px] text-white/70`}>
          {devices.map((d, k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="mr-1 font-semibold text-white/90">{d}</span>
              {d === DEVICE_LABEL.keysL ? <><Key>WASD</Key> move · <Key>Space</Key> {act}</>
                : d === DEVICE_LABEL.keysR ? <><Key>←↑↓→</Key> move · <Key>Enter</Key> {act}</>
                  : d.startsWith('Gamepad') ? <>stick · <Key>A</Key> {act}</>
                    : d === DEVICE_LABEL.touch ? null : <><Key>WASD</Key>/<Key>←↑↓→</Key> move · <Key>Space</Key> {act}</>}
            </span>
          ))}
          <span>{sport.hint}</span>
        </div>
      </div>

      {hostGone && hud.phase !== 'over' && (
        <Center>
          <div className={`${panel} w-[min(400px,calc(100vw-32px))] p-6 text-center`}>
            <div className="text-[18px] font-bold"><Spinner />The host left</div>
            <p className="mt-2 text-[14px] text-white/65">The game is paused. If they come back to this room, play picks up where it left off.</p>
            <button className={`${btnGhost} mt-4`} onClick={onLeave}>Leave room</button>
          </div>
        </Center>
      )}
      {reconnecting && !hostGone && (
        <div className="pointer-events-none absolute inset-x-0 top-[120px] flex justify-center">
          <div className={`${panel} rounded-2xl px-4 py-2 text-[13px]`}><Spinner />Reconnecting…</div>
        </div>
      )}

      {hud.phase === 'over' && hud.winner !== -1 && (
        <GameOver sport={sport} hud={hud} onRematch={onRematch} onLobby={onLobby} onLeave={onLeave} teamName={teamName} />
      )}
    </>
  );
}

function GameOver({ sport, hud, onRematch, onLobby, onLeave, teamName }: {
  sport: Sport;
  hud: HudData;
  onRematch: () => void;
  onLobby?: () => void;
  onLeave: () => void;
  teamName: (t: Team) => string;
}) {
  const w = hud.winner as Team;
  const awards = sport.awards(hud.players);
  const guest = hud.mode === 'guest';
  return (
    <Center>
      <div className={`${panel} max-h-[calc(100dvh-24px)] w-[min(720px,calc(100vw-24px))] overflow-y-auto p-4 text-center sm:p-8`}>
        <div className="text-[12px] font-bold uppercase tracking-[0.2em] text-white/45">Champs of the court</div>
        <div className="mt-1 text-[clamp(28px,5vw,44px)] font-black leading-tight" style={{ color: TEAM_COLORS[w] }}>{teamName(w)}</div>
        <div className="mt-1 font-mono text-[22px] font-bold tabular-nums text-white/80">{hud.scores[w]} – {hud.scores[w === 0 ? 1 : 0]}</div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-6 sm:grid-cols-4 sm:gap-3">
          {awards.map((a) => {
            const p = hud.players[a.player];
            return (
              <div key={a.player} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <div className="flex justify-center"><Portrait c={p.char} size={64} ring={TEAM_COLORS[p.team]} /></div>
                <div className="mt-2 truncate text-[14px] font-bold">{p.name}</div>
                <div className="mt-1 text-[13px] font-black uppercase italic text-[#dcff3d]">{a.title}</div>
                <div className="text-[12px] text-white/55">{a.line}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <button className={btnPrimary} onClick={onRematch}>{guest ? 'Ask for a rematch' : 'Rematch'}</button>
          {onLobby && hud.mode === 'host' && <button className={btnGhost} onClick={onLobby}>Change teams</button>}
          <button className={btnGhost} onClick={onLeave}>Menu</button>
        </div>
        {hud.mode === 'host' && hud.rematchAsks > 0 && <p className="mt-3 text-[14px] font-semibold text-[#dcff3d]">{hud.rematchAsks === 1 ? 'Someone wants' : `${hud.rematchAsks} people want`} a rematch.</p>}
        {guest && <p className="mt-3 text-[13px] text-white/50">The host starts the next game.</p>}
      </div>
    </Center>
  );
}
