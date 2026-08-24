/**
 * Playground runtime dependencies.
 *
 * The playground iframe gets a hardcoded import map: react, react-dom, lucide-react.
 * That ceiling is why "build me a three.js visual" or "use this GitHub library" were
 * impossible — not because the code couldn't be written, but because the browser had
 * no way to resolve the import.
 *
 * This module turns a short declaration like `three` or `gh:owner/repo@ref` into an
 * import-map entry pointing at esm.sh, which serves both npm packages and GitHub
 * repositories as browser-native ES modules.
 *
 * SECURITY: resolved URLs are injected into a <script type="importmap"> block inside
 * the iframe document. Every declaration is validated against a strict grammar and
 * the host is always esm.sh — raw URLs are never accepted. That combination is what
 * makes string interpolation into the document safe: a declaration that could break
 * out of the JSON (or point at an attacker's origin) cannot survive parsing.
 */

/** Base modules always present in the iframe. Declarations may not shadow these. */
export const BASE_SPECIFIERS = ['react', 'react-dom', 'react-dom/client', 'lucide-react'] as const;

/** Hard cap. Import maps are cheap, but an unbounded list is a footgun, not a feature. */
export const MAX_RUNTIME_DEPS = 12;

const ESM_HOST = 'https://esm.sh';

/**
 * Pin the iframe's React so packages that depend on it resolve to the same copy.
 * Without this, esm.sh serves each react-consuming package its own React and you
 * get the "invalid hook call / two Reacts" class of bug. Harmless for packages
 * that don't depend on React — esm.sh ignores deps it doesn't need.
 */
const REACT_DEPS_PARAM = 'deps=react@19.0.0,react-dom@19.0.0';

export interface ResolvedDep {
  /** Bare specifier the generated code imports, e.g. `three`. */
  specifier: string;
  /** Absolute esm.sh URL the import map points at. */
  url: string;
  /** Where it came from, for display. */
  source: 'npm' | 'github';
  /** The original declaration, echoed back for storage/debugging. */
  raw: string;
}

export class RuntimeDepError extends Error {}

// ── Grammar ──────────────────────────────────────────────────────────
// npm:     pkg | pkg@version | @scope/pkg | @scope/pkg@version
// github:  gh:owner/repo | gh:owner/repo@ref
// alias:   name=<either of the above>
//
// Deliberately strict. Anything with a scheme, a slash-path beyond the package
// name, whitespace, or quoting is rejected rather than sanitized — a declaration
// we don't fully understand is one we shouldn't put in an import map.

const NPM_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?([a-z0-9][a-z0-9._-]*)(?:@([a-zA-Z0-9][a-zA-Z0-9._~^>=<.-]*))?$/;
const GH_RE = /^gh:([a-zA-Z0-9][a-zA-Z0-9._-]*)\/([a-zA-Z0-9][a-zA-Z0-9._-]*)(?:@([a-zA-Z0-9][a-zA-Z0-9._/-]*))?$/;
const ALIAS_RE = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * Resolve one declaration into an import-map entry.
 *
 * @throws RuntimeDepError when the declaration doesn't match the grammar.
 */
