'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Camera, CameraOff, Mic, MicOff, Monitor, Volume2, VolumeX, Circle,
  Square, SquareDashed, RectangleHorizontal, Sparkles, Layout, Loader2, Film, ArrowRight,
  Captions, AudioLines, Pause, Play, Bookmark, Trash2, Crop, Minimize2, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import {
  Compositor, buildRecordingAudio, focusForAnchoredZoom, startRecording, surfacePlacement,
  type ActiveRecording, type CompositorState,
} from '@/lib/record/compositor';
import { ScreenFrameSource } from '@/lib/record/screenSource';
import { publishRecording } from '@/lib/record/upload';
import { useSpeechCaptions } from '@/lib/record/useSpeechCaptions';
import {
  ASPECT_DIMS, BUBBLE_ASPECT, DEFAULT_BUBBLE, DEFAULT_CONFIG, aspectLabel, autoDims,
  type AspectDims, type AspectRatio, type BubblePlacement, type BubbleShape,
  type CamEffect, type LayoutTemplate, type StudioConfig,
  type SubtitleBackground, type SubtitlePosition, type SubtitleSize,
} from '@/lib/record/types';
import {
  deletePreset, loadLastUsed, loadOpenGroups, loadPreferredMic, loadPresets, savePreset,
  saveLastUsed, saveOpenGroups, savePreferredMic, type StudioPreset,
} from '@/lib/record/presets';

type Phase = 'setup' | 'recording' | 'review' | 'publishing';

// Which control sections start expanded. Open by default are the ones touched
// per-recording; the configure-once sections start collapsed so the controls you
// reach for mid-take aren't pushed below the fold. User toggles are remembered.
const GROUP_DEFAULT_OPEN: Record<string, boolean> = {
  presets: true,
  sources: true,
  shape: true,
  framing: true,
  layout: false,
  webcam: false,
  devices: false,
  audio: false,
  effect: false,
  subtitles: false,
};

// Zoom range. The floor is 1 by definition, not by taste: at 1 the frame already
// shows everything the shape allows, so anything below it would pull the surface
// away from the edges and record background.
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

interface RecordingRow {
  id: string;
  title: string;
  durationMs: number;
  aspectRatio: string | null;
  createdAt: number | null;
}

// Frames per second the canvas is drawn and captured at. One constant so the
// compositor's clock, the recorder and the stall guard can never disagree.
const CAPTURE_FPS = 30;

