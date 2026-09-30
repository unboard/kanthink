/**
 * What a well-made channel looks like, written once for every model that designs one.
 *
 * Ask Kan (a conversation in the new-channel overlay) and create_channel (home chat and
 * voice) used to describe channels separately — one in a prompt, the other as keyword
 * templates — so the same request made two very different channels. Both now design
 * against this.
 */

export const CHANNEL_DESIGN_RULES = `A channel has:
- **name**: short and specific.
- **description**: one sentence on what the channel is for.
- **instructions**: the standing brief Kan reads on every run in this channel. Carry every requirement the person stated — the fields each card must cover, rubrics and grades, audiences, constraints, sources, tone. Keep their structure: if they listed things, list them. Length follows what they gave you: a sentence when they said little, a full rubric when they gave one. Never summarise a requirement away. Write it to Kan doing the work, not as notes on how to set the channel up.
- **columns**: 3–6, named in the person's domain (1–3 words each). Each has a one-line "description" of what belongs in it. The first is where new cards land and has "isAiTarget": true.
- **shrooms**: the automations, usually 1–3. Each has:
  - "title": a short verb phrase
  - "action": "generate" (make new cards), "modify" (write onto existing cards), "move" (sort cards between columns), or "build" (turn a card into a working single-file app — use it when they want an app, prototype, visual or presentation made from a card)
  - "targetColumnName": exactly one of the column names. For generate, where cards land; otherwise, the column whose cards it works on.
  - "instructions": complete on their own. Spell out what the shroom must produce — the sections, fields and grades asked for — instead of pointing at the channel instructions. Never state a number of cards; cardCount carries that.
  - "cardCount": generate only. 5 unless the person gave a number.
  - "triggerOnArrival": true to run on its own whenever a card lands in its target column, as a stage in a pipeline. Leave it out for shrooms run on demand.
- Every job the person asked a shroom to do gets a shroom. Don't invent stages or pipelines they didn't ask for.
- Don't reuse the name of a channel they already have.`;

export const CHANNEL_CONFIG_EXAMPLE = `{
  "name": "Channel Name",
  "description": "One sentence on what the channel is for",
  "instructions": "The standing brief, carrying every requirement they gave",
  "columns": [
    {"name": "Inbox", "description": "New items land here", "isAiTarget": true},
    {"name": "Promising", "description": "Worth a closer look"},
    {"name": "Archive", "description": "Done or dismissed"}
  ],
  "shrooms": [
    {"title": "Generate ideas", "action": "generate", "targetColumnName": "Inbox", "cardCount": 5, "instructions": "What each card must contain, section by section"}
  ]
}`;
