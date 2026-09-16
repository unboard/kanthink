/**
 * The two live-voice providers, and the translation between them.
 *
 * Live voice mode is one conversation with one set of tools, but the two backends
 * disagree about almost every detail of how to have it: Gemini sends a `setup`
 * frame and OpenAI a `session.update`; Gemini wants 16 kHz microphone audio and
 * OpenAI 24 kHz; Gemini's tool calls arrive under `toolCall.functionCalls` and
 * OpenAI's as `response.function_call_arguments.done`; Gemini declares tool
 * parameters in its own uppercase pseudo-schema and OpenAI in plain JSON Schema.
 *
 * Rather than fork LiveVoiceMode — 1700 lines of UI that has nothing to do with any
 * of that — this module normalises the wire. The component builds one outbound
 * message through `buildSetupMessage` and reads one inbound shape from
 * `normalizeLiveEvent`, and the differences stay here where they can be read side
 * by side.
 *
 * The normalised shape is Gemini's, because that is what already worked and
 * reshaping the working side to meet the new one is how a working feature acquires
 * a regression.
 */

export type LiveProvider = 'google' | 'openai'

export interface LiveVoiceOption {
  id: string
  label: string
}

export interface LiveProviderDefinition {
  id: LiveProvider
  /** Shown on the toggle in the voice-mode gear. */
  label: string
  /** One line under the toggle, for someone deciding. */
  blurb: string
  /** Microphone sample rate this backend expects, in Hz. */
  micSampleRate: number
  /** Sample rate of the audio it sends back, in Hz. */
  playbackSampleRate: number
  voices: LiveVoiceOption[]
  defaultVoice: string
}

export const LIVE_PROVIDERS: Record<LiveProvider, LiveProviderDefinition> = {
  google: {
    id: 'google',
    label: 'Gemini Live',
    blurb: 'Gemini 3.1 Flash Live. What voice mode has always run on.',
    micSampleRate: 16000,
    playbackSampleRate: 24000,
    voices: [
      { id: 'Kore', label: 'Kore' },
      { id: 'Puck', label: 'Puck' },
      { id: 'Charon', label: 'Charon' },
      { id: 'Fenrir', label: 'Fenrir' },
      { id: 'Aoede', label: 'Aoede' },
      { id: 'Leda', label: 'Leda' },
      { id: 'Orus', label: 'Orus' },
      { id: 'Zephyr', label: 'Zephyr' },
    ],
    defaultVoice: 'Kore',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI Live',
    blurb: 'gpt-live-1. Warmer delivery, smoother interruptions. No web search, and needs an OpenAI key.',
    // OpenAI's realtime PCM format is 24 kHz in both directions, which also means
    // the microphone path does less resampling than the Gemini one.
    micSampleRate: 24000,
    playbackSampleRate: 24000,
    voices: [
      { id: 'marin', label: 'Marin' },
      { id: 'cedar', label: 'Cedar' },
      { id: 'alloy', label: 'Alloy' },
      { id: 'ash', label: 'Ash' },
      { id: 'ballad', label: 'Ballad' },
      { id: 'coral', label: 'Coral' },
      { id: 'sage', label: 'Sage' },
      { id: 'verse', label: 'Verse' },
    ],
    // OpenAI's own docs name marin and cedar as the best of the set.
    defaultVoice: 'marin',
  },
}

export function isLiveProvider(value: unknown): value is LiveProvider {
  return value === 'google' || value === 'openai'
}

/** The voice to use, falling back when a Gemini voice is carried to OpenAI. */
export function resolveVoice(provider: LiveProvider, voice: string | null | undefined): string {
  const definition = LIVE_PROVIDERS[provider]
  return definition.voices.some((v) => v.id === voice) ? voice! : definition.defaultVoice
}

// ── Tools ─────────────────────────────────────────────────────────────────

/**
 * Gemini's declaration form, which is what LiveVoiceMode already holds.
 *
 * `functionDeclarations` is optional because the list also carries Gemini's
 * built-in `{ googleSearch: {} }` block. That one has no OpenAI counterpart —
 * grounded web search is a property of the Gemini live model rather than a tool we
 * declare — so `toOpenAITools` skips it, and the OpenAI provider's blurb says
 * plainly that web search is not available there.
 */
export interface GeminiToolBlock {
  functionDeclarations?: Array<{
    name: string
    description: string
    parameters: {
      type: string
      /**
       * `| undefined` in the value because TypeScript widens the literal TOOLS
       * array into a union where every declaration carries every other
       * declaration's keys as optional-undefined. Tightening this would mean
       * annotating the 1700-line component's tool list, which is the thing this
       * module exists to avoid touching.
       */
      properties: Record<string, { type: string; description?: string } | undefined>
      required?: string[]
    }
  }>
}