export default function RecordStudio({ cloudinaryReady }: { cloudinaryReady: boolean }) {
  const router = useRouter();

  const [config, setConfig] = useState<StudioConfig>(DEFAULT_CONFIG);
  const [bubble, setBubble] = useState<BubblePlacement>(DEFAULT_BUBBLE);
  const [phase, setPhase] = useState<Phase>('setup');

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>('');
  const [micId, setMicId] = useState<string>('');
  const [micHz, setMicHz] = useState<number | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  // Mirrors micStreamRef so the level meter can react to the mic changing. The
  // ref stays the source of truth for the recording path, which reads it outside
  // of render.
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  // True once a mic request has actually failed, so the panel can offer a retry
  // instead of implying a mic is live. Distinct from "not asked yet".
  const [micDenied, setMicDenied] = useState(false);
  const [includeBrowserAudio, setIncludeBrowserAudio] = useState(false);

  const [hasWebcam, setHasWebcam] = useState(false);
  const [hasScreen, setHasScreen] = useState(false);
  // Live pixel size of the shared surface. Updates as you resize the window
  // you're sharing, which is what makes 'auto' aspect track it.
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [reviewBlob, setReviewBlob] = useState<Blob | null>(null);
  const [title, setTitle] = useState('');
  const [uploadPct, setUploadPct] = useState(0);

  const [recordings, setRecordings] = useState<RecordingRow[]>([]);

  const [presets, setPresets] = useState<StudioPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // Null until the stored settings have been read, so the auto-save effect below
  // can't fire with defaults and overwrite them before restore happens.
  const [settingsRestored, setSettingsRestored] = useState(false);

  // Refs the compositor reads each frame.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const compositorRef = useRef<Compositor | null>(null);
  // Live frames off the screen-capture track. Preferred over screenVideoRef,
  // which the browser may stop updating while the studio tab is hidden.
  const screenFrameRef = useRef<ScreenFrameSource | null>(null);
  // True when the canvas is being drawn far below the capture rate, i.e. the
  // take in progress is recording a frozen picture.
  const [captureStalled, setCaptureStalled] = useState(false);

  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recordingRef = useRef<ActiveRecording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Elapsed accounting across pause/resume: total ms of completed segments plus
  // the wall-clock start of the currently running segment.
  const elapsedBaseRef = useRef(0);
  const segmentStartRef = useRef(0);
  const pausedRef = useRef(false);

  // Live captions: written to a ref (high frequency) so they don't re-render.
  const captionRef = useRef('');

  // Canvas size for the current settings. 'auto' means "match the shape of what
  // you shared", which is the default — see AspectRatio.
  //
  // Frozen while recording: the MediaRecorder is fed canvas.captureStream(), and
  // changing canvas dimensions mid-stream resizes the encoder's input, which
  // corrupts the track. If the shared window is resized mid-take the recording
  // keeps the shape it started with.
  // State, not a ref: the preview stage is laid out from this, so it has to
  // participate in rendering.
  const [recordingDims, setRecordingDims] = useState<AspectDims | null>(null);
  const liveDims = useMemo<AspectDims>(() => {
    if (config.aspect !== 'auto') return ASPECT_DIMS[config.aspect];
    return sourceSize ? autoDims(sourceSize.width, sourceSize.height) : ASPECT_DIMS['16:9'];
  }, [config.aspect, sourceSize]);
  const dims = phase === 'recording' ? recordingDims ?? liveDims : liveDims;

  // Live state object the compositor reads (kept in a ref so the loop sees latest).
  const stateRef = useRef<CompositorState>({
    config, dims: liveDims, bubble,
    screenFrames: null, screenVideo: null, webcamVideo: null, caption: '',
  });
  useEffect(() => {
    stateRef.current = {
      config, dims, bubble,
      screenFrames: screenFrameRef.current,
      screenVideo: screenVideoRef.current,
      webcamVideo: webcamVideoRef.current,
      caption: captionRef.current,
    };
  }, [config, dims, bubble]);

  const setCaption = useCallback((t: string) => {
    captionRef.current = t;
    stateRef.current.caption = t;
  }, []);
  const { supported: captionsSupported } = useSpeechCaptions(config.subtitles.enabled, setCaption);

  // ----- Saved settings -----
  // Restore last-used settings on mount.
  //
  // This is the documented exception to set-state-in-effect: the values live in
  // localStorage, which does not exist during SSR. Reading them in a lazy state
  // initialiser would make the client's first render disagree with the server's
  // HTML and trip a hydration mismatch, so the read has to happen after mount.
  // It runs once, so the extra render is a single pass at startup.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPresets(loadPresets());
    setOpenGroups(loadOpenGroups());
    const last = loadLastUsed();
    if (last) {
      setConfig(last.config);
      setBubble(last.bubble);
    }
    setSettingsRestored(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist whatever is currently set, so the next visit opens where this one
  // left off without anyone having to name a preset.
  useEffect(() => {
    if (!settingsRestored) return;
    saveLastUsed({ config, bubble });
  }, [config, bubble, settingsRestored]);

  /** Props wiring one collapsible control section to its remembered state. */
  const group = useCallback((id: string) => ({
    open: openGroups[id] ?? GROUP_DEFAULT_OPEN[id] ?? true,
    onToggle: () => setOpenGroups((g) => {
      const current = g[id] ?? GROUP_DEFAULT_OPEN[id] ?? true;
      const next = { ...g, [id]: !current };
      saveOpenGroups(next);
      return next;
    }),
  }), [openGroups]);

  const applyPreset = useCallback((p: StudioPreset) => {
    setConfig(p.config);
    setBubble(p.bubble);
  }, []);

  const storePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) return;
    setPresets(savePreset(name, { config, bubble }));
    setPresetName('');
  }, [presetName, config, bubble]);

  const removePreset = useCallback((id: string) => {
    setPresets(deletePreset(id));
  }, []);

  // ----- Compositor lifecycle -----
  useEffect(() => {
    if (!canvasRef.current) return;
    const comp = new Compositor(canvasRef.current, () => stateRef.current);
    compositorRef.current = comp;
    comp.start(CAPTURE_FPS);
    return () => {
      comp.dispose();
      compositorRef.current = null;
    };
  }, []);

  // ----- Capture health -----
  // A frozen take is invisible while you are making it: the tab looks normal and
  // the timer counts up, so you only discover the problem when you sit down to
  // watch a minute of a still image. Sample the compositor's frame counter and
  // say so immediately instead.
  useEffect(() => {
    if (phase !== 'recording') return;
    const comp = compositorRef.current;
    if (!comp) return;
    let lastFrames = comp.framesDrawn;
    let lastAt = Date.now();
    const id = setInterval(() => {
      const frames = comp.framesDrawn;
      const now = Date.now();
      // A pause stops the encoder but not the draw loop; skip those windows
      // rather than reporting a stall the recording won't actually contain.
      if (!pausedRef.current) {
        const fps = (frames - lastFrames) / Math.max(0.001, (now - lastAt) / 1000);
        setCaptureStalled(fps < CAPTURE_FPS * 0.5);
      }
      lastFrames = frames;
      lastAt = now;
    }, 2000);
    return () => clearInterval(id);
  }, [phase]);

  // ----- Cleanup on unmount -----
  useEffect(() => {
    return () => {
      webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenFrameRef.current?.dispose();
      screenFrameRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ----- Load recordings list -----
  const loadRecordings = useCallback(async () => {
    try {
      const res = await fetch('/api/record/list');
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings || []);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    // Async fetch on mount — state is set after the await, so no cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecordings();
  }, [loadRecordings]);

  // ----- Device handling -----
  const refreshDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setCameras(devices.filter((d) => d.kind === 'videoinput'));
    setMics(devices.filter((d) => d.kind === 'audioinput'));
  }, []);

  const acquireWebcam = useCallback(async (deviceId?: string) => {
    setError(null);
    try {
      webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
      webcamStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
        await webcamVideoRef.current.play().catch(() => {});
      }
      const track = stream.getVideoTracks()[0];
      const id = track?.getSettings().deviceId;
      if (id) setCameraId(id);
      setHasWebcam(true);
      await refreshDevices();
    } catch {
      setError('Could not access the camera. Check browser permissions.');
      setHasWebcam(false);
    }
  }, [refreshDevices]);

  const acquireMic = useCallback(async (deviceId?: string) => {
    // Browser-level cleanup helps tame harsh/noisy headset mics. Ask for
    // 48 kHz so capture matches the Opus encoder rate (no resample step).
    const enhanceConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 48000 },
    };
    const open = (id?: string) => navigator.mediaDevices.getUserMedia({
      audio: id ? { deviceId: { exact: id }, ...enhanceConstraints } : enhanceConstraints,
      video: false,
    });

    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await open(deviceId).catch((err: unknown) => {
        // The remembered mic is gone — headset unplugged, Bluetooth disconnected.
        // Fall back to the system default rather than leaving the studio with no
        // audio, which is the failure the user can't see until playback.
        if (!deviceId || (err as DOMException)?.name === 'NotAllowedError') throw err;
        return open();
      });
      micStreamRef.current = stream;
      setMicStream(stream);
      setMicDenied(false);
      const settings = stream.getAudioTracks()[0]?.getSettings();
      if (settings?.deviceId) {
        setMicId(settings.deviceId);
        savePreferredMic(settings.deviceId);
      }
      // Bluetooth hands-free mics report 8/16/32 kHz — surface that the
      // quality ceiling comes from the mic link, not the recording.
      setMicHz(settings?.sampleRate ?? null);
      // Labels are blank until a mic has been granted, so this second pass is
      // what turns "Microphone" into the real device names in the picker.
      await refreshDevices();
      return stream;
    } catch {
      micStreamRef.current = null;
      setMicStream(null);
      setMicDenied(true);
      setError('Could not access the microphone. Check browser permissions.');
      return null;
    }
  }, [refreshDevices]);

  // Open the mic as soon as the studio loads, but only when permission was
  // already granted — that fills in the device names and starts the level meter
  // without ambushing a first-time visitor with a permission prompt.
  //
  // This also closes a hole where a screen-only recording captured no voice at
  // all: the mic used to be acquired solely as a side effect of turning the
  // webcam on, so "Record microphone" could read as on with nothing behind it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshDevices();
      if (cancelled) return;
      const granted = await navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => status.state === 'granted')
        // Safari and Firefox reject the 'microphone' descriptor. Leave it to the
        // explicit button rather than prompting on load.
        .catch(() => false);
      if (granted && !cancelled) await acquireMic(loadPreferredMic() ?? undefined);
    })();
    return () => { cancelled = true; };
  }, [refreshDevices, acquireMic]);

  // Plugging in a headset mid-setup should put it in the picker.
  useEffect(() => {
    const onChange = () => { void refreshDevices(); };
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [refreshDevices]);

  const toggleMic = useCallback(async () => {
    if (micEnabled) {
      // Release the device so the OS "in use" indicator goes out and the meter
      // stops — an off toggle that leaves the mic open reads as still listening.
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setMicStream(null);
      setMicEnabled(false);
    } else {
      setMicEnabled(true);
      await acquireMic(micId || loadPreferredMic() || undefined);
    }
  }, [micEnabled, micId, acquireMic]);

  const shareScreen = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      screenStreamRef.current = stream;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        await screenVideoRef.current.play().catch(() => {});
      }
      stateRef.current.screenVideo = screenVideoRef.current;
      setHasScreen(true);

      const track = stream.getVideoTracks()[0];

      // Read frames from the track itself. The <video> above stays for preview
      // and as a fallback, but it is not what the recording is composed from.
      screenFrameRef.current?.dispose();
      screenFrameRef.current = new ScreenFrameSource(track);
      stateRef.current.screenFrames = screenFrameRef.current;
      const readSize = () => {
        const s = track.getSettings();
        if (s.width && s.height) setSourceSize({ width: s.width, height: s.height });
      };
      readSize();
      // Chrome delivers a new frame size when the shared window is resized. The
      // video element's resize event is the reliable signal for it — track
      // settings alone don't notify.
      screenVideoRef.current?.addEventListener('resize', () => {
        const v = screenVideoRef.current;
        if (v && v.videoWidth > 0 && v.videoHeight > 0) {
          setSourceSize({ width: v.videoWidth, height: v.videoHeight });
        }
      });

      // If the user stops sharing via the browser UI, reflect it.
      track.addEventListener('ended', () => {
        setHasScreen(false);
        setSourceSize(null);
        screenStreamRef.current = null;
        screenFrameRef.current?.dispose();
        screenFrameRef.current = null;
        stateRef.current.screenFrames = null;
      });
    } catch {
      setError('Screen share was cancelled.');
    }
  }, []);

  const toggleWebcam = useCallback(async () => {
    if (hasWebcam) {
      webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
      if (webcamVideoRef.current) webcamVideoRef.current.srcObject = null;
      setHasWebcam(false);
      setConfig((c) => ({ ...c, showWebcam: false }));
    } else {
      setConfig((c) => ({ ...c, showWebcam: true }));
      await acquireWebcam(cameraId || undefined);
      if (micEnabled && !micStreamRef.current) await acquireMic(micId || undefined);
    }
  }, [hasWebcam, cameraId, micId, micEnabled, acquireWebcam, acquireMic]);

  // ----- Recording -----
  const beginRecording = useCallback(async () => {
    if (!canvasRef.current) return;
    if (!hasScreen) { setError('Share your screen before recording.'); return; }

    // Last line of defence against a silent take: the toggle says the mic is
    // being recorded, so open it now if nothing is holding it open yet.
    if (micEnabled && !micStreamRef.current) {
      await acquireMic(micId || loadPreferredMic() || undefined);
    }

    // 48 kHz matches the Opus encoder's native rate — avoids a 44.1→48 resample.
    const audioCtx = new AudioContext({ sampleRate: 48000 });
    audioCtxRef.current = audioCtx;
    const audio = await buildRecordingAudio(audioCtx, {
      mic: micEnabled ? micStreamRef.current : null,
      browser: includeBrowserAudio ? screenStreamRef.current : null,
      enhance: config.enhanceAudio,
    });

    // Lock the canvas size for the whole take — see recordingDims.
    setRecordingDims(liveDims);
    stateRef.current.dims = liveDims;

    recordingRef.current = startRecording(canvasRef.current, audio, CAPTURE_FPS);
    setCaptureStalled(false);
    setElapsed(0);
    setIsPaused(false);
    pausedRef.current = false;
    setPhase('recording');
    elapsedBaseRef.current = 0;
    segmentStartRef.current = Date.now();
    timerRef.current = setInterval(
      () => setElapsed(elapsedBaseRef.current + (Date.now() - segmentStartRef.current)),
      200
    );
  }, [hasScreen, micEnabled, micId, acquireMic, includeBrowserAudio, config.enhanceAudio, liveDims]);

  const pauseRecording = useCallback(() => {
    if (!recordingRef.current || pausedRef.current) return;
    recordingRef.current.pause();
    elapsedBaseRef.current += Date.now() - segmentStartRef.current;
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsed(elapsedBaseRef.current);
    pausedRef.current = true;
    setIsPaused(true);
  }, []);

  const resumeRecording = useCallback(() => {
    if (!recordingRef.current || !pausedRef.current) return;
    recordingRef.current.resume();
    segmentStartRef.current = Date.now();
    timerRef.current = setInterval(
      () => setElapsed(elapsedBaseRef.current + (Date.now() - segmentStartRef.current)),
      200
    );
    pausedRef.current = false;
    setIsPaused(false);
  }, []);

  const finishRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (!pausedRef.current) {
      elapsedBaseRef.current += Date.now() - segmentStartRef.current;
    }
    setElapsed(elapsedBaseRef.current);
    setIsPaused(false);
    pausedRef.current = false;
    const blob = await recordingRef.current.stop();
    recordingRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setReviewBlob(blob);
    setReviewUrl(URL.createObjectURL(blob));
    setTitle(`Demo — ${new Date().toLocaleString()}`);
    setPhase('review');
  }, []);

  const discardReview = useCallback(() => {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewUrl(null);
    setReviewBlob(null);
    setPhase('setup');
  }, [reviewUrl]);

  const publish = useCallback(async () => {
    if (!reviewBlob) return;
    setPhase('publishing');
    setUploadPct(0);
    try {
      // The dims the take was actually recorded at, not whatever is selected now.
      const recorded = recordingDims ?? liveDims;
      const result = await publishRecording(
        reviewBlob,
        {
          title: title.trim() || 'Untitled recording',
          durationMs: elapsed,
          width: recorded.width,
          height: recorded.height,
          // Always a concrete ratio — 'auto' is a studio setting, and storing it
          // would leave the gallery with no shape to lay the card out with.
          aspectRatio: aspectLabel(recorded),
        },
        (f) => setUploadPct(Math.round(f * 100))
      );
      router.push(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
      setPhase('review');
    }
  }, [reviewBlob, title, elapsed, recordingDims, liveDims, router]);

  // ----- Bubble drag -----
  const dragRef = useRef<{ dragging: boolean }>({ dragging: false });
  /**
   * Point on the source that the preview pixel under the cursor is showing.
   *
   * Inverts the same placement the compositor draws with, so clicking a button
   * you can see targets that button — including when already zoomed, where the
   * visible region is only a slice of the source.
   */
  const sourcePointAt = useCallback((nx: number, ny: number): { x: number; y: number } | null => {
    if (!sourceSize) return null;
    const frame = { x: 0, y: 0, w: dims.width, h: dims.height };
    const { dx, dy, dw, dh } = surfacePlacement(
      sourceSize.width, sourceSize.height, frame, config.screenView
    );
    return {
      x: Math.min(1, Math.max(0, (nx * dims.width - dx) / dw)),
      y: Math.min(1, Math.max(0, (ny * dims.height - dy) / dh)),
    };
  }, [sourceSize, dims, config.screenView]);

  // Wheel-zoom reads these, but attaching the listener is a one-time effect (see
  // below), so it needs the current values without re-subscribing on every tick.
  const zoomInputRef = useRef({ sourceSize, dims, view: config.screenView });
  useEffect(() => {
    zoomInputRef.current = { sourceSize, dims, view: config.screenView };
  }, [sourceSize, dims, config.screenView]);

  /**
   * Wheel over the preview zooms toward the cursor.
   *
   * Registered manually rather than as an onWheel prop because React attaches
   * wheel listeners passively, so preventDefault there is ignored — and without
   * it the wheel scrolls the column behind the canvas instead of zooming.
   */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const { sourceSize: src, dims: d, view } = zoomInputRef.current;
      if (!src) return;
      e.preventDefault();

      // deltaMode 1 is lines and 2 is pages; normalise both to pixel-ish units
      // so a notched mouse wheel and a trackpad land in the same ballpark.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      const next = clampZoom(view.zoom * Math.exp(-e.deltaY * unit * 0.0015));
      if (next === view.zoom) return;

      const rect = el.getBoundingClientRect();
      // Cursor in canvas pixel space, which is what the placement maths uses.
      const point = {
        x: ((e.clientX - rect.left) / rect.width) * d.width,
        y: ((e.clientY - rect.top) / rect.height) * d.height,
      };
      const frame = { x: 0, y: 0, w: d.width, h: d.height };
      const { dx, dy, dw, dh } = surfacePlacement(src.width, src.height, frame, view);
      const anchor = {
        x: Math.min(1, Math.max(0, (point.x - dx) / dw)),
        y: Math.min(1, Math.max(0, (point.y - dy) / dh)),
      };
      const focus = focusForAnchoredZoom(
        src.width, src.height, frame, view.fit, next, anchor, point
      );

      setConfig((c) => ({ ...c, screenView: { ...c.screenView, zoom: next, ...focus } }));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    // Grabbing the bubble wins over re-framing, so dragging your own face out of
    // the way never yanks the shot somewhere else.
    if (config.template === 'overlay' && config.showWebcam) {
      // Bubble height is a fraction of canvas height; width follows the shape aspect.
      // Box hit-test (with a little padding) so wider shapes can be grabbed at the edges.
      const halfHy = bubble.size / 2;
      const halfWx = (bubble.size * BUBBLE_ASPECT[config.shape] * (rect.height / rect.width)) / 2;
      if (Math.abs(nx - bubble.x) <= halfWx + 0.04 && Math.abs(ny - bubble.y) <= halfHy + 0.04) {
        dragRef.current.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    // Anywhere else re-aims the shot. Only meaningful once zoomed in — at 1x the
    // whole surface is already in frame and there is nothing to aim at.
    if (config.screenView.zoom > 1) {
      const p = sourcePointAt(nx, ny);
      if (p) setConfig((c) => ({ ...c, screenView: { ...c.screenView, x: p.x, y: p.y } }));
    }
  }, [config.template, config.showWebcam, config.shape, config.screenView.zoom, bubble, sourcePointAt]);

  const onCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    setBubble((b) => ({
      ...b,
      x: Math.min(0.98, Math.max(0.02, nx)),
      y: Math.min(0.98, Math.max(0.02, ny)),
    }));
  }, []);
  const onCanvasPointerUp = useCallback(() => { dragRef.current.dragging = false; }, []);

  // Size the preview so it fits within BOTH the available width and the viewport
  // height. Width is the smallest of: the column width, a max cap, and the width
  // implied by the height budget for this aspect ratio. Height follows from the
  // aspect ratio, so the box always matches what's recorded (keeps drag math sound).
  const stageStyle = useMemo(() => ({
    aspectRatio: `${dims.width} / ${dims.height}`,
    width: `min(100%, 56rem, calc((100dvh - 12rem) * ${dims.width} / ${dims.height}))`,
  } as React.CSSProperties), [dims]);

  const canRecord = hasScreen && phase === 'setup';

  // Desktop pins the whole studio to the viewport and lets the two columns scroll
  // independently, so reaching a control never scrolls the preview off screen.
  // Below lg the columns stack, where two nested scroll areas would be worse than
  // the page simply scrolling — so the constraint is lg-only throughout.
  return (
    <main className="min-h-screen bg-[#0b0b0c] text-neutral-200 lg:flex lg:h-[100dvh] lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-3 lg:shrink-0">
        <div className="flex items-center gap-2">
          <KanthinkIcon size={22} className="text-emerald-400" />
          <span className="font-semibold">Kan Record</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/record/gallery" className="flex items-center gap-1.5 text-sm text-neutral-300 hover:text-white">
            <Film className="h-4 w-4" /> Recordings
          </Link>
          <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">Back to board</Link>
        </div>
      </header>

      {!cloudinaryReady && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-5 py-2 text-sm text-amber-300">
          Cloudinary isn’t configured, so publishing is disabled. You can still record and preview.
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-5 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="grid gap-0 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_340px]">
        {/* ===== Stage ===== */}
        <section className="flex flex-col p-5 lg:min-h-0 lg:overflow-y-auto">
          <div className="relative mx-auto" style={stageStyle}>
            <canvas
              ref={canvasRef}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              className={`absolute inset-0 h-full w-full rounded-xl border border-neutral-800 bg-black touch-none ${
                config.screenView.zoom > 1 ? 'cursor-crosshair' : ''
              }`}
            />
            {!hasScreen && phase === 'setup' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                <Monitor className="h-10 w-10 text-neutral-500" />
                <p className="text-neutral-400 max-w-xs">
                  Share the browser tab or window running your product to start.
                </p>
                <button
                  onClick={shareScreen}
                  className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-black hover:bg-emerald-400"
                >
                  Share screen
                </button>
              </div>
            )}

            {phase === 'recording' && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-sm">
                {isPaused ? (
                  <>
                    <Pause className="h-3 w-3 text-amber-400" />
                    <span className="text-amber-300">Paused</span>
                  </>
                ) : (
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                )}
                {formatTime(elapsed)}
              </div>
            )}

            {phase === 'recording' && captureStalled && (
              <div className="absolute inset-x-3 top-12 flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-950/90 px-3 py-2 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span>
                  Frames aren&apos;t being captured. This take is recording a frozen
                  picture — stop, reload the studio, and start again.
                </span>
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="mt-4 flex items-center justify-center gap-3">
            {phase === 'setup' && (
              <button
                onClick={beginRecording}
                disabled={!canRecord}
                className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 font-semibold text-white enabled:hover:bg-red-400 disabled:opacity-40"
              >
                <Circle className="h-4 w-4 fill-current" /> Record
              </button>
            )}
            {phase === 'recording' && (
              <>
                {isPaused ? (
                  <button
                    onClick={resumeRecording}
                    className="flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 font-semibold text-black hover:bg-emerald-400"
                  >
                    <Play className="h-4 w-4 fill-current" /> Continue
                  </button>
                ) : (
                  <button
                    onClick={pauseRecording}
                    className="flex items-center gap-2 rounded-full border border-neutral-600 bg-neutral-900 px-6 py-3 font-semibold text-neutral-200 hover:bg-neutral-800"
                  >
                    <Pause className="h-4 w-4 fill-current" /> Pause
                  </button>
                )}
                <button
                  onClick={finishRecording}
                  className="flex items-center gap-2 rounded-full bg-neutral-200 px-6 py-3 font-semibold text-black hover:bg-white"
                >
                  <Square className="h-4 w-4 fill-current" /> Stop
                </button>
              </>
            )}
          </div>

          {/* Lives in the scrolling stage column, not below the grid — the desktop
              layout is viewport-height, so anything outside a scroll container
              would be unreachable. */}
          {recordings.length > 0 && phase === 'setup' && (
            <section className="mt-6">
              <Link
                href="/record/gallery"
                className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-4 transition hover:border-neutral-700 hover:bg-neutral-900"
              >
                <div className="flex items-center gap-3">
                  <Film className="h-5 w-5 text-emerald-400" />
                  <div>
                    <div className="text-sm font-medium text-neutral-100">Your recordings</div>
                    <div className="text-xs text-neutral-500">
                      {recordings.length} video{recordings.length === 1 ? '' : 's'} · open the gallery to play, share & set thumbnails
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-neutral-500" />
              </Link>
            </section>
          )}
        </section>

        {/* ===== Controls ===== */}
        <aside className="space-y-5 border-l border-neutral-800 p-5 lg:min-h-0 lg:overflow-y-auto">
          {phase === 'review' || phase === 'publishing' ? (
            <ReviewPanel
              url={reviewUrl}
              title={title}
              setTitle={setTitle}
              publishing={phase === 'publishing'}
              uploadPct={uploadPct}
              cloudinaryReady={cloudinaryReady}
              onPublish={publish}
              onDiscard={discardReview}
            />
          ) : (
            <>
              {/* Presets */}
              <Group label={<span className="flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" /> Presets</span>} {...group('presets')}>
                {presets.length > 0 && (
                  <div className="space-y-1">
                    {presets.map((p) => (
                      <div key={p.id} className="flex items-center gap-1">
                        <button
                          onClick={() => applyPreset(p)}
                          className="flex-1 truncate rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-left text-xs text-neutral-200 hover:border-emerald-500/60 hover:bg-neutral-800"
                        >
                          {p.name}
                        </button>
                        <button
                          onClick={() => removePreset(p.id)}
                          className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-800 hover:text-red-400"
                          aria-label={`Delete preset ${p.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1">
                  <input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') storePreset(); }}
                    placeholder="Name this setup…"
                    className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-emerald-500"
                  />
                  <button
                    onClick={storePreset}
                    disabled={!presetName.trim()}
                    className="rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 enabled:hover:bg-neutral-800 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Your current settings are already remembered between visits. Save a preset when you
                  want to keep more than one setup and switch between them.
                </p>
              </Group>

              {/* Sources */}
              <Group label="Sources" {...group('sources')}>
                <ToggleRow
                  icon={<Monitor className="h-4 w-4" />}
                  label={hasScreen ? 'Screen shared' : 'Share screen'}
                  active={hasScreen}
                  onClick={shareScreen}
                />
                <ToggleRow
                  icon={hasWebcam ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
                  label={hasWebcam ? 'Webcam on' : 'Webcam off'}
                  active={hasWebcam}
                  onClick={toggleWebcam}
                />
                <ToggleRow
                  icon={micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  label={micEnabled ? 'Microphone on' : 'Microphone off'}
                  active={micEnabled}
                  onClick={toggleMic}
                />
                {/* The mic picker lives here, next to the other sources, rather
                    than in Devices — which mic is recording is a thing you check
                    before every take, not a thing you configure once. */}
                {micEnabled && (
                  <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-2">
                    <Select
                      label="Recording from"
                      value={micId}
                      options={mics.map((m, i) => ({
                        value: m.deviceId,
                        // Labels stay blank until permission is granted; number
                        // them so the options are at least distinguishable.
                        label: m.label || `Microphone ${i + 1}`,
                      }))}
                      onChange={(v) => { setMicId(v); void acquireMic(v); }}
                    />
                    {micStream ? (
                      <>
                        <MicMeter stream={micStream} />
                        <p className="text-[11px] text-neutral-500">Speak — the bar moves if this is the right mic.</p>
                      </>
                    ) : (
                      <button
                        onClick={() => void acquireMic(micId || undefined)}
                        className="w-full rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20"
                      >
                        {micDenied ? 'Retry microphone access' : 'Turn on the mic to check it'}
                      </button>
                    )}
                  </div>
                )}
              </Group>

              {/* Aspect ratio */}
              <Group label="Shape" {...group('shape')}>
                <SegRow
                  options={[
                    { value: 'auto', label: 'Match window' },
                    { value: '16:9', label: '16:9' },
                    { value: '9:16', label: '9:16' },
                    { value: '1:1', label: '1:1' },
                  ]}
                  value={config.aspect}
                  onChange={(v) => setConfig((c) => ({ ...c, aspect: v as AspectRatio }))}
                />
                {config.aspect === 'auto' ? (
                  <p className="text-[11px] text-neutral-500">
                    {sourceSize ? (
                      <>
                        Recording at{' '}
                        <span className="tabular-nums text-neutral-300">
                          {dims.width}×{dims.height}
                        </span>{' '}
                        — the exact shape of the window you shared, so there are no bars.
                        Resize that window and this follows it.
                      </>
                    ) : (
                      <>Share a window and the recording takes its shape automatically.</>
                    )}
                  </p>
                ) : (
                  <p className="text-[11px] text-neutral-500">
                    Fixed {config.aspect}.{' '}
                    {config.screenView.fit === 'cover'
                      ? 'Your window is cropped to this shape — no bars.'
                      : 'Your whole window is fitted inside, so it gets bars.'}
                  </p>
                )}
              </Group>

              {/* Framing */}
              <Group label={<span className="flex items-center gap-1"><Crop className="h-3.5 w-3.5" /> Framing</span>} {...group('framing')}>
                <SegRow
                  options={[
                    { value: 'cover', label: 'Crop to fill' },
                    { value: 'contain', label: 'Fit whole' },
                  ]}
                  value={config.screenView.fit}
                  onChange={(v) => setConfig((c) => ({
                    ...c, screenView: { ...c.screenView, fit: v as 'cover' | 'contain' },
                  }))}
                />
                <label className="block text-xs text-neutral-400">
                  <span className="flex justify-between">
                    <span>Zoom</span>
                    <span className="text-neutral-500">{config.screenView.zoom.toFixed(1)}×</span>
                  </span>
                  <input
                    type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.1} value={config.screenView.zoom}
                    onChange={(e) => setConfig((c) => ({
                      ...c, screenView: { ...c.screenView, zoom: clampZoom(Number(e.target.value)) },
                    }))}
                    className="mt-1 w-full accent-emerald-500"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfig((c) => ({
                      ...c, screenView: { ...c.screenView, zoom: 1, x: 0.5, y: 0.5 },
                    }))}
                    disabled={config.screenView.zoom === ZOOM_MIN}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 enabled:hover:bg-neutral-800 disabled:opacity-40"
                  >
                    <Minimize2 className="h-3.5 w-3.5" /> Back out
                  </button>
                  <span className="text-[11px] text-neutral-500">
                    {config.screenView.zoom > ZOOM_MIN ? 'Click the preview to aim' : ''}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Scroll on the preview to zoom toward your cursor. Zoom in on a button while you
                  talk — the move eases in, and it&rsquo;s recorded, so it works even where browser
                  zoom doesn&rsquo;t. Safe to use mid-recording.
                </p>
              </Group>

              {/* Layout */}
              <Group label={<span className="flex items-center gap-1"><Layout className="h-3.5 w-3.5" /> Layout</span>} {...group('layout')}>
                <SegRow
                  options={[
                    { value: 'overlay', label: 'Bubble' },
                    { value: 'split-50', label: '50 / 50' },
                    { value: 'split-33', label: '33 / 67' },
                  ]}
                  value={config.template}
                  onChange={(v) => setConfig((c) => ({ ...c, template: v as LayoutTemplate }))}
                />
              </Group>

              {/* Webcam style */}
              <Group label="Webcam style" {...group('webcam')}>
                <SegRow
                  options={[
                    { value: 'circle', label: 'Circle', icon: <Circle className="h-4 w-4" /> },
                    { value: 'rounded', label: 'Round', icon: <SquareDashed className="h-4 w-4" /> },
                    { value: 'square', label: 'Square', icon: <Square className="h-4 w-4" /> },
                    { value: 'rectangle', label: 'Wide', icon: <RectangleHorizontal className="h-4 w-4" /> },
                  ]}
                  value={config.shape}
                  onChange={(v) => setConfig((c) => ({ ...c, shape: v as BubbleShape }))}
                />
                <label className="block text-xs text-neutral-400">
                  Bubble size
                  <input
                    type="range" min={0.14} max={0.5} step={0.01} value={bubble.size}
                    onChange={(e) => setBubble((b) => ({ ...b, size: Number(e.target.value) }))}
                    className="mt-1 w-full accent-emerald-500"
                  />
                </label>
                <label className="block text-xs text-neutral-400">
                  <span className="flex justify-between">
                    <span>Camera zoom</span>
                    <span className="text-neutral-500">{config.zoom.toFixed(1)}×</span>
                  </span>
                  <input
                    type="range" min={1} max={3} step={0.05} value={config.zoom}
                    onChange={(e) => setConfig((c) => ({ ...c, zoom: Number(e.target.value) }))}
                    className="mt-1 w-full accent-emerald-500"
                  />
                  <span className="mt-0.5 flex justify-between text-[10px] text-neutral-600">
                    <span>Full frame</span><span>Close up</span>
                  </span>
                </label>
              </Group>

              {/* Camera device — the mic picker sits up in Sources. */}
              <Group label="Camera device" {...group('devices')}>
                <Select
                  label="Camera"
                  value={cameraId}
                  options={cameras.map((c, i) => ({
                    value: c.deviceId,
                    label: c.label || `Camera ${i + 1}`,
                  }))}
                  onChange={(v) => { setCameraId(v); acquireWebcam(v); }}
                  disabled={!hasWebcam}
                />
              </Group>

              {/* Audio */}
              <Group label="Audio" {...group('audio')}>
                <ToggleRow
                  icon={includeBrowserAudio ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  label="Record tab / browser audio"
                  active={includeBrowserAudio}
                  onClick={() => setIncludeBrowserAudio((v) => !v)}
                />
                <ToggleRow
                  icon={<AudioLines className="h-4 w-4" />}
                  label="Soften harsh mic audio"
                  active={config.enhanceAudio}
                  onClick={() => setConfig((c) => ({ ...c, enhanceAudio: !c.enhanceAudio }))}
                />
                <p className="text-[11px] text-neutral-500">
                  De-esses sharp &ldquo;s&rdquo; sounds and takes the edge off bright mics. Test with a short clip.
                </p>
                {micHz !== null && micHz <= 32000 && (
                  <p className="text-[11px] text-amber-400">
                    This mic is running in Bluetooth hands-free mode ({Math.round(micHz / 1000)} kHz) —
                    that caps voice quality no matter the settings. A built-in or wired mic will sound noticeably clearer.
                  </p>
                )}
              </Group>

              {/* AI effects */}
              <Group label={<span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> AI effect</span>} {...group('effect')}>
                <SegRow
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'blur', label: 'Blur bg' },
                    { value: 'cutout', label: 'Cutout' },
                  ]}
                  value={config.effect}
                  onChange={(v) => setConfig((c) => ({ ...c, effect: v as CamEffect }))}
                />
                <p className="text-[11px] text-neutral-500">
                  Runs in your browser. First use loads a small model — give it a couple seconds.
                </p>
              </Group>

              {/* Subtitles */}
              <Group label={<span className="flex items-center gap-1"><Captions className="h-3.5 w-3.5" /> Subtitles</span>} {...group('subtitles')}>
                <ToggleRow
                  icon={<Captions className="h-4 w-4" />}
                  label={config.subtitles.enabled ? 'Live captions on' : 'Live captions off'}
                  active={config.subtitles.enabled}
                  onClick={() => setConfig((c) => ({ ...c, subtitles: { ...c.subtitles, enabled: !c.subtitles.enabled } }))}
                />
                {config.subtitles.enabled && (
                  <>
                    {!captionsSupported && (
                      <p className="text-[11px] text-amber-400">Live captions need Chrome or Edge.</p>
                    )}
                    <SegRow
                      options={[
                        { value: 'bottom', label: 'Bottom' },
                        { value: 'center', label: 'Center' },
                        { value: 'top', label: 'Top' },
                      ]}
                      value={config.subtitles.position}
                      onChange={(v) => setConfig((c) => ({ ...c, subtitles: { ...c.subtitles, position: v as SubtitlePosition } }))}
                    />
                    <SegRow
                      options={[
                        { value: 'sm', label: 'Small' },
                        { value: 'md', label: 'Medium' },
                        { value: 'lg', label: 'Large' },
                      ]}
                      value={config.subtitles.size}
                      onChange={(v) => setConfig((c) => ({ ...c, subtitles: { ...c.subtitles, size: v as SubtitleSize } }))}
                    />
                    <SegRow
                      options={[
                        { value: 'dark', label: 'Bar' },
                        { value: 'pill', label: 'Pill' },
                        { value: 'none', label: 'None' },
                      ]}
                      value={config.subtitles.background}
                      onChange={(v) => setConfig((c) => ({ ...c, subtitles: { ...c.subtitles, background: v as SubtitleBackground } }))}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400">Color</span>
                      {['#ffffff', '#fde047', '#34d399', '#111111'].map((col) => (
                        <button
                          key={col}
                          onClick={() => setConfig((c) => ({ ...c, subtitles: { ...c.subtitles, color: col } }))}
                          className={`h-6 w-6 rounded-full border-2 ${config.subtitles.color === col ? 'border-emerald-400' : 'border-neutral-700'}`}
                          style={{ backgroundColor: col }}
                          aria-label={`Caption color ${col}`}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      Auto-transcribes your speech and burns it into the recording.
                    </p>
                  </>
                )}
              </Group>

                          </>
          )}
        </aside>
      </div>

      {/* Source videos feeding the compositor — kept rendered but off-screen so
          browsers keep decoding frames (display:none can pause decode). */}
      <video
        ref={webcamVideoRef} muted autoPlay playsInline
        className="pointer-events-none fixed -left-[9999px] top-0 h-[2px] w-[2px] opacity-0"
      />
      <video
        ref={screenVideoRef} muted autoPlay playsInline
        className="pointer-events-none fixed -left-[9999px] top-0 h-[2px] w-[2px] opacity-0"
      />
    </main>
  );
}

// ===== Sub-components =====

function ReviewPanel(props: {
  url: string | null;
  title: string;
  setTitle: (v: string) => void;
  publishing: boolean;
  uploadPct: number;
  cloudinaryReady: boolean;
  onPublish: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-neutral-400">Review</h2>
      {props.url && (
        <video src={props.url} controls className="w-full rounded-lg border border-neutral-800" />
      )}
      <label className="block text-xs text-neutral-400">
        Title
        <input
          value={props.title}
          onChange={(e) => props.setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
        />
      </label>
      {props.publishing ? (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${props.uploadPct}%` }} />
          </div>
          <p className="flex items-center gap-2 text-xs text-neutral-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading… {props.uploadPct}%
          </p>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={props.onPublish}
            disabled={!props.cloudinaryReady}
            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-medium text-black enabled:hover:bg-emerald-400 disabled:opacity-40"
          >
            Publish &amp; get link
          </button>
          <button
            onClick={props.onDiscard}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
          >
            Discard
          </button>
        </div>
      )}
      <p className="text-[11px] text-neutral-500">
        After publishing you can trim and add loading-screen covers on the watch page.
      </p>
    </div>
  );
}

function Group({
  label, children, open = true, onToggle,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  if (!onToggle) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 transition hover:text-neutral-300"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1">{label}</span>
      </button>
      {/* Unmounted rather than hidden: these sections hold range inputs and live
          previews, and keeping a collapsed one mounted would leave it in the tab
          order and still re-rendering every frame the config changes. */}
      {open && <div className="space-y-2 pl-[1.125rem]">{children}</div>}
    </div>
  );
}

/**
 * Live input level for the selected mic.
 *
 * This is the part that actually answers "which microphone is it using" — a
 * device name in a dropdown is a claim, a bar that moves when you talk is proof.
 * Driven by writing to the DOM node inside rAF rather than through state,
 * because a 60 fps re-render of the whole studio panel is not worth a meter.
 */
function MicMeter({ stream }: { stream: MediaStream }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = new AudioContext();
    void ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    // Source → analyser only. Never to ctx.destination: monitoring a mic through
    // the speakers it's sitting next to is a feedback loop.
    ctx.createMediaStreamSource(stream).connect(analyser);

    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let level = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
      // Conversational speech sits well under full scale, so scale it up to put
      // normal talking around the middle of the bar instead of a twitch at 5%.
      const rms = Math.min(1, Math.sqrt(sum / buf.length) * 6);
      // Snap up, ease down — a peak stays visible long enough to register.
      level = rms > level ? rms : level * 0.85 + rms * 0.15;
      if (barRef.current) barRef.current.style.transform = `scaleX(${level.toFixed(3)})`;
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      void ctx.close().catch(() => {});
    };
  }, [stream]);

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800" aria-hidden>
      <div
        ref={barRef}
        className="h-full origin-left rounded-full bg-emerald-500"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );
}

function ToggleRow(props: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
        props.active
          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
          : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
      }`}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

function SegRow(props: {
  options: { value: string; label: string; icon?: React.ReactNode }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-neutral-900 p-1">
      {props.options.map((o) => (
        <button
          key={o.value}
          onClick={() => props.onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${
            props.value === o.value ? 'bg-emerald-500 text-black' : 'text-neutral-300 hover:bg-neutral-800'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Select(props: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-xs text-neutral-400">
      {props.label}
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.disabled || props.options.length === 0}
        className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500 disabled:opacity-50"
      >
        {props.options.length === 0 && <option>—</option>}
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
