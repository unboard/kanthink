import { describe, it, expect } from 'vitest'
import {
  LIVE_PROVIDERS,
  buildAudioMessage,
  buildSetupMessage,
  buildSilentNote,
  buildToolResponses,
  isLiveProvider,
  normalizeLiveEvent,
  resolveVoice,
  toOpenAITools,
  type GeminiToolBlock,
} from '@/lib/voice/liveProviders'

/**
 * Wire frames are provider-shaped JSON and the point of these tests is to reach
 * into them by key. A self-referential index signature allows the drilling without
 * `any`, and without importing either SDK's own types — those describe the frames
 * these builders are supposed to be checked against, so asserting with them would
 * be assuming the answer.
 */
interface Frame {
  [key: string]: Frame
}


/**
 * Live voice runs on two backends that agree about nothing at the wire level. These
 * guard the translation between them — specifically the cases where getting it
 * wrong produces a session that connects and then quietly misbehaves, which is much
 * harder to notice than one that fails to connect at all.
 */

const TOOLS: GeminiToolBlock[] = [
  {
    functionDeclarations: [
      {
        name: 'create_card',
        description: 'Create a card',
        parameters: {
          type: 'OBJECT',
          properties: {
            channelId: { type: 'STRING', description: 'Channel ID' },
            title: { type: 'STRING', description: 'Card title' },
          },
          required: ['channelId', 'title'],
        },
      },
    ],
  },
  // Gemini's built-in grounded search, which has no OpenAI counterpart.
  { googleSearch: {} } as unknown as GeminiToolBlock,
]

describe('tool translation', () => {
  it('lowercases Gemini’s pseudo-schema into real JSON Schema', () => {
    const [tool] = toOpenAITools(TOOLS)
    expect(tool.type).toBe('function')
    expect(tool.name).toBe('create_card')
    expect(tool.parameters.type).toBe('object')
    expect(tool.parameters.properties.channelId.type).toBe('string')
    expect(tool.parameters.required).toEqual(['channelId', 'title'])
  })

  it('drops googleSearch rather than sending OpenAI a tool it cannot have', () => {
    const tools = toOpenAITools(TOOLS)
    expect(tools).toHaveLength(1)
    expect(tools.every((t) => t.name)).toBe(true)
  })
})

describe('setup frames', () => {
  const options = {
    model: 'gpt-live-1',
    voice: 'marin',
    systemInstruction: 'You are Kan.',
    tools: TOOLS,
  }

  it('sends OpenAI a session.update with 24kHz audio both ways', () => {
    const frame = buildSetupMessage('openai', options) as unknown as Frame
    expect(frame.type).toBe('session.update')
    expect(frame.session.type).toBe('realtime')
    expect(frame.session.instructions).toBe('You are Kan.')
    expect(frame.session.audio.input.format).toEqual({ type: 'audio/pcm', rate: 24000 })
    expect(frame.session.audio.output.format).toEqual({ type: 'audio/pcm', rate: 24000 })
    expect(frame.session.audio.output.voice).toBe('marin')
  })

  it('asks OpenAI for input transcription, or conversations leave no history', () => {
    const frame = buildSetupMessage('openai', options) as unknown as Frame
    expect(frame.session.audio.input.transcription?.model).toBeTruthy()
  })

  it('sends Gemini a setup frame with a models/ prefix and both transcriptions', () => {
    const frame = buildSetupMessage('google', {
      ...options,
      model: 'gemini-3.1-flash-live-preview',
      voice: 'Kore',
    }) as unknown as Frame
    expect(frame.setup.model).toBe('models/gemini-3.1-flash-live-preview')
    expect(frame.setup.inputAudioTranscription).toEqual({})
    expect(frame.setup.outputAudioTranscription).toEqual({})
    expect(frame.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName)
      .toBe('Kore')
  })

  it('carries a Gemini resumption handle, and starts fresh without one', () => {
    const withHandle = buildSetupMessage('google', { ...options, resumptionHandle: 'h1' }) as unknown as Frame
    expect(withHandle.setup.sessionResumption).toEqual({ handle: 'h1' })
    const without = buildSetupMessage('google', options) as unknown as Frame
    expect(without.setup.sessionResumption).toEqual({})
  })
})

describe('audio frames', () => {
  it('uses each provider’s own append shape', () => {
    expect(buildAudioMessage('openai', 'AAA')).toEqual({
      type: 'input_audio_buffer.append',
      audio: 'AAA',
    })
    expect(buildAudioMessage('google', 'AAA')).toEqual({
      realtimeInput: { audio: { data: 'AAA', mimeType: 'audio/pcm;rate=16000' } },
    })
  })

  it('declares the mic rate each backend actually wants', () => {
    expect(LIVE_PROVIDERS.google.micSampleRate).toBe(16000)
    expect(LIVE_PROVIDERS.openai.micSampleRate).toBe(24000)
  })

  it('agrees on playback rate, which is why playChunk needs no branch', () => {
    expect(LIVE_PROVIDERS.google.playbackSampleRate).toBe(
      LIVE_PROVIDERS.openai.playbackSampleRate,
    )
  })
})

describe('tool responses', () => {
  const results = [{ id: 'call_1', name: 'create_card', result: 'Created' }]

  it('follows OpenAI outputs with a response.create, or the model never speaks again', () => {
    const frames = buildToolResponses('openai', results) as unknown as Frame[]
    expect(frames).toHaveLength(2)
    expect(frames[0].item).toEqual({
      type: 'function_call_output',
      call_id: 'call_1',
      output: 'Created',
    })
    expect(frames[1].type).toBe('response.create')
  })

  it('sends Gemini one toolResponse and lets it resume on its own', () => {
    const frames = buildToolResponses('google', results) as unknown as Frame[]
    expect(frames).toHaveLength(1)
    expect(frames[0].toolResponse.functionResponses[0]).toEqual({
      id: 'call_1',
      name: 'create_card',
      response: { result: 'Created' },
    })
  })

  it('sends nothing at all when there is nothing to report', () => {
    expect(buildToolResponses('openai', [])).toEqual([])
    expect(buildToolResponses('google', [])).toEqual([])
  })
})