export interface OpenAIFunctionTool {
  type: 'function'
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
    required: string[]
    additionalProperties: false
  }
}

/**
 * Gemini's uppercase pseudo-schema, in plain JSON Schema.
 *
 * Converted rather than maintained twice. Two hand-written copies of thirty tool
 * declarations would drift the first time somebody added an argument, and the
 * failure mode of that drift is a tool that exists on one provider and silently
 * does not on the other.
 */
export function toOpenAITools(blocks: GeminiToolBlock[]): OpenAIFunctionTool[] {
  const out: OpenAIFunctionTool[] = []
  for (const block of blocks) {
    for (const declaration of block.functionDeclarations ?? []) {
      const properties: OpenAIFunctionTool['parameters']['properties'] = {}
      for (const [key, value] of Object.entries(declaration.parameters?.properties ?? {})) {
        if (!value) continue
        properties[key] = { type: value.type.toLowerCase(), description: value.description }
      }
      out.push({
        type: 'function',
        name: declaration.name,
        description: declaration.description,
        parameters: {
          type: 'object',
          properties,
          required: declaration.parameters?.required ?? [],
          additionalProperties: false,
        },
      })
    }
  }
  return out
}

// ── Outbound ──────────────────────────────────────────────────────────────

export interface SetupOptions {
  model: string
  voice: string
  systemInstruction: string
  tools: GeminiToolBlock[]
  /** Gemini only: resume a dropped session rather than starting a new one. */
  resumptionHandle?: string | null
}

