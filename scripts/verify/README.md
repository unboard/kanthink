# Verification harnesses

Checks that need a real database and real concurrent connections, so they cannot
live in `npm test`. Run them by hand when the thing they cover changes.

## AI spending ledger

The guard that stops a published app's AI helper from spending past its ceiling is a
single conditional insert, and the only way to know it holds is to make several
callers race for the last slot.

```bash
D=$(mktemp -d)
# One multi-connection race per process: a local SQLite file will not hand the write
# lock back to a second set of contenders inside the same process.
npx tsx scripts/verify/ai-budget-concurrency.ts $D/a.db shared   # through reserve()
npx tsx scripts/verify/ai-budget-concurrency.ts $D/b.db across   # two apps, one owner, separate connections
npx tsx scripts/verify/ai-budget-concurrency.ts $D/c.db burst    # six separate connections, one slot

# And the negative control, so a passing run means something.
npx tsx scripts/verify/ai-budget-control.ts $D/d.db
```

The control runs the obvious wrong implementation — read the total, decide, then
insert — over the same six independent connections. It admits all six and reserves
about five times the ceiling. The real guard admits one.

The pure arithmetic — units, per-model prices, whether the largest request the route
accepts fits inside its reservation — is in `tests/ai-spend-pricing.test.ts` and runs
with `npm test`.
