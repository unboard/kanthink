// Pulls the shared screen's frames straight off the capture track.
//
// The compositor used to read the screen by calling drawImage() on the preview
// <video> element. That element is a *presentation* surface: what it holds is a
// function of how Chrome is rendering the page, and a hidden or occluded page is
// exactly the state the /record flow puts the studio in — you share a window,
// then you go work in that window. Reading pixels out of a DOM element whose
// updates the browser is free to suspend is the wrong source for an encoder.
//
// MediaStreamTrackProcessor gives the frames the track itself produces, which
// keep flowing while the page is hidden because the capture pipeline has nothing
// to do with page rendering. Fixing the frame *clock* (see frameClock.ts) makes
// the canvas get painted while hidden; this makes sure what gets painted is the
// current screen and not a stale one.
//
// Chrome-only API, and Chrome is where screen sharing happens. Anywhere it's
// missing, current() returns null and the compositor falls back to the <video>.

interface TrackProcessorCtor {
  new (init: { track: MediaStreamTrack }): { readable: ReadableStream<VideoFrame> };
}

function trackProcessor(): TrackProcessorCtor | null {
  const c = (globalThis as unknown as { MediaStreamTrackProcessor?: TrackProcessorCtor })
    .MediaStreamTrackProcessor;
  return typeof c === 'function' ? c : null;
}

export function screenFramesSupported(): boolean {
  return trackProcessor() !== null;
}

/**
 * Keeps the most recent VideoFrame from a screen-capture track available to the
 * compositor. Exactly one frame is held open at a time — the previous is closed
 * as soon as its replacement arrives, so the capture pipeline's frame pool is
 * never starved.
 */
export class ScreenFrameSource {
  private frame: VideoFrame | null = null;
  private closed = false;
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null;

  constructor(track: MediaStreamTrack) {
    const Ctor = trackProcessor();
    if (!Ctor) return;
    try {
      this.reader = new Ctor({ track }).readable.getReader();
      void this.pump();
    } catch {
      this.reader = null;
    }
  }

  private async pump() {
    const reader = this.reader;
    if (!reader) return;
    try {
      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        if (this.closed) {
          value.close();
          break;
        }
        this.frame?.close();
        this.frame = value;
      }
    } catch {
      // Track ended or the stream errored: fall back to the <video> element.
    } finally {
      this.frame?.close();
      this.frame = null;
    }
  }

  /**
   * The latest frame, or null if this source isn't running. Safe to hand to
   * drawImage(): the pump only swaps frames between tasks, and drawing is
   * synchronous, so a frame can never be closed mid-draw.
   */
  current(): VideoFrame | null {
    return this.closed ? null : this.frame;
  }

  dispose() {
    this.closed = true;
    this.reader?.cancel().catch(() => {});
    this.reader = null;
    this.frame?.close();
    this.frame = null;
  }
}
