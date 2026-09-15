# Journey verification

Scripts used to walk one published app through the whole customer journey against
the production database, because some of it cannot be asserted in a unit test: two
real customers, two devices, a publish in the middle.

They read credentials from an env file you point at with `ENV_FILE`; nothing is
committed. To use them, pull production env into a file that is git-ignored:

```bash
vercel env pull .verify/prod.env --environment=production --yes
ENV_FILE=.verify/prod.env node .verify/boundary.mjs
```

- `peek.mjs` / `code-dump.mjs` — the app row, and its generated code as text
- `members.mjs` — create and verify demo customers
- `code.mjs` — recover a sign-in code from its stored HMAC (needs the server secret)
- `harness.mjs` + `serve.mjs` — run a generated app as a top-level page against the
  real storage API, so it can be driven directly rather than through the sandboxed
  iframe
- `boundary.mjs` — the ownership boundary, probed against the live API
- `entitlement.ts` — does a purchase open the door, and a refund close it
- `paywall.mjs` — gate an app and record a purchase the way the webhook does,
  without talking to Stripe
- `data.mjs` — what is actually in app_customer_data

`.verify/*.env`, `harness.html` and `app.jsx` are generated and git-ignored.
