'use client';

import { useEffect } from 'react';

/**
 * Last resort: catches throws in the root layout itself, which app/error.tsx
 * cannot reach.
 *
 * This file replaces the root layout, so it renders without globals.css, without
 * the Geist fonts and without the providers. Everything here is therefore inline
 * and self-contained — importing the app's own styling would mean depending on
 * the layer that just failed. It is deliberately plainer than the other two.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/global-error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#151515',
          color: '#ededed',
          padding: '2rem',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ maxWidth: '26rem', textAlign: 'center' }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '9999px',
              background: '#8b5cf6',
              boxShadow: '0 0 22px #8b5cf6',
              margin: '0 auto 2.25rem',
            }}
          />

          <p
            style={{
              margin: 0,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 11,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#71717a',
            }}
          >
            error · kanthink
          </p>

          <h1
            style={{
              margin: '1rem 0 0',
              fontSize: '1.75rem',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              fontWeight: 600,
            }}
          >
            Kanthink couldn’t start.
          </h1>

          <p style={{ margin: '1rem 0 0', fontSize: 15, lineHeight: 1.6, color: '#a1a1aa' }}>
            This one is on our side, not yours. Your boards are safe on the server.
          </p>

          <div style={{ marginTop: '2.25rem', display: 'grid', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                width: '100%',
                padding: '0.7rem 1.25rem',
                borderRadius: 8,
                border: 'none',
                background: '#7c3aed',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                display: 'block',
                padding: '0.7rem 1.25rem',
                borderRadius: 8,
                border: '1px solid #262626',
                color: '#d4d4d8',
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Reload Kanthink
            </a>
          </div>

          {error.digest && (
            <p
              style={{
                margin: '1.75rem 0 0',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 11,
                color: '#52525b',
              }}
            >
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
