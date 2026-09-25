/**
 * A JSON response for work that takes minutes, sent so the caller doesn't give up.
 *
 * Node's fetch abandons a request whose response headers take over five minutes,
 * and an app build can take longer than that. This sends headers straight away,
 * then a space every so often while the work runs (leading whitespace is valid
 * JSON), then the body. Callers keep reading it with `res.json()`.
 *
 * The status is always 200 once streaming starts — a failure travels as
 * `{ error }` in the body, which is how callers of these routes already check.
 */
export function keepaliveJson(work: () => Promise<unknown>, everyMs = 20_000): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const timer = setInterval(() => controller.enqueue(encoder.encode(' ')), everyMs);
      try {
        controller.enqueue(encoder.encode(JSON.stringify(await work())));
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed' })));
      } finally {
        clearInterval(timer);
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
