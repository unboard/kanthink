Read and implement bugs/features from the Kanthink bug channel.

## Workflow

1. Run the bug reader script to fetch cards from the "Do these" column:
   ```
   npx tsx scripts/read-kanthink-bugs.ts
   ```

2. If there are **no cards** in the column, skip to step 7 (send a "no work" email). Do NOT commit, push, or deploy anything.

3. Review each card. Cards contain:
   - A title (the bug/feature name)
   - Thread messages with details (may include image URLs — read images with the Read tool)
   - The card ID (needed to move it and to add notes)

4. For each card, implement the fix or feature. If a card is unclear, ask the user before proceeding.

5. After implementing a card's fix:
   a. **Add a note to the card thread** summarizing what was done. This shows as Kan in the thread. **Keep it to 2-3 short sentences max** — the thread UI truncates long messages. Include what shipped, any key decisions, and one suggested next step. No bullet lists or headers.
      ```
      npx tsx scripts/read-kanthink-bugs.ts --note <cardId> <short summary>
      ```
   b. **Move it to "Completed"**:
      ```
      npx tsx scripts/read-kanthink-bugs.ts --move <cardId>
      ```
   **Move cards one at a time, sequentially.** Do NOT run multiple moves in parallel — position calculations depend on the previous move completing first. If a move fails, diagnose and fix before continuing.

6. Once all cards are done, commit the changes and push to deploy (Vercel auto-deploys from main).

7. **Send a summary email** after every run using the Kanthink email template:
   - If cards were completed:
     ```
     npx tsx scripts/send-bug-summary-email.ts --completed '[{"title":"Card title","summary":"What was done"}]'
     ```
   - If no cards were in the queue:
     ```
     npx tsx scripts/send-bug-summary-email.ts --no-work
     ```
   The email renders using the DynamicEmail template (matching the Kanthink email design system) and sends to dhodg22@gmail.com via Customer.IO.

## Important: Timestamp format for raw SQL

The `--move` and `--note` commands use direct DB access (not the production API). If you ever need to write raw SQL against the database, **timestamps must be epoch integers** (e.g. `Math.floor(Date.now() / 1000)`). Never use `new Date().toISOString()` — Drizzle ORM stores timestamps as integer epochs and will fail to deserialize text timestamps, silently breaking channel fetch and causing stale localStorage to be shown. For application code, always go through the API or Drizzle ORM for writes.

$ARGUMENTS
