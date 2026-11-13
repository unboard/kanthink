/**
 * What Kan knows and can do in Kan City's voice mode.
 *
 * The talking happens on a live voice socket, so Kan answers the moment you stop.
 * The work happens in the city's agent, which is slow (it reads, plans, runs bots),
 * so the live model hands it over as a background job and keeps talking while the
 * city shows the job happening. When it lands, Kan hears and tells you.
 */

export const CITY_JOB_TOOL = {
  name: 'city_job',
  description:
    'Hand a piece of work to Kan City to do in the background: make or change cards, set up a channel, run or talk to a bot, read or search what is in their channels, write an email draft, plan, anything in their Kanthink. Returns at once; the work keeps running and the city shows it. You get a [Job done] note when it finishes.',
  parameters: {
    type: 'OBJECT',
    properties: {
      instruction: {
        type: 'STRING',
        description: 'The whole request as a clear instruction, with every name, detail and channel they mentioned. It is all the worker will see.',
      },
      label: { type: 'STRING', description: 'Three to six words for the screen, like "Card for the Tim proof".' },
    },
    required: ['instruction'],
  },
}

export function cityVoiceTools(withSearch: boolean) {
  return [{ functionDeclarations: [CITY_JOB_TOOL] }, ...(withSearch ? [{ googleSearch: {} }] : [])]
}

export interface CityVoicePlot {
  name: string
  cards: number
  bot?: string
}

export function cityVoicePrompt(opts: { name?: string | null; plots: CityVoicePlot[]; kanwatch?: string; search: boolean }): string {
  const who = opts.name ? opts.name.split(' ')[0] : 'them'
  const town = opts.plots.slice(0, 40).map((p) => `- ${p.name} (${p.cards} cards${p.bot && p.bot !== 'off' ? `, bot ${p.bot}` : ''})`).join('\n')
  return `You are Kan, the AI inside Kanthink (a mushroom, warm and quick). You are talking out loud with ${who} while they watch Kan City: their channels are the buildings, each with a bot that can run it.

HOW TO TALK
- Like a person on a call: one to three short sentences, then let them talk. No lists, no ids, no links, no markdown.
- Answer right away. Never leave dead air while something runs.

DOING THINGS
- Anything that needs doing or looking up in their Kanthink goes to city_job, with a complete instruction (every name and detail they gave). Making a card, setting up a channel, running or calling a bot, reading what is in a channel, writing an email, changing the city: all city_job.
- Only start a job when they ask for something to be done, or say yes to your offer. Talking needs no job.
- The job runs in the background and the city shows it as it happens: cards fly into their buildings, new channels rise as buildings. Right after you start one, say in a few words that you are on it and what they will see. Then keep the conversation going: a thought about it, or a question that helps this job or what comes next.
- You can start another job while one runs; it waits its turn.
- Never say a job is finished until its [Job done] note arrives. When it does, tell them what came of it in a sentence or two, in your own words. [Progress] notes tell you what has happened so far, for when they ask how it is going; don't read them out unprompted.
- Emails: a job writes a draft that shows up on screen for them to read and send. Never say an email was sent unless a note says they sent it.
${opts.search ? '- For facts from the web, you may use Google Search yourself.\n' : '- You cannot search the web in this mode. Say so rather than guess.\n'}
THEIR CITY
${town || '(no channels yet)'}${opts.kanwatch ? `\n\n${opts.kanwatch}` : ''}`
}

/** What Kan hears when a job lands. */
export function jobDoneNote(job: { ask: string; reply: string | null; did: string[]; error?: string | null }): string {
  if (job.error) return `[Job done] It failed: ${job.error}. The job was: ${job.ask}. Tell them plainly, in a sentence, and offer to try again.`
  const reply = (job.reply ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500)
  return `[Job done] The job was: ${job.ask}\n${job.did.length ? `What changed: ${job.did.join('; ')}\n` : ''}What the worker reported: ${reply || '(nothing more)'}\nTell them what came of it in one or two spoken sentences.`
}
