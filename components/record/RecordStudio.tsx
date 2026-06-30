'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Camera, CameraOff, Mic, MicOff, Monitor, Volume2, VolumeX, Circle,
  Square, SquareDashed, RectangleHorizontal, Sparkles, Layout, Loader2, Trash2, Copy, ExternalLink,
  Captions, AudioLines,
} from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import {
  Compositor, buildRecordingAudio, startRecording, type ActiveRecording, type CompositorState,
} from '@/lib/record/compositor';
import { publishRecording } from '@/lib/record/upload';
import { useSpeechCaptions } from '@/lib/record/useSpeechCaptions';
import {
  ASPECT_DIMS, BUBBLE_ASPECT, DEFAULT_BUBBLE, DEFAULT_CONFIG,
  type AspectRatio, type BubblePlacement, type BubbleShape,
  type CamEffect, type LayoutTemplate, type StudioConfig,
  type SubtitleBackground, type SubtitlePosition, type SubtitleSize,
} from '@/lib/record/types';

type Phase = 'setup' | 'recording' | 'review' | 'publishing';

interface RecordingRow {
  id: string;
  title: string;
  durationMs: number;
  aspectRatio: string | null;
  createdAt: number | null;
}

export default function RecordStudio({ cloudinaryReady }: { cloudinaryReady: boolean }) {
  const router = useRouter();

  const [config, setConfig] = useState<StudioConfig>(DEFAULT_CONFIG);
  const [bubble, setBubble] = useState<BubblePlacement>(DEFAULT_BUBBLE);
  const [phase, setPhase] = useState<Phase>('setup');

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>('');
  const [micId, setMicId] = useState<string>('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [includeBrowserAudio, setIncludeBrowserAudio] = useState(false);

  const [hasWebcam, setHasWebcam] = useState(false);
  const [hasScreen, setHasScreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [reviewBlob, setReviewBlob] = useState<Blob | null>(null);
  const [title, setTitle] = useState('');
  const [uploadPct, setUploadPct] = useState(0);

  const [recordings, setRecordings] = useState<RecordingRow[]>([]);

  // Refs that the rAF compositor reads each frame.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const compositorRef = useRef<Compositor | null>(null);

  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recordingRef = useRef<ActiveRecording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live captions: written to a ref (high frequency) so they don't re-render.
  const captionRef = useRef('');

  // Live state object the compositor reads (kept in a ref so the loop sees latest).
  const stateRef = useRef<CompositorState>({
    config, bubble, screenVideo: null, webcamVideo: null, caption: '',
  });
  useEffect(() => {
    stateRef.current = {
      config, bubble,
      screenVideo: screenVideoRef.current,
      webcamVideo: webcamVideoRef.current,
      caption: captionRef.current,
    };
  }, [config, bubble]);

  const setCaption = useCallback((t: string) => {
    captionRef.current = t;
    stateRef.current.caption = t;
  }, []);
  const { supported: captionsSupported } = useSpeechCaptions(config.subtitles.enabled, setCaption);

  // ----- Compositor lifecycle -----
  useEffect(() => {
    if (!canvasRef.current) return;
    const comp = new Compositor(canvasRef.current, () => stateRef.current);
    compositorRef.current = comp;
    comp.start();
    return () => {
      comp.dispose();
      compositorRef.current = null;
    };
  }, []);

  // ----- Cleanup on unmount -----
  useEffect(() => {
    return () => {
      webcamStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
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
    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      // Browser-level cleanup helps tame harsh/noisy headset mics.
      const enhanceConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId }, ...enhanceConstraints } : enhanceConstraints,
        video: false,
      });
      micStreamRef.current = stream;
      const id = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (id) setMicId(id);
      await refreshDevices();
    } catch {
      setError('Could not access the microphone.');
    }
  }, [refreshDevices]);

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
      // If the user stops sharing via the browser UI, reflect it.
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        setHasScreen(false);
        screenStreamRef.current = null;
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
      if (!micStreamRef.current) await acquireMic(micId || undefined);
    }
  }, [hasWebcam, cameraId, micId, acquireWebcam, acquireMic]);

  // ----- Recording -----
  const beginRecording = useCallback(async () => {
    if (!canvasRef.current) return;
    if (!hasScreen) { setError('Share your screen before recording.'); return; }

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const audio = buildRecordingAudio(audioCtx, {
      mic: micEnabled ? micStreamRef.current : null,
      browser: includeBrowserAudio ? screenStreamRef.current : null,
      enhance: config.enhanceAudio,
    });

    recordingRef.current = startRecording(canvasRef.current, audio, 30);
    setElapsed(0);
    setPhase('recording');
    const startedAt = Date.now();
    timerRef.current = setInterval(() => setElapsed(Date.now() - startedAt), 200);
  }, [hasScreen, micEnabled, includeBrowserAudio, config.enhanceAudio]);

  const finishRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
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
      const dims = ASPECT_DIMS[config.aspect];
      const result = await publishRecording(
        reviewBlob,
        {
          title: title.trim() || 'Untitled recording',
          durationMs: elapsed,
          width: dims.width,
          height: dims.height,
          aspectRatio: config.aspect,
        },
        (f) => setUploadPct(Math.round(f * 100))
      );
      router.push(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
      setPhase('review');
    }
  }, [reviewBlob, title, elapsed, config.aspect, router]);

  // ----- Bubble drag -----
  const dragRef = useRef<{ dragging: boolean }>({ dragging: false });
  const onCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (config.template !== 'overlay' || !config.showWebcam) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    // Bubble height is a fraction of canvas height; width follows the shape aspect.
    // Box hit-test (with a little padding) so wider shapes can be grabbed at the edges.
    const halfHy = bubble.size / 2;
    const halfWx = (bubble.size * BUBBLE_ASPECT[config.shape] * (rect.height / rect.width)) / 2;
    if (Math.abs(nx - bubble.x) <= halfWx + 0.04 && Math.abs(ny - bubble.y) <= halfHy + 0.04) {
      dragRef.current.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }, [config.template, config.showWebcam, config.shape, bubble]);

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
  const stageStyle = useMemo(() => {
    const d = ASPECT_DIMS[config.aspect];
    return {
      aspectRatio: `${d.width} / ${d.height}`,
      width: `min(100%, 56rem, calc((100dvh - 12rem) * ${d.width} / ${d.height}))`,
    } as React.CSSProperties;
  }, [config.aspect]);

  const canRecord = hasScreen && phase === 'setup';

  return (
    <main className="min-h-screen bg-[#0b0b0c] text-neutral-200">
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
        <div className="flex items-center gap-2">
          <KanthinkIcon size={22} className="text-emerald-400" />
          <span className="font-semibold">Kan Record</span>
        </div>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">Back to board</Link>
      </header>

      {!cloudinaryReady && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-5 py-2 text-sm text-amber-300">
          Cloudinary isn’t configured, so publishing is disabled. You can still record and preview.
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-5 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-0">
        {/* ===== Stage ===== */}
        <section className="p-5">
          <div className="relative mx-auto" style={stageStyle}>
            <canvas
              ref={canvasRef}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              className="absolute inset-0 h-full w-full rounded-xl border border-neutral-800 bg-black touch-none"
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
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                {formatTime(elapsed)}
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
              <button
                onClick={finishRecording}
                className="flex items-center gap-2 rounded-full bg-neutral-200 px-6 py-3 font-semibold text-black hover:bg-white"
              >
                <Square className="h-4 w-4 fill-current" /> Stop
              </button>
            )}
          </div>
        </section>

        {/* ===== Controls ===== */}
        <aside className="border-l border-neutral-800 p-5 space-y-6">
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
              {/* Sources */}
              <Group label="Sources">
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
              </Group>

              {/* Devices */}
              <Group label="Devices">
                <Select
                  label="Camera"
                  value={cameraId}
                  options={cameras.map((c) => ({ value: c.deviceId, label: c.label || 'Camera' }))}
                  onChange={(v) => { setCameraId(v); acquireWebcam(v); }}
                  disabled={!hasWebcam}
                />
                <Select
                  label="Microphone"
                  value={micId}
                  options={mics.map((m) => ({ value: m.deviceId, label: m.label || 'Microphone' }))}
                  onChange={(v) => { setMicId(v); acquireMic(v); }}
                />
              </Group>

              {/* Audio */}
              <Group label="Audio">
                <ToggleRow
                  icon={micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  label="Record microphone"
                  active={micEnabled}
                  onClick={() => setMicEnabled((v) => !v)}
                />
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
                  Takes a little edge off bright/harsh mics. Test with a short clip.
                </p>
              </Group>

              {/* Webcam style */}
              <Group label="Webcam style">
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

              {/* AI effects */}
              <Group label={<span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> AI effect</span>}>
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
              <Group label={<span className="flex items-center gap-1"><Captions className="h-3.5 w-3.5" /> Subtitles</span>}>
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

              {/* Layout */}
              <Group label={<span className="flex items-center gap-1"><Layout className="h-3.5 w-3.5" /> Layout</span>}>
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

              {/* Aspect ratio */}
              <Group label="Aspect ratio">
                <SegRow
                  options={[
                    { value: '16:9', label: '16:9' },
                    { value: '9:16', label: '9:16' },
                    { value: '1:1', label: '1:1' },
                    { value: '4:3', label: '4:3' },
                  ]}
                  value={config.aspect}
                  onChange={(v) => setConfig((c) => ({ ...c, aspect: v as AspectRatio }))}
                />
              </Group>
            </>
          )}
        </aside>
      </div>

      {/* ===== My recordings ===== */}
      {recordings.length > 0 && phase === 'setup' && (
        <section className="border-t border-neutral-800 p-5">
          <h2 className="mb-3 text-sm font-semibold text-neutral-400">Your recordings</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recordings.map((r) => (
              <RecordingCard key={r.id} rec={r} onDeleted={loadRecordings} />
            ))}
          </ul>
        </section>
      )}

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

function RecordingCard({ rec, onDeleted }: { rec: RecordingRow; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const watchUrl = typeof window !== 'undefined' ? `${window.location.origin}/watch/${rec.id}` : `/watch/${rec.id}`;

  const del = async () => {
    if (!confirm('Delete this recording?')) return;
    setBusy(true);
    await fetch(`/api/record/${rec.id}`, { method: 'DELETE' });
    onDeleted();
  };

  return (
    <li className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="truncate text-sm font-medium">{rec.title}</div>
      <div className="mt-1 text-xs text-neutral-500">
        {formatTime(rec.durationMs)} · {rec.aspectRatio || '16:9'}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <Link href={`/watch/${rec.id}`} className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300">
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </Link>
        <button
          onClick={() => navigator.clipboard.writeText(watchUrl)}
          className="flex items-center gap-1 text-neutral-400 hover:text-neutral-200"
        >
          <Copy className="h-3.5 w-3.5" /> Copy link
        </button>
        <button
          onClick={del}
          disabled={busy}
          className="ml-auto flex items-center gap-1 text-neutral-500 hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

function Group({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      {children}
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