/** The first frame after the socket opens, in whichever dialect applies. */
export function buildSetupMessage(provider: LiveProvider, options: SetupOptions): unknown {
  if (provider === 'openai') {
    return {
      type: 'session.update',
      session: {
        type: 'realtime',
        model: options.model,
        instructions: options.systemInstruction,
        output_modalities: ['audio'],
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            // Without this the session produces no text for the user's side at
            // all, which is what left voice conversations with no history.
            transcription: { model: 'gpt-4o-mini-transcribe' },
            // Semantic VAD waits out a trailing "uhhm" instead of cutting in on
            // it — closer to how Gemini's turn-taking already feels.
            turn_detection: { type: 'semantic_vad' },
            noise_reduction: { type: 'near_field' },
          },
          output: {
            format: { type: 'audio/pcm', rate: 24000 },
            voice: options.voice,
          },
        },
        tools: toOpenAITools(options.tools),
        tool_choice: 'auto',
      },
    }
  }

  return {
    setup: {
      model: `models/${options.model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice } } },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      contextWindowCompression: { slidingWindow: {} },
      sessionResumption: options.resumptionHandle ? { handle: options.resumptionHandle } : {},
      systemInstruction: { parts: [{ text: options.systemInstruction }] },
      tools: options.tools,
    },
  }
}

/** One chunk of microphone audio, base64 PCM16 at the provider's mic rate. */
export function buildAudioMessage(provider: LiveProvider, base64: string): unknown {
  if (provider === 'openai') {
    return { type: 'input_audio_buffer.append', audio: base64 }
  }
  return {
    realtimeInput: { audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } },
  }
}

export interface ToolResult {
  id: string
  name: string
  result: string
}

/**
 * The frames that hand tool results back.
 *
 * An array rather than one message because OpenAI needs a `response.create` after
 * the outputs to make the model actually speak again, where Gemini resumes on its
 * own. Returning a list keeps that asymmetry out of the caller.
 */
export function buildToolResponses(provider: LiveProvider, results: ToolResult[]): unknown[] {
  if (results.length === 0) return []

  if (provider === 'openai') {
    return [
      ...results.map((r) => ({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: r.id, output: r.result },
      })),
      { type: 'response.create' },
    ]
  }

  return [
    {
      toolResponse: {
        functionResponses: results.map((r) => ({
          id: r.id,
          name: r.name,
          response: { result: r.result },
        })),
      },
    },
  ]
}

/**
 * A fact the model should absorb without replying to it.
 *
 * Used when the user presses Send on a drafted email: the model needs to stop
 * treating the draft as pending, but a spoken "great, I've sent that" on top of the
 * user's own click is noise.
 */
export function buildSilentNote(provider: LiveProvider, text: string): unknown {
  if (provider === 'openai') {
    return {
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    }
  }
  return {
    clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: false },
  }
}

// ── Inbound ───────────────────────────────────────────────────────────────

export interface NormalizedLiveEvent {
  /** The session is up and the microphone can start. */
  ready?: boolean
  /** A fragment of what the user said. */
  inputTranscript?: string
  /** A fragment of what Kan said. */
  outputTranscript?: string
  /** The turn closed — flush both transcript buffers. */
  turnComplete?: boolean
  /** Base64 PCM16 to play. */
  audio?: string
  toolCalls?: Array<{ id: string; name: string; args: Record<string, string> }>
  /** The user spoke over Kan; drop whatever is queued. */
  interrupted?: boolean
  error?: string
  /** Gemini only: a handle for reconnecting mid-conversation. */
  resumptionHandle?: string
}

/**
 * One server frame, in the shape the component understands.
 *
 * Returns null for the many frames neither side needs to act on — rate-limit
 * updates, item lifecycle echoes, buffer commits. Everything the UI reacts to is
 * enumerated here rather than pattern-matched loosely, so adding a behaviour means
 * naming the event that drives it.
 */
export function normalizeLiveEvent(
  provider: LiveProvider,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msg: any,
): NormalizedLiveEvent | null {
  if (!msg || typeof msg !== 'object') return null

  if (provider === 'openai') {
    switch (msg.type) {
      // Both count as ready. `session.created` arrives before our session.update
      // is applied and `session.updated` after; a session that errors on the
      // update would otherwise never start a microphone at all.
      case 'session.created':
      case 'session.updated':
        return { ready: true }

      case 'response.output_audio.delta':
        return msg.delta ? { audio: msg.delta } : null

      case 'conversation.item.input_audio_transcription.delta':
        return msg.delta ? { inputTranscript: msg.delta } : null

      case 'response.output_audio_transcript.delta':
        return msg.delta ? { outputTranscript: msg.delta } : null

      case 'response.done':
        return { turnComplete: true }

      case 'input_audio_buffer.speech_started':
        return { interrupted: true }

      case 'response.function_call_arguments.done':
        return {
          toolCalls: [
            {
              id: msg.call_id ?? msg.item_id ?? '',
              name: msg.name ?? '',
              args: parseArguments(msg.arguments),
            },
          ],
        }

      case 'error':
        return { error: msg.error?.message || 'Realtime session error' }

      default:
        return null
    }
  }

  const event: NormalizedLiveEvent = {}
  let touched = false

  if (msg.setupComplete) {
    event.ready = true
    touched = true
  }
  if (msg.serverContent?.inputTranscription?.text) {
    event.inputTranscript = msg.serverContent.inputTranscription.text
    touched = true
  }
  if (msg.serverContent?.outputTranscription?.text) {
    event.outputTranscript = msg.serverContent.outputTranscription.text
    touched = true
  }
  if (msg.serverContent?.turnComplete) {
    event.turnComplete = true
    touched = true
  }
  if (msg.serverContent?.modelTurn?.parts) {
    for (const part of msg.serverContent.modelTurn.parts) {
      if (part.inlineData?.data) {
        // One frame can carry several audio parts; the component plays them in
        // order, so only the concatenation matters.
        event.audio = (event.audio ?? '') + part.inlineData.data
        touched = true
      }
    }
  }
  if (msg.toolCall?.functionCalls) {
    event.toolCalls = msg.toolCall.functionCalls.map(
      (call: { id?: string; name?: string; args?: Record<string, string> }) => ({
        id: call.id ?? '',
        name: call.name ?? '',
        args: call.args ?? {},
      }),
    )
    touched = true
  }
  if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate?.newHandle) {
    event.resumptionHandle = msg.sessionResumptionUpdate.newHandle
    touched = true
  }
  if (msg.error) {
    event.error = msg.error.message || JSON.stringify(msg.error)
    touched = true
  }

  return touched ? event : null
}

/**
 * OpenAI hands function arguments back as a JSON string.
 *
 * Values are stringified rather than passed through, because every executeAction
 * handler in the component reads `args.someField` as a string — a number arriving
 * as a number is the kind of thing that works until a tool does `.trim()` on it.
 */
function parseArguments(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === null || value === undefined) continue
      out[key] = typeof value === 'string' ? value : JSON.stringify(value)
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Audio chunking for OpenAI's playback path.
 *
 * Both providers emit 24 kHz PCM16 base64, which is why the component's existing
 * `playChunk` needs no provider branch at all. Kept as an explicit export so the
 * assumption is stated somewhere rather than implied by it happening to work.
 */
export const LIVE_PLAYBACK_SAMPLE_RATE = 24000
