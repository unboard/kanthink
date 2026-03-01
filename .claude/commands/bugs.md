Read and implement bugs/features from the Kanthink bug channel.

## Workflow

1. Run the bug reader script to fetch cards from the "Do these" column:
   ```
   npx tsx scripts/read-kanthink-bugs.ts
   ```

2. Review each card. Cards contain:
   - A title (the bug/feature name)
   - Thread messages with details (may include image URLs — read images with the Read tool)
   - The card ID (needed to move it when done)

3. For each card, implement the fix or feature. If a card is unclear, ask the user before proceeding.

4. After implementing a card's fix, move it to "Completed" by running:
   ```
   npx tsx scripts/read-kanthink-bugs.ts --move <cardId>
   ```
   **Move cards one at a time, sequentially.** Do NOT run multiple moves in parallel — position calculations depend on the previous move completing first. If a move fails, diagnose and fix before continuing.

5. Once all cards are done, commit the changes and push to deploy (Vercel auto-deploys from main).

## Important: Timestamp format for raw SQL

The `--move` command uses direct DB access (not the production API). If you ever need to write raw SQL against the database, **timestamps must be epoch integers** (e.g. `Math.floor(Date.now() / 1000)`). Never use `new Date().toISOString()` — Drizzle ORM stores timestamps as integer epochs and will fail to deserialize text timestamps, silently breaking channel fetch and causing stale localStorage to be shown. For application code, always go through the API or Drizzle ORM for writes.

$ARGUMENTS
