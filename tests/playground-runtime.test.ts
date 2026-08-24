import { describe, it, expect } from 'vitest';
import {
  resolveDep,
  resolveDeps,
  buildImportMap,
  describeDepsForPrompt,
  RuntimeDepError,
  MAX_RUNTIME_DEPS,
} from '@/lib/playground/runtime';

describe('resolveDep', () => {
  it('resolves a bare npm package', () => {
    const dep = resolveDep('three');
    expect(dep.specifier).toBe('three');
    expect(dep.url).toContain('https://esm.sh/three?');
    expect(dep.source).toBe('npm');
  });

  it('resolves a pinned version', () => {
    expect(resolveDep('three@0.185.0').url).toContain('https://esm.sh/three@0.185.0?');
  });

  it('resolves a scoped package', () => {
    const dep = resolveDep('@react-three/fiber@8.15.0');
    expect(dep.specifier).toBe('@react-three/fiber');
    expect(dep.url).toContain('https://esm.sh/@react-three/fiber@8.15.0?');
  });

  it('resolves a GitHub repo, defaulting the import name to the repo name', () => {
    const dep = resolveDep('gh:owner/some-lib');
    expect(dep.specifier).toBe('some-lib');
    expect(dep.url).toContain('https://esm.sh/gh/owner/some-lib?');
    expect(dep.source).toBe('github');
  });

  it('resolves a GitHub repo at a ref', () => {
    expect(resolveDep('gh:mrdoob/three.js@r160').url).toContain('https://esm.sh/gh/mrdoob/three.js@r160?');
  });

  it('honours an explicit import alias', () => {
    const dep = resolveDep('three=gh:mrdoob/three.js@r160');
    expect(dep.specifier).toBe('three');
    expect(dep.url).toContain('gh/mrdoob/three.js@r160');
  });

  it('pins React so packages share the host copy', () => {
    // Two Reacts is the classic import-map bug; every entry carries the pin.
    expect(resolveDep('framer-motion').url).toContain('deps=react@19.0.0');
  });

  describe('rejects anything it cannot fully understand', () => {
    // The resolved URL is interpolated into an importmap <script> in the iframe
    // document. Strict parsing is what makes that safe.
    const bad = [
      ['a raw URL', 'https://evil.example.com/payload.js'],
      ['a protocol-relative URL', '//evil.example.com/x.js'],
      ['a data URL', 'data:text/javascript,alert(1)'],
      ['script-tag breakout', 'three</script><script>alert(1)</script>'],
      ['JSON breakout via quotes', 'three","x":"https://evil.example.com'],
      ['path traversal', '../../etc/passwd'],
      ['a deep path', 'three/examples/jsm/controls/OrbitControls.js'],
      ['whitespace', 'three three'],
      ['an empty string', ''],
      ['an invalid alias', 'BAD NAME=three'],
    ] as const;

    for (const [label, input] of bad) {
      it(`rejects ${label}`, () => {
        expect(() => resolveDep(input)).toThrow(RuntimeDepError);
      });
    }
  });

  it('never emits a URL off esm.sh', () => {
    for (const input of ['three', 'gh:owner/repo@main', '@scope/pkg@1.0.0', 'x=gh:a/b']) {
      expect(resolveDep(input).url.startsWith('https://esm.sh/')).toBe(true);
    }
  });
});

describe('resolveDeps', () => {
  it('drops invalid entries instead of failing the batch', () => {
    // A hallucinated package should cost that library, not the whole generation.
    const { deps, rejected } = resolveDeps(['three', 'https://evil.example.com/x.js', 'd3']);
    expect(deps.map(d => d.specifier)).toEqual(['three', 'd3']);
    expect(rejected).toHaveLength(1);
  });

  it('refuses to shadow a base runtime module', () => {
    const { deps, rejected } = resolveDeps(['react', 'lucide-react', 'three']);
    expect(deps.map(d => d.specifier)).toEqual(['three']);
    expect(rejected).toHaveLength(2);
    expect(rejected[0].reason).toMatch(/already provided/);
  });

  it('de-duplicates repeated specifiers', () => {
    const { deps } = resolveDeps(['three', 'three@0.185.0']);
    expect(deps).toHaveLength(1);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_RUNTIME_DEPS + 5 }, (_, i) => `pkg-${i}`);
    const { deps, rejected } = resolveDeps(many);
    expect(deps).toHaveLength(MAX_RUNTIME_DEPS);
    expect(rejected).toHaveLength(5);
  });

  it('returns empty for no declarations', () => {
    expect(resolveDeps([]).deps).toEqual([]);
  });
});

describe('buildImportMap', () => {
  it('always includes the base runtime', () => {
    const map = JSON.parse(buildImportMap([]));
    expect(map.imports['react']).toBeTruthy();
    expect(map.imports['react-dom/client']).toBeTruthy();
    expect(map.imports['lucide-react']).toBeTruthy();
  });

  it('adds resolved deps with a subpath mapping', () => {
    const { deps } = resolveDeps(['three']);
    const map = JSON.parse(buildImportMap(deps));
    expect(map.imports['three']).toContain('esm.sh/three');
    // three/examples/jsm/... is how three is used in practice.
    expect(map.imports['three/']).toBe('https://esm.sh/three/');
  });

  it('produces valid JSON that cannot break out of the script tag', () => {
    const { deps } = resolveDeps(['three', 'gh:owner/repo@main', '@scope/pkg']);
    const raw = buildImportMap(deps);
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(raw).not.toContain('</script');
    expect(raw).not.toContain('<');
  });
});

describe('describeDepsForPrompt', () => {
  it('is empty when there is nothing extra', () => {
    expect(describeDepsForPrompt([])).toBe('');
  });

  it('names the specifier the model must import', () => {
    const { deps } = resolveDeps(['three', 'gh:owner/cool-lib@v2']);
    const text = describeDepsForPrompt(deps);
    expect(text).toContain("import from 'three'");
    expect(text).toContain("import from 'cool-lib'");
    expect(text).toContain('GitHub repo');
  });
});
