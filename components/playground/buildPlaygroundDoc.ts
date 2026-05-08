/**
 * Build the full HTML document we inject into the playground iframe via `srcdoc`.
 *
 * Runtime contract (must match the Gemini system prompt):
 * - User code is JSX (no TypeScript types) with default-exported `App`.
 * - Imports allowed: react, react-dom/client, lucide-react.
 * - Tailwind utility classes work (Play CDN).
 * - Code is compiled in-browser by Babel standalone (data-type="module").
 *
 * The script tag block wraps user content in an error boundary, forwards runtime
 * errors to the parent window via `postMessage({ type: 'kpg_error', ... })`, and
 * exposes `window.kanthinkUpload(file)` for image/file storage via Cloudinary.
 *
 * @param code  User-generated JSX (the `App` component).
 * @param options.title       Document title shown in the tab.
 * @param options.uploadUrl   Absolute URL to POST uploads to. The iframe runs with
 *                            an opaque origin (no allow-same-origin) so it cannot
 *                            resolve relative URLs — the parent must bake in the
 *                            full origin at build time.
 */
export function buildPlaygroundDoc(
  code: string,
  options?: { title?: string; uploadUrl?: string }
): string {
  const title = (options?.title || 'Kanthink Playground').replace(/[<>]/g, '');
  // Default to a relative path; PlaygroundView / public-play page will pass the
  // absolute origin so the helper works from inside an opaque-origin iframe.
  const uploadUrl = (options?.uploadUrl || '/api/playground/upload').replace(/[<>"]/g, '');
  // Strip an accidental opening markdown fence if Gemini ever leaks one.
  const cleanCode = code
    .replace(/^```(?:jsx|tsx|js|javascript|typescript)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
<title>${title}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@19.0.0",
    "react/": "https://esm.sh/react@19.0.0/",
    "react-dom": "https://esm.sh/react-dom@19.0.0",
    "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
    "lucide-react": "https://esm.sh/lucide-react@0.468.0?deps=react@19.0.0"
  }
}
</script>
<style>
  html, body, #root { height: 100%; margin: 0; padding: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
  #__kpg_error { position: fixed; left: 12px; right: 12px; bottom: 12px; padding: 12px 14px; background: #1f1f1f; color: #fecaca; border: 1px solid #ef4444; border-radius: 12px; font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.4; max-height: 40vh; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.3); display: none; z-index: 9999; }
  #__kpg_error.visible { display: block; }
  #__kpg_error .label { color: #fca5a5; font-weight: 600; margin-bottom: 4px; display: block; }
</style>
</head>
<body>
<div id="root"></div>
<div id="__kpg_error"><span class="label">Runtime error</span><pre id="__kpg_error_msg" style="white-space:pre-wrap;margin:0;"></pre></div>
<script>
  // Forward errors to the parent so the chat can offer auto-fix.
  function __kpg_reportError(err) {
    var msg = err && (err.message || err.reason || String(err)) || 'Unknown error';
    var stack = err && err.stack ? err.stack : '';
    try { parent.postMessage({ type: 'kpg_error', message: msg, stack: stack }, '*'); } catch(_) {}
    var box = document.getElementById('__kpg_error');
    var pre = document.getElementById('__kpg_error_msg');
    if (box && pre) { pre.textContent = msg; box.classList.add('visible'); }
  }
  window.addEventListener('error', function(e) { __kpg_reportError(e.error || e); });
  window.addEventListener('unhandledrejection', function(e) { __kpg_reportError(e.reason || e); });
  // Ready signal so the parent knows the iframe document loaded
  window.addEventListener('load', function() {
    try { parent.postMessage({ type: 'kpg_ready' }, '*'); } catch(_) {}
  });

  // Cloudinary upload helper — generated apps use this for any image/file storage.
  // Absolute URL baked in at srcdoc build time; parent origin is unreachable from
  // here because the iframe runs with an opaque origin (no allow-same-origin).
  var __KPG_UPLOAD_URL = ${JSON.stringify(uploadUrl)};
  window.kanthinkUpload = function(file) {
    if (!file) return Promise.reject(new Error('No file provided'));
    if (!(file instanceof File || file instanceof Blob)) {
      return Promise.reject(new Error('kanthinkUpload expects a File or Blob.'));
    }
    var fd = new FormData();
    fd.append('file', file);
    return fetch(__KPG_UPLOAD_URL, { method: 'POST', body: fd, mode: 'cors' })
      .then(function(res) {
        return res.json().then(function(data) {
          if (!res.ok) throw new Error(data && data.error ? data.error : 'Upload failed (' + res.status + ')');
          return data;
        });
      });
  };
</script>
<script type="text/babel" data-type="module" data-presets="react">
// IMPORTANT: alias namespace import to "React" so Babel's classic JSX runtime
// (which emits React.createElement / React.Fragment calls) resolves correctly
// when the user code uses bare named imports like \`import { useState } from 'react'\`.
import * as React from 'react';
import { createRoot } from 'react-dom/client';

class __KPG_ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) {
    try { parent.postMessage({ type: 'kpg_error', message: (err && err.message) || String(err), stack: (info && info.componentStack) || '' }, '*'); } catch(_) {}
  }
  render() {
    if (this.state.error) {
      return React.createElement('div', { className: 'p-6 text-sm text-red-700 bg-red-50' },
        React.createElement('div', { className: 'font-semibold mb-1' }, 'The app crashed.'),
        React.createElement('pre', { className: 'whitespace-pre-wrap text-xs opacity-75' }, (this.state.error && this.state.error.message) || String(this.state.error))
      );
    }
    return this.props.children;
  }
}

// === USER CODE START ===
${cleanCode}
// === USER CODE END ===

const __kpg_root = createRoot(document.getElementById('root'));
__kpg_root.render(
  React.createElement(__KPG_ErrorBoundary, null,
    React.createElement(typeof App !== 'undefined' ? App : (() => React.createElement('div', { className: 'p-6 text-neutral-500' }, 'No App component exported.')), null)
  )
);
</script>
</body>
</html>`;
}
