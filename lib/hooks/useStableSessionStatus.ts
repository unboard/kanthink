'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';

/**
 * The session status, minus the flicker.
 *
 * next-auth reports "unauthenticated" whenever one session check fails — a network
 * blip, a slow cold start, the refetch it does every time you come back to the tab.
 * For someone who is signed in that's almost always wrong, and anything that switches
 * on it flashes a signed-out screen at them.
 *
 * So a drop to "unauthenticated" from someone known to be signed in (now, or on an
 * earlier visit on this device) is checked again before it's believed. Until a
 * re-check agrees, this keeps saying "authenticated". A real sign-out is confirmed
 * within a few seconds; a blip never shows.
 */

const SIGNED_IN_KEY = 'kanthink-signed-in';
const RETRY_DELAYS_MS = [800, 2500, 6000];

const listeners = new Set<() => void>();
function readRemembered() {
  try { return localStorage.getItem(SIGNED_IN_KEY) === '1'; } catch { return false; }
}
function writeRemembered(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch { /* storage unavailable: worst case, one unconfirmed sign-out shows */ }
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export type StableSessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export function useStableSessionStatus(): StableSessionStatus {
  const { status, update } = useSession();
  // False on the server and during hydration, so the first render matches.
  const remembered = useSyncExternalStore(subscribe, readRemembered, () => false);
  const [confirmedOut, setConfirmedOut] = useState(false);
  // A confirmed sign-out belongs to one episode: signing back in clears it, so the
  // next blip gets re-checked rather than believed. (Adjusting state during render
  // on a prop change is the pattern React recommends over an effect for this.)
  const [seenStatus, setSeenStatus] = useState(status);
  if (status !== seenStatus) {
    setSeenStatus(status);
    if (status === 'authenticated' && confirmedOut) setConfirmedOut(false);
  }

  useEffect(() => {
    if (status === 'authenticated' && !readRemembered()) writeRemembered(true);
  }, [status]);

  useEffect(() => {
    if (status !== 'unauthenticated') return;
    let canceled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Never signed in on this device: nothing to doubt.
    if (!readRemembered()) {
      timers.push(setTimeout(() => { if (!canceled) setConfirmedOut(true); }, 0));
      return () => { canceled = true; timers.forEach(clearTimeout); };
    }

    // Was signed in: ask again a few times before believing it.
    let attempt = 0;
    const giveUp = () => { writeRemembered(false); setConfirmedOut(true); };
    const retry = () => {
      if (canceled) return;
      update()
        .then((session) => {
          if (canceled || session) return; // a session came back; status flips to authenticated
          attempt += 1;
          if (attempt < RETRY_DELAYS_MS.length) timers.push(setTimeout(retry, RETRY_DELAYS_MS[attempt]));
          else giveUp();
        })
        .catch(() => {
          if (canceled) return;
          attempt += 1;
          if (attempt < RETRY_DELAYS_MS.length) timers.push(setTimeout(retry, RETRY_DELAYS_MS[attempt]));
          // Errors all the way down are a network problem, not a sign-out. Stay put.
        });
    };
    timers.push(setTimeout(retry, RETRY_DELAYS_MS[0]));
    return () => { canceled = true; timers.forEach(clearTimeout); };
  }, [status, update]);

  if (status === 'authenticated') return 'authenticated';
  if (status === 'unauthenticated' && confirmedOut) return 'unauthenticated';
  // Loading, or a sign-out not yet confirmed.
  return remembered ? 'authenticated' : 'loading';
}