export function resolveDep(declaration: string): ResolvedDep {
  const raw = declaration.trim();
  if (!raw) throw new RuntimeDepError('Empty dependency declaration.');
  if (raw.length > 200) throw new RuntimeDepError(`Dependency declaration too long: ${raw.slice(0, 40)}…`);

  // Split an explicit alias off the front: `three=gh:mrdoob/three.js@r160`.
  // GitHub repo names make poor bare specifiers, so an alias is how you get a
  // sane import name for them.
  let alias: string | null = null;
  let spec = raw;
  const eq = raw.indexOf('=');
  if (eq !== -1) {
    alias = raw.slice(0, eq).trim();
    spec = raw.slice(eq + 1).trim();
    if (!ALIAS_RE.test(alias)) {
      throw new RuntimeDepError(`Invalid import name "${alias}". Use lowercase letters, digits, dot, dash or underscore.`);
    }
  }

  const gh = GH_RE.exec(spec);
  if (gh) {
    const [, owner, repo, ref] = gh;
    const path = ref ? `gh/${owner}/${repo}@${ref}` : `gh/${owner}/${repo}`;
    return {
      specifier: alias || repo,
      url: `${ESM_HOST}/${path}?${REACT_DEPS_PARAM}`,
      source: 'github',
      raw,
    };
  }

  const npm = NPM_RE.exec(spec);
  if (npm) {
    const [, scope, name, version] = npm;
    const pkg = `${scope || ''}${name}`;
    const path = version ? `${pkg}@${version}` : pkg;
    return {
      specifier: alias || pkg,
      url: `${ESM_HOST}/${path}?${REACT_DEPS_PARAM}`,
      source: 'npm',
      raw,
    };
  }

  throw new RuntimeDepError(
    `Can't resolve "${raw}". Use a package name (three, d3-scale, @scope/pkg@1.2.3) ` +
      `or a repo (gh:owner/repo@ref). Full URLs are not accepted.`
  );
}

/**
 * Resolve a list of declarations, dropping anything invalid rather than failing the
 * whole generation.
 *
 * A bad dependency should cost you that library, not the app you just waited two
 * minutes for — the model picks these, and it will occasionally invent one. Rejects
 * are returned so the caller can surface them.
 */
export function resolveDeps(declarations: string[]): {
  deps: ResolvedDep[];
  rejected: Array<{ raw: string; reason: string }>;
} {
  const deps: ResolvedDep[] = [];
  const rejected: Array<{ raw: string; reason: string }> = [];
  const seen = new Set<string>(BASE_SPECIFIERS);

  for (const declaration of declarations) {
    if (deps.length >= MAX_RUNTIME_DEPS) {
      rejected.push({ raw: declaration, reason: `More than ${MAX_RUNTIME_DEPS} dependencies` });
      continue;
    }
    let resolved: ResolvedDep;
    try {
      resolved = resolveDep(declaration);
    } catch (err) {
      rejected.push({ raw: declaration, reason: err instanceof RuntimeDepError ? err.message : 'Invalid' });
      continue;
    }
    // Never let a declaration shadow react/lucide — that would swap the runtime out
    // from under the host wrapper, which imports React itself.
    if (seen.has(resolved.specifier)) {
      rejected.push({ raw: declaration, reason: `"${resolved.specifier}" is already provided by the runtime` });
      continue;
    }
    seen.add(resolved.specifier);
    deps.push(resolved);
  }

  return { deps, rejected };
}

/**
 * Build the iframe's import map, base modules plus resolved extras.
 * Returned pretty-printed because it lands in a document people read while debugging.
 */
export function buildImportMap(deps: ResolvedDep[]): string {
  const imports: Record<string, string> = {
    react: 'https://esm.sh/react@19.0.0',
    'react/': 'https://esm.sh/react@19.0.0/',
    'react-dom': 'https://esm.sh/react-dom@19.0.0',
    'react-dom/client': 'https://esm.sh/react-dom@19.0.0/client',
    'lucide-react': 'https://esm.sh/lucide-react@0.468.0?deps=react@19.0.0',
  };

  for (const dep of deps) {
    imports[dep.specifier] = dep.url;
    // Subpath access — `three/examples/jsm/controls/OrbitControls.js` is how half of
    // three.js actually gets used, and it's dead without the trailing-slash mapping.
    imports[`${dep.specifier}/`] = `${dep.url.split('?')[0]}/`;
  }

  return JSON.stringify({ imports }, null, 2);
}

/**
 * One line per dependency, for the generation prompt.
 * The model needs to know what it may import; this is that list.
 */
export function describeDepsForPrompt(deps: ResolvedDep[]): string {
  if (deps.length === 0) return '';
  return deps
    .map(d => {
      const origin = d.source === 'github' ? `GitHub repo ${d.raw.replace(/^.*?gh:/, '')}` : 'npm';
      return `- \`${d.specifier}\` (${origin}) — import from '${d.specifier}', subpaths via '${d.specifier}/...'`;
    })
    .join('\n');
}
