#!/usr/bin/env bash
#
# Bring up the local payment test.
#
# The test-mode key is read from .stripe-test.env and pushed into the environment of
# the two processes that need it. Nothing on disk changes: .env.local keeps the live
# key, and Next's env loader leaves a variable alone when the process already has one
# (verified — @next/env only fills in keys that are undefined in the initial env).
#
#   .verify/stripe-run.sh
#
# Leaves a dev server on :3000 and a webhook forwarder running. Ctrl-C stops both.
set -euo pipefail
cd "$(dirname "$0")/.."

KEYFILE=.stripe-test.env
STRIPE=./.tools/stripe/stripe.exe

[ -f "$KEYFILE" ] || { echo "Missing $KEYFILE — see the instruction in the report."; exit 1; }

# shellcheck disable=SC1090
SK=$(grep -oE '^[[:space:]]*STRIPE_SECRET_KEY[[:space:]]*=[[:space:]]*.*' "$KEYFILE" \
     | head -1 | sed -E 's/^[^=]*=[[:space:]]*//' | tr -d '"'"'"'\r ')

case "$SK" in
  sk_test_*) : ;;
  *) echo "REFUSING: the key in $KEYFILE is not a test key (starts \"${SK:0:8}\")."; exit 1 ;;
esac
echo "Using a test-mode key (sk_test_…${SK: -4}). Live credentials untouched."

# The forwarder's signing secret. Printed and discarded, never written to disk.
WHSEC=$("$STRIPE" listen --api-key "$SK" --print-secret 2>/dev/null | tr -d '\r\n ')
case "$WHSEC" in
  whsec_*) echo "Webhook signing secret obtained." ;;
  *) echo "Could not get a webhook secret from the CLI. Output was: $WHSEC"; exit 1 ;;
esac

mkdir -p .verify/logs
: > .verify/logs/dev.log
: > .verify/logs/stripe.log

STRIPE_SECRET_KEY="$SK" STRIPE_WEBHOOK_SECRET="$WHSEC" \
  npm run dev > .verify/logs/dev.log 2>&1 &
DEV=$!

"$STRIPE" listen --api-key "$SK" \
  --forward-to localhost:3000/api/webhooks/stripe \
  --events checkout.session.completed,charge.refunded,customer.subscription.updated,customer.subscription.deleted \
  > .verify/logs/stripe.log 2>&1 &
FWD=$!

echo "dev pid $DEV, forwarder pid $FWD"
echo "logs: .verify/logs/dev.log and .verify/logs/stripe.log"
trap 'kill $DEV $FWD 2>/dev/null || true' EXIT
wait
