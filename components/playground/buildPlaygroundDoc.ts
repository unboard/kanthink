import { buildImportMap, type ResolvedDep } from '@/lib/playground/runtime';

/**
 * Build the full HTML document we inject into the playground iframe via `srcdoc`.
 *
 * Runtime contract (must match the Gemini system prompt):
 * - User code is JSX (no TypeScript types) with default-exported `App`.
 * - Imports allowed: react, react-dom/client, lucide-react, plus any dependencies
 *   declared for this playground (see `options.deps` and lib/playground/runtime).
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
  options?: {
    title?: string;
    uploadUrl?: string;
    aiUrl?: string;
    saveUrl?: string;
    appToken?: string;
    /** Absolute URL for per-customer storage. */
    dataUrl?: string;
    /**
     * Signed by the host after it resolved a real session from the cookie. Absent
     * when nobody is signed in, which is what makes kanthinkData.signedIn false.
     */
    dataToken?: string;
    /** Who is signed in, for the app to show. Never used for authorisation. */
    customer?: { email: string; name?: string | null } | null;
    /**
     * Everything this customer has saved, baked in so an app can render their work
     * on its first frame instead of flashing an empty state and filling it in.
     */
    customerData?: Record<string, unknown> | null;
    /** Where to send someone who is not signed in. */
    signInUrl?: string;
    /**
     * Set only for an app that charges for something inside itself, rather than at
     * the door. Drives window.kanthinkPay: `price` is already formatted, `entitled`
     * says whether this visitor has paid, and `payToken` is the proof the server
     * asks for before it will spend the publisher's money on their behalf.
     *
     * Absent entirely for a free app and for one gated at the door — in both cases
     * there is nothing inside to buy, and kanthinkPay reflects that.
     */
    pay?: {
      entitled: boolean;
      price: string;
      recurring: boolean;
      /** Only present when entitled. */
      token?: string | null;
      /**
       * The owner looking at their own draft.
       *
       * There is nobody to sell to here, so unlock() flips entitlement in place
       * rather than opening a checkout. That is the only way an author gets to
       * walk both sides of their own paywall without buying their own app.
       */
      preview?: boolean;
    } | null;
    /**
     * If set, baked into `window.kanthinkInitial.record` so the app can hydrate
     * from a specific saved record (used by /play/{token}/r/{slug}). Apps in the
     * editor view receive `null`.
     */
    initialRecord?: { slug: string; data: unknown; label?: string } | null;
    /**
     * Extra modules to expose in the import map, already resolved and validated by
     * lib/playground/runtime. Anything not resolved through there must not be passed
     * in — these values are interpolated straight into the document.
     */
    deps?: ResolvedDep[];
  }
): string {
  const title = (options?.title || 'Kanthink Playground').replace(/[<>]/g, '');
  // Default to a relative path; PlaygroundView / public-play page will pass the
  // absolute origin so the helper works from inside an opaque-origin iframe.
  const uploadUrl = (options?.uploadUrl || '/api/playground/upload').replace(/[<>"]/g, '');
  const aiUrl = (options?.aiUrl || '/api/playground/ai').replace(/[<>"]/g, '');
  const saveUrl = (options?.saveUrl || '/api/playground/save').replace(/[<>"]/g, '');
  const appToken = (options?.appToken || '').replace(/[<>"]/g, '');
  const dataUrl = (options?.dataUrl || '/api/playground/data').replace(/[<>"]/g, '');
  const dataToken = (options?.dataToken || '').replace(/[<>"]/g, '');
  const pay = options?.pay ?? null;
  const payToken = (pay?.token || '').replace(/[<>"]/g, '');
  const signInUrl = (options?.signInUrl || '').replace(/[<>"]/g, '');
  const customer = options?.customer ?? null;
  const customerData = options?.customerData ?? null;
  const initialRecord = options?.initialRecord ?? null;
  // Strip an accidental opening markdown fence if Gemini ever leaks one.
  // Also strip any `import React ...` lines: the iframe's wrapper already does
  // `import * as React from 'react'` so user code that re-imports React would
  // hit "Identifier 'React' has already been declared".
  const cleanCode = code
    .replace(/^```(?:jsx|tsx|js|javascript|typescript)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    // `import React, { useState } from 'react';`  →  `import { useState } from 'react';`
    .replace(/^\s*import\s+React\s*,\s*\{([^}]+)\}\s*from\s*['"]react['"]\s*;?\s*$/gm, "import {$1} from 'react';")
    // `import React from 'react';`               →  removed
    .replace(/^\s*import\s+React\s+from\s*['"]react['"]\s*;?\s*$/gm, '')
    // `import * as React from 'react';`          →  removed
    .replace(/^\s*import\s+\*\s+as\s+React\s+from\s*['"]react['"]\s*;?\s*$/gm, '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
<title>${title}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script type="importmap">
${buildImportMap(options?.deps || [])}
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
<script>window.__kpg_seed = {};/*__KPG_SEED__*/</script>
<script>
  // Storage shim — this iframe runs with an opaque origin (no allow-same-origin),
  // so reading window.localStorage / sessionStorage throws SecurityError. Without
  // this shim, almost every generated app crashes on first render with:
  //   "Failed to read the 'localStorage' property from 'Window': The document is
  //    sandboxed and lacks the 'allow-same-origin' flag."
  // We probe each storage API and, if it throws, install a same-shape in-memory
  // replacement so generated apps run cleanly. State is per-session (lost on
  // iframe reload), which is fine for prototype playgrounds.
  (function() {
    function probeWorks(name) {
      try {
        var s = window[name];
        s.setItem('__kpg_probe', '1');
        s.removeItem('__kpg_probe');
        return true;
      } catch (_) {
        return false;
      }
    }
    function makeStorage(name) {
      // Seeded by the host page, which holds the real thing. The iframe runs on an
      // opaque origin so it has no storage of its own — without this, a high score
      // survived exactly as long as the tab was not reloaded, and an app that told
      // someone their score was saved was lying to them.
      var seed = (window.__kpg_seed && window.__kpg_seed[name]) || {};
      var store = Object.create(null);
      for (var k in seed) store[k] = String(seed[k]);

      function push() {
        try {
          parent.postMessage({ type: 'kpg_storage', area: name, data: Object.assign({}, store) }, '*');
        } catch (_) {}
      }
      var storage = {
        getItem: function(k) {
          k = String(k);
          return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
        },
        setItem: function(k, v) { store[String(k)] = String(v); push(); },
        removeItem: function(k) { delete store[String(k)]; push(); },
        clear: function() { for (var k in store) delete store[k]; push(); },
        key: function(i) {
          var keys = Object.keys(store);
          return i < keys.length ? keys[i] : null;
        }
      };
      Object.defineProperty(storage, 'length', {
        get: function() { return Object.keys(store).length; }
      });
      return storage;
    }
    ['localStorage', 'sessionStorage'].forEach(function(name) {
      if (probeWorks(name)) return;
      try {
        Object.defineProperty(window, name, { configurable: true, value: makeStorage(name) });
      } catch (_) {
        try { window[name] = makeStorage(name); } catch(__) {}
      }
    });
  })();

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

  // HMAC card token baked at build time — proves to /api/playground/{ai,save}
  // which card this iframe is authorized to read/write. The iframe runs in an
  // opaque-origin sandbox so it has no cookies; this token is the auth.
  var __KPG_APP_TOKEN = ${JSON.stringify(appToken)};

  // Initial record hydration — when this iframe is rendered from
  // /play/{token}/r/{slug}, the host bakes the saved record here so the
  // generated app can read it synchronously on mount. Null in the editor
  // view and on the unscoped public page.
  window.kanthinkInitial = ${JSON.stringify({ record: initialRecord })};

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

  // Handing the person a file.
  //
  // This is a browser capability and always was — what was missing is the iframe's
  // allow-downloads flag, without which Chrome drops every download silently and
  // leaves only a console line. Generated apps learned the wrong lesson from that
  // and started telling people to right-click an image to save it, which on a phone
  // is not a thing you can do.
  //
  // It is a helper rather than four lines of inline blob code because the two cases
  // that actually come up are the two a model gets wrong:
  //
  //   - a remote URL. The download attribute is IGNORED cross-origin, so linking
  //     straight to a Cloudinary image navigates to it instead of saving it. It
  //     has to be fetched into a blob of this origin first.
  //   - a data: URL. Large ones are slow or refused as an href; decoding to a blob
  //     is both faster and reliable.
  //
  // Everything resolves to a blob, an object URL and one synthetic click.
  function __kpg_blob(data, mime) {
    // Already one.
    if (typeof Blob !== 'undefined' && data instanceof Blob) return Promise.resolve(data);

    // A canvas — the shape an export button usually has in hand.
    if (typeof HTMLCanvasElement !== 'undefined' && data instanceof HTMLCanvasElement) {
      return new Promise(function(resolve, reject) {
        data.toBlob(function(b) {
          b ? resolve(b) : reject(new Error('Could not read that canvas.'));
        }, mime || 'image/png');
      });
    }

    if (typeof data === 'string') {
      // data:<mime>;base64,<payload> — decode rather than hand it over as an href.
      if (/^data:/i.test(data)) {
        var comma = data.indexOf(',');
        var head = data.slice(5, comma);
        var body = data.slice(comma + 1);
        var type = head.replace(/;base64$/i, '') || mime || 'application/octet-stream';
        if (/;base64$/i.test(head)) {
          var bin = atob(body);
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return Promise.resolve(new Blob([bytes], { type: type }));
        }
        return Promise.resolve(new Blob([decodeURIComponent(body)], { type: type }));
      }

      // A URL somewhere else. Fetched, because the download attribute does not
      // survive a cross-origin href — the browser navigates instead of saving.
      //
      // Prefix checks rather than a regex: this whole runtime is one template
      // literal, and an escaped forward slash inside it collapses on the way out,
      // so a URL pattern arrives in the emitted script as a line comment that
      // swallows the rest of the condition. Plain string comparisons cannot.
      var lower = data.toLowerCase();
      var isRemote = lower.indexOf('http:') === 0
        || lower.indexOf('https:') === 0
        || lower.indexOf('blob:') === 0
        || lower.indexOf('//') === 0;
      if (isRemote) {
        return fetch(data, { mode: 'cors' }).then(function(res) {
          if (!res.ok) throw new Error('Could not fetch that file (' + res.status + ')');
          return res.blob();
        });
      }

      // Plain text: CSV, JSON, SVG markup, anything the app built as a string.
      return Promise.resolve(new Blob([data], { type: mime || 'text/plain;charset=utf-8' }));
    }

    // Anything else is treated as JSON, which is what an "export my data" button
    // has: an object or an array.
    try {
      return Promise.resolve(
        new Blob([JSON.stringify(data, null, 2)], { type: mime || 'application/json' })
      );
    } catch (e) {
      return Promise.reject(new Error('kanthinkDownload could not turn that into a file.'));
    }
  }

  /**
   * Save something to the person's device.
   *
   * @param {Blob|HTMLCanvasElement|string|object} data - blob, canvas, data: URL,
   *        http(s) URL, plain string (CSV/JSON/SVG), or any JSON-able value.
   * @param {string} filename - what it should be called, extension included.
   * @param {string} [mimeType] - only needed to override what is inferred.
   * @returns {Promise<void>} resolves once the download has been handed to the
   *          browser; rejects with something worth showing if it could not be.
   */
  window.kanthinkDownload = function(data, filename, mimeType) {
    if (data === undefined || data === null) {
      return Promise.reject(new Error('kanthinkDownload needs something to save.'));
    }
    if (!filename || typeof filename !== 'string') {
      return Promise.reject(new Error('kanthinkDownload needs a filename, e.g. "logo.png".'));
    }
    // A path separator in a filename is how a download escapes its folder.
    var name = filename.replace(/[\/\\:*?"<>|]/g, '_').slice(0, 120) || 'download';

    return __kpg_blob(data, mimeType).then(function(blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      // Appended before clicking: a detached anchor is ignored in some browsers.
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Late enough that the download has started, and it cannot be revoked
      // synchronously — doing so cancels it in Safari.
      setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
    });
  };

  // Saved-record helper — generated apps use this to persist arbitrary JSON
  // server-side and get back a shareable per-record URL.
  var __KPG_SAVE_URL = ${JSON.stringify(saveUrl)};
  window.kanthinkSave = function(data, label) {
    if (!__KPG_APP_TOKEN) return Promise.reject(new Error('Save is not available in this playground (no app token).'));
    if (data === undefined || data === null) return Promise.reject(new Error('kanthinkSave requires data.'));
    var payload = {
      appToken: __KPG_APP_TOKEN,
      data: data,
      label: typeof label === 'string' ? label : undefined
    };
    return fetch(__KPG_SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      mode: 'cors'
    }).then(function(res) {
      return res.json().then(function(j) {
        if (!res.ok) throw new Error(j && j.error ? j.error : 'Save failed (' + res.status + ')');
        // Promote relative url → absolute https url using the parent origin
        // baked into __KPG_SAVE_URL. The iframe's own origin is opaque so we
        // can't read it from location.
        if (j && typeof j.url === 'string' && j.url.charAt(0) === '/') {
          try { j.url = new URL(__KPG_SAVE_URL).origin + j.url; } catch(_) {}
        }
        return j;
      });
    });
  };

  // Per-customer storage. The one thing in this runtime that follows a person
  // rather than a browser: rows live against their account on the server, so the
  // same sign-in on another device sees the same work.
  //
  // The token is minted by the host page from the access cookie. This document
  // never names whose data it wants — the server derives that from the token —
  // so nothing an app sends can reach another customer.
  var __KPG_DATA_URL = ${JSON.stringify(dataUrl)};
  var __KPG_DATA_TOKEN = ${JSON.stringify(dataToken)};
  var __KPG_SIGNIN_URL = ${JSON.stringify(signInUrl)};
  var __KPG_DATA_SEED = ${JSON.stringify(customerData ?? {})};

  function __kpg_data(op, key, value) {
    if (!__KPG_DATA_TOKEN) {
      return Promise.reject(new Error("Nobody is signed in, so there is nowhere to save this. Call kanthinkData.signIn() first."));
    }
    return fetch(__KPG_DATA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataToken: __KPG_DATA_TOKEN, op: op, key: key, value: value }),
      mode: "cors"
    }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(j) {
        if (!res.ok) {
          // Every failure path rejects. An app cannot show "Saved" off the back
          // of a refusal, because there is no resolved promise to hang it on.
          var err = new Error(j && j.error ? j.error : "Could not save (" + res.status + ")");
          err.code = j && j.code;
          err.signedIn = j && j.signedIn;
          throw err;
        }
        return j;
      });
    });
  }

  window.kanthinkData = {
    /** True when there is somebody to save against. */
    signedIn: !!__KPG_DATA_TOKEN,
    /** Who that is, for display. Never the thing the server trusts. */
    customer: ${JSON.stringify(customer)},
    /**
     * Everything they had saved, already here on the first render. Read this for
     * initial state instead of awaiting list() and flashing an empty screen.
     */
    initial: __KPG_DATA_SEED,
    /** One value. Resolves to the saved value, or null if there is none. */
    get: function(key) {
      return __kpg_data("get", key).then(function(j) {
        return j && j.record ? j.record.value : null;
      });
    },
    /** Save one value. Rejects if it would cross a limit; nothing is dropped. */
    set: function(key, value) {
      return __kpg_data("set", key, value).then(function(j) { return j; });
    },
    /** Forget one value. */
    remove: function(key) { return __kpg_data("delete", key); },
    /** Every key this customer has here, as a plain object. */
    all: function() {
      return __kpg_data("list").then(function(j) {
        var out = {};
        (j.records || []).forEach(function(r) { out[r.key] = r.value; });
        return out;
      });
    },
    /** Bytes and keys used, against their limits. */
    usage: function() { return __kpg_data("usage").then(function(j) { return j.usage; }); },
    /** Send someone to sign in. Returns false if the host offered no route. */
    signIn: function() {
      if (!__KPG_SIGNIN_URL) return false;
      try { parent.postMessage({ type: "kpg_signin" }, "*"); } catch(_) {}
      return true;
    }
  };

  // Paying for something inside the app, rather than for the app.
  //
  // entitled is a flag in a browser the visitor controls, and nothing here
  // pretends otherwise — an app should use it to decide what to SHOW, never as the
  // last word on what it will do. The last word lives on the server: __KPG_PAY_TOKEN
  // rides along with every AI call, and an action-gated app without a live purchase
  // behind that token gets a 402 there whatever the flag said.
  var __KPG_PAY = ${JSON.stringify(
    pay
      ? {
          enabled: true,
          entitled: !!pay.entitled,
          price: pay.price,
          recurring: !!pay.recurring,
          preview: !!pay.preview,
        }
      : null,
  )};
  var __KPG_PAY_TOKEN = ${JSON.stringify(payToken)};

  window.kanthinkPay = {
    /** True when this app charges for something inside itself. */
    enabled: !!(__KPG_PAY && __KPG_PAY.enabled),
    /**
     * Has this visitor paid?
     *
     * Always false for an app that does not charge, so a bare !entitled check
     * would hide a free app's features from everyone. Gate on
     * kanthinkPay.enabled && !kanthinkPay.entitled instead.
     */
    entitled: !!(__KPG_PAY && __KPG_PAY.entitled),
    /** Formatted for showing on the button: "$4.00", "$4.00/mo". */
    price: (__KPG_PAY && __KPG_PAY.price) || '',
    /** True for a subscription, false for a one-off. */
    recurring: !!(__KPG_PAY && __KPG_PAY.recurring),
    /**
     * Open the host's purchase sheet. Call it from the button the person pressed.
     *
     * Returns false when there is nothing to buy — a free app, or one already paid
     * for — so a button can fall through to doing the thing instead.
     */
    unlock: function() {
      if (!__KPG_PAY || !__KPG_PAY.enabled) return false;
      if (__KPG_PAY.entitled) return false;
      if (__KPG_PAY.preview) {
        // A draft preview has no buyer. Flip it here and tell anyone listening,
        // so the author sees the paid side of their own app immediately.
        __KPG_PAY.entitled = true;
        window.kanthinkPay.entitled = true;
        try {
          window.dispatchEvent(new CustomEvent("kanthink:entitled"));
          parent.postMessage({ type: "kpg_unlock_preview" }, "*");
        } catch(_) {}
        return true;
      }
      try { parent.postMessage({ type: "kpg_unlock" }, "*"); } catch(_) {}
      return true;
    }
  };

  // AI helper — generated apps use this for any AI/LLM feature (vision, text gen,
  // structured output). Routes through the card owner's BYOK key so the apps you
  // build use the same Gemini account as your code-gen calls.
  var __KPG_AI_URL = ${JSON.stringify(aiUrl)};
  /**
   * Turn a failed AI response into an error an app can act on.
   *
   * A 402 means the person has not bought what they just asked for. That is not a
   * fault — it is the purchase prompt arriving through the only channel that can
   * honestly raise it — so it is tagged rather than described, and an app catches
   * err.code === 'payment_required' and calls kanthinkPay.unlock().
   */
  function __kpg_ai_error(res, data, fallback) {
    var err = new Error(
      (data && data.error) || (fallback || 'AI call failed') + ' (' + res.status + ')'
    );
    err.status = res.status;
    err.code = (data && data.code) || (res.status === 402 ? 'payment_required' : undefined);
    return err;
  }

  window.kanthinkAI = {
    // Frontier 3.x first (recommended). 2.5 family kept as stable fallbacks.
    models: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    /**
     * Generate text from Gemini using the playground owner's AI account.
     * @param {Object} opts
     * @param {string} opts.prompt - the user-facing prompt
     * @param {string} [opts.system] - optional system instruction
     * @param {string} [opts.model] - one of kanthinkAI.models (default: gemini-2.5-pro)
     * @param {string} [opts.imageUrl] - public image URL to send as vision input
     * @param {string} [opts.imageData] - data:image/...;base64,... vision input
     * @param {Object} [opts.jsonSchema] - Gemini responseSchema for structured output
     * @param {number} [opts.maxOutputTokens]
     * @returns Promise<{ text: string, json?: any, model: string, usage?: {inputTokens, outputTokens} }>
     */
    generate: function(opts) {
      if (!opts || typeof opts !== 'object') return Promise.reject(new Error('kanthinkAI.generate requires an options object.'));
      if (!opts.prompt) return Promise.reject(new Error('kanthinkAI.generate requires opts.prompt.'));
      if (!__KPG_APP_TOKEN) return Promise.reject(new Error('AI is not available in this playground (no app token).'));
      var payload = {
        appToken: __KPG_APP_TOKEN,
        payToken: __KPG_PAY_TOKEN,
        prompt: opts.prompt,
        system: opts.system,
        model: opts.model,
        imageUrl: opts.imageUrl,
        imageData: opts.imageData,
        jsonSchema: opts.jsonSchema,
        maxOutputTokens: opts.maxOutputTokens
      };
      return fetch(__KPG_AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors'
      }).then(function(res) {
        return res.json().then(function(data) {
          if (!res.ok) throw __kpg_ai_error(res, data);
          return data;
        });
      });
    },
    /**
     * Generate (or edit) an image.
     * Use for: "draw X", "make me a picture of Y", AI avatars, illustration apps,
     * style transfer, photo edits ("turn this into a watercolor"), stickers.
     *
     * @param {Object} opts
     * @param {string} opts.prompt - what to draw / how to edit the input image
     * @param {string} [opts.imageUrl] - optional input image URL to edit/transform
     * @param {string} [opts.imageData] - optional data: URL input image
     * @param {string} [opts.model] - 'gpt-image-2.5-flare' | 'gpt-image-2.5-sunburst'
     *          | 'gemini-3.1-flash-image-preview' | 'gemini-2.5-flash-image'.
     *          Omit for the owner's account default.
     * @param {string} [opts.background] - 'transparent' for a real alpha channel
     *          (stickers, cut-outs, icons over any backdrop), 'opaque', or 'auto'.
     *          Transparent needs one of the gpt-image models — pass opts.model too.
     * @param {string} [opts.size] - '1:1' | '4:3' | '16:9' | '3:4' | '9:16'
     * @returns Promise<{ dataUrl: string, mimeType: string, text?: string, model: string }>
     *          dataUrl is a base64 data: URL ready to drop into <img src> or
     *          to pass to window.kanthinkUpload to convert to a permanent CDN URL.
     *          With background:'transparent' it is a PNG with real alpha, so it
     *          composites over any background without a halo.
     */
    generateImage: function(opts) {
      if (!opts || typeof opts !== 'object') return Promise.reject(new Error('kanthinkAI.generateImage requires an options object.'));
      if (!opts.prompt) return Promise.reject(new Error('kanthinkAI.generateImage requires opts.prompt.'));
      if (!__KPG_APP_TOKEN) return Promise.reject(new Error('AI is not available in this playground (no app token).'));
      var payload = {
        appToken: __KPG_APP_TOKEN,
        payToken: __KPG_PAY_TOKEN,
        mode: 'image',
        prompt: opts.prompt,
        imageModel: opts.model,
        background: opts.background,
        size: opts.size,
        imageUrl: opts.imageUrl,
        imageData: opts.imageData
      };
      return fetch(__KPG_AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors'
      }).then(function(res) {
        return res.json().then(function(data) {
          if (!res.ok) throw __kpg_ai_error(res, data, 'Image generation failed');
          return data;
        });
      });
    }
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