describe('silent notes', () => {
  it('adds context without asking either provider for a reply', () => {
    const openai = buildSilentNote('openai', 'The user sent it.') as unknown as Frame
    expect(openai.type).toBe('conversation.item.create')
    // No response.create alongside it — that is what keeps it silent.
    expect(openai.item.role).toBe('user')

    const google = buildSilentNote('google', 'The user sent it.') as unknown as Frame
    expect(google.clientContent.turnComplete).toBe(false)
  })
})

describe('normalizing server events', () => {
  it('treats both OpenAI session events as ready', () => {
    expect(normalizeLiveEvent('openai', { type: 'session.created' })?.ready).toBe(true)
    expect(normalizeLiveEvent('openai', { type: 'session.updated' })?.ready).toBe(true)
  })

  it('reads audio, transcripts and turn ends off OpenAI’s GA event names', () => {
    expect(normalizeLiveEvent('openai', { type: 'response.output_audio.delta', delta: 'PCM' }))
      .toEqual({ audio: 'PCM' })
    expect(normalizeLiveEvent('openai', {
      type: 'conversation.item.input_audio_transcription.delta',
      delta: 'hello',
    })).toEqual({ inputTranscript: 'hello' })
    expect(normalizeLiveEvent('openai', {
      type: 'response.output_audio_transcript.delta',
      delta: 'hi there',
    })).toEqual({ outputTranscript: 'hi there' })
    expect(normalizeLiveEvent('openai', { type: 'response.done' })?.turnComplete).toBe(true)
  })

  it('treats OpenAI speech_started as barge-in', () => {
    expect(normalizeLiveEvent('openai', { type: 'input_audio_buffer.speech_started' }))
      .toEqual({ interrupted: true })
  })

  it('parses OpenAI’s JSON-string arguments into the string map tools expect', () => {
    const evt = normalizeLiveEvent('openai', {
      type: 'response.function_call_arguments.done',
      call_id: 'call_9',
      name: 'create_card',
      arguments: '{"channelId":"c1","title":"Fix the thing","count":3}',
    })
    expect(evt?.toolCalls).toEqual([
      {
        id: 'call_9',
        name: 'create_card',
        // Every handler reads args as strings; a number arriving as a number is
        // what breaks the first tool that calls .trim() on one.
        args: { channelId: 'c1', title: 'Fix the thing', count: '3' },
      },
    ])
  })

  it('survives malformed arguments rather than throwing mid-session', () => {
    const evt = normalizeLiveEvent('openai', {
      type: 'response.function_call_arguments.done',
      call_id: 'c',
      name: 'x',
      arguments: '{not json',
    })
    expect(evt?.toolCalls?.[0].args).toEqual({})
  })

  it('ignores the many OpenAI frames nothing reacts to', () => {
    expect(normalizeLiveEvent('openai', { type: 'rate_limits.updated' })).toBeNull()
    expect(normalizeLiveEvent('openai', { type: 'input_audio_buffer.committed' })).toBeNull()
    expect(normalizeLiveEvent('openai', null)).toBeNull()
  })

  it('still reads every Gemini frame it always did', () => {
    expect(normalizeLiveEvent('google', { setupComplete: {} })?.ready).toBe(true)
    expect(normalizeLiveEvent('google', {
      serverContent: { inputTranscription: { text: 'hi' } },
    })?.inputTranscript).toBe('hi')
    expect(normalizeLiveEvent('google', {
      serverContent: { modelTurn: { parts: [{ inlineData: { data: 'A' } }, { inlineData: { data: 'B' } }] } },
    })?.audio).toBe('AB')
    expect(normalizeLiveEvent('google', {
      toolCall: { functionCalls: [{ id: '1', name: 'create_card', args: { title: 't' } }] },
    })?.toolCalls).toEqual([{ id: '1', name: 'create_card', args: { title: 't' } }])
    expect(normalizeLiveEvent('google', {
      sessionResumptionUpdate: { resumable: true, newHandle: 'h2' },
    })?.resumptionHandle).toBe('h2')
    expect(normalizeLiveEvent('google', { rateLimits: {} })).toBeNull()
  })

  it('surfaces errors from both', () => {
    expect(normalizeLiveEvent('openai', { type: 'error', error: { message: 'nope' } })?.error)
      .toBe('nope')
    expect(normalizeLiveEvent('google', { error: { message: 'nope' } })?.error).toBe('nope')
  })
})

describe('voices', () => {
  it('falls back rather than carrying a Gemini voice to OpenAI', () => {
    expect(resolveVoice('openai', 'Kore')).toBe(LIVE_PROVIDERS.openai.defaultVoice)
    expect(resolveVoice('google', 'marin')).toBe(LIVE_PROVIDERS.google.defaultVoice)
  })

  it('keeps a voice the provider actually has', () => {
    expect(resolveVoice('openai', 'cedar')).toBe('cedar')
    expect(resolveVoice('google', 'Puck')).toBe('Puck')
  })

  it('guards whatever comes back out of localStorage', () => {
    expect(isLiveProvider('openai')).toBe(true)
    expect(isLiveProvider('anthropic')).toBe(false)
    expect(isLiveProvider(null)).toBe(false)
  })
})
