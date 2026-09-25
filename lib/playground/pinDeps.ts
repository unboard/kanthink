/**
 * Pin the libraries an app uses to the versions it was built and previewed with.
 *
 * A declaration without a version (`canvas-confetti`) resolves to whatever is newest
 * on esm.sh on the day someone opens the app, so an app that worked when it was
 * published could break months later with nobody touching it. At build time the
 * newest version IS the one the preview just ran, so that is the one to record.
 *
 * - Already pinned: left alone.
 * - Pinned on the app before, re-declared bare now: the earlier pin is kept, so a
 *   rebuild never upgrades a library behind the user's back.
 * - npm registry unreachable, or a GitHub repo: left as declared. Pinning is a
 *   safeguard, and a failed lookup must never cost the build.
 */

const NPM_BARE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const LOOKUP_TIMEOUT_MS = 3000;

function split(declaration: string): { alias: string | null; spec: string } {
  const eq = declaration.indexOf('=');
  return eq === -1
    ? { alias: null, spec: declaration.trim() }
    : { alias: declaration.slice(0, eq).trim(), spec: declaration.slice(eq + 1).trim() };
}

/** The package name of an npm spec, with or without a version. */
function packageOf(spec: string): string | null {
  if (spec.startsWith('gh:')) return null;
  const at = spec.lastIndexOf('@');
  const name = at > 0 ? spec.slice(0, at) : spec;
  return NPM_BARE.test(name) ? name : null;
}

async function latestVersion(pkg: string, fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(`https://registry.npmjs.org/${pkg.replace('/', '%2F')}/latest`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === 'string' && /^\d+\.\d+\.\d+[\w.+-]*$/.test(body.version) ? body.version : null;
  } catch {
    return null;
  }
}

export async function pinDeps(
  declared: string[],
  previous: string[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  // What this app had pinned before, by package.
  const earlier = new Map<string, string>();
  for (const d of previous) {
    const { spec } = split(d);
    const pkg = packageOf(spec);
    if (pkg && spec.length > pkg.length) earlier.set(pkg, spec);
  }

  return Promise.all(declared.map(async (declaration) => {
    const { alias, spec } = split(declaration);
    const pkg = packageOf(spec);
    if (!pkg || spec !== pkg) return declaration; // GitHub, or already versioned
    const pinned = earlier.get(pkg) ?? (await latestVersion(pkg, fetchImpl).then((v) => (v ? `${pkg}@${v}` : null)));
    if (!pinned) return declaration;
    return alias ? `${alias}=${pinned}` : pinned;
  }));
}
