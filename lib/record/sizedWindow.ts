// Open the page you're demoing in a window whose *viewport* is an exact size,
// so a "mobile" recording is actually mobile-sized instead of eyeballed by
// dragging the window edge.
//
// The hard part is that window.open sizes the whole window, chrome included, so
// asking for 393x852 gets you a 393x852 window with a ~390x780 viewport — and
// the error changes with the browser, the OS, and whether a bookmarks bar is on.
// You cannot measure a cross-origin window to correct for it.
//
// So: open about:blank first. It inherits our origin, which means we can read
// its innerWidth/innerHeight, compare against what we asked for, and resize by
// exactly the difference. Only then do we navigate to the target URL. By the
// time the page loads, the viewport is right to the pixel.

export interface DevicePreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

// CSS-pixel viewports, not physical panel sizes — these are what the page sees.
export const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'iphone-15-pro', label: 'iPhone 15 Pro', width: 393, height: 852 },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667 },
  { id: 'pixel-8', label: 'Pixel 8', width: 412, height: 915 },
  { id: 'ipad-mini', label: 'iPad mini', width: 744, height: 1133 },
];

export interface OpenSizedResult {
  ok: boolean;
  /** Set when the window could not be opened or sized; safe to show verbatim. */
  error?: string;
  /** The viewport actually achieved, once corrected. */
  actual?: { width: number; height: number };
}

const WINDOW_NAME = 'kanRecordTarget';

function normalizeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProto).href;
  } catch {
    return null;
  }
}

/** Resolve once the popup's blank document is measurable, or null on timeout. */
function waitForMeasurable(w: Window, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (w.closed) return resolve(false);
      try {
        // Throws if the document isn't ours yet; 0 means not laid out yet.
        if (w.innerWidth > 0 && w.innerHeight > 0) return resolve(true);
      } catch {
        // Not readable yet — keep waiting.
      }
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(tick, 30);
    };
    tick();
  });
}

/**
 * Open `url` in a popup whose viewport measures width x height.
 * Must be called directly from a user gesture or the popup is blocked.
 */
export async function openSizedWindow(
  url: string,
  width: number,
  height: number
): Promise<OpenSizedResult> {
  const target = normalizeUrl(url);
  if (!target) return { ok: false, error: 'That doesn’t look like a valid URL.' };

  // Never open larger than the display, or the OS clamps it and the correction
  // below chases a size it can never reach.
  const maxW = window.screen.availWidth;
  const maxH = window.screen.availHeight;
  const wantW = Math.min(width, maxW);
  const wantH = Math.min(height, maxH);

  const features = [
    'popup=yes',
    `width=${wantW}`,
    `height=${wantH}`,
    'menubar=no',
    'toolbar=no',
    'status=no',
    'scrollbars=yes',
  ].join(',');

  const win = window.open('about:blank', WINDOW_NAME, features);
  if (!win) {
    return { ok: false, error: 'Your browser blocked the popup. Allow popups for this site and try again.' };
  }

  const measurable = await waitForMeasurable(win);
  if (!measurable) {
    // Sizing failed, but the window exists — send it to the URL anyway rather
    // than leaving the user staring at a blank popup.
    try { win.location.href = target; } catch { /* nothing useful to do */ }
    return { ok: false, error: 'Opened the window, but couldn’t measure it to set an exact size.' };
  }

  // Correct by the difference between the viewport we got and the one we asked
  // for. Two passes: the first resize can itself change the chrome (a scrollbar
  // appearing, the window snapping to a screen edge), so measure again.
  for (let pass = 0; pass < 2; pass++) {
    const dw = wantW - win.innerWidth;
    const dh = wantH - win.innerHeight;
    if (dw === 0 && dh === 0) break;
    win.resizeTo(
      Math.min(win.outerWidth + dw, maxW),
      Math.min(win.outerHeight + dh, maxH)
    );
    await new Promise((r) => setTimeout(r, 60));
    if (win.closed) return { ok: false, error: 'The window was closed before it finished sizing.' };
  }

  const actual = { width: win.innerWidth, height: win.innerHeight };
  win.location.href = target;
  win.focus();

  return { ok: true, actual };
}
