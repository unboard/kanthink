import { describe, it, expect } from 'vitest';
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc';
import { resolveDeps } from '@/lib/playground/runtime';

const APP = 'export default function App() { return <div>hi</div>; }';

/**
 * The resolver is unit-tested separately. What matters here is the seam: a declaration
 * stored on a card has to survive all the way into the iframe's import map, or the
 * generated code imports something the browser cannot resolve.
 */
describe('buildPlaygroundDoc runtime wiring', () => {
  it('emits the base import map when nothing extra is declared', () => {
    const doc = buildPlaygroundDoc(APP);
    expect(doc).toContain('"react": "https://esm.sh/react@19.0.0"');
    expect(doc).toContain('"lucide-react"');
    expect(doc).toContain('esm.sh/react-dom@19.0.0/client');
  });

  it('puts a declared npm library into the import map', () => {
    const doc = buildPlaygroundDoc(APP, { deps: resolveDeps(['three']).deps });
    expect(doc).toContain('"three":');
    expect(doc).toContain('esm.sh/three');
    // Subpath mapping — three/examples/jsm/... is how three is actually consumed.
    expect(doc).toContain('"three/":');
  });

  it('puts a GitHub repo into the import map under its alias', () => {
    const doc = buildPlaygroundDoc(APP, { deps: resolveDeps(['viz=gh:owner/some-lib@v2'].map(String)).deps });
    expect(doc).toContain('"viz":');
    expect(doc).toContain('esm.sh/gh/owner/some-lib@v2');
  });

  it('still produces a parseable import map with several libraries', () => {
    const { deps } = resolveDeps(['three', 'd3-scale', '@scope/pkg@1.0.0', 'gh:owner/repo@main']);
    const doc = buildPlaygroundDoc(APP, { deps });
    const match = /<script type="importmap">\s*([\s\S]*?)\s*<\/script>/.exec(doc);
    expect(match).toBeTruthy();
    const parsed = JSON.parse(match![1]);
    expect(Object.keys(parsed.imports)).toContain('three');
    expect(Object.keys(parsed.imports)).toContain('@scope/pkg');
    expect(Object.keys(parsed.imports)).toContain('repo');
  });

  it('cannot be broken out of by a hostile declaration', () => {
    // These are all rejected by the resolver, so they never reach the document.
    // This asserts the end-to-end consequence rather than the resolver's return value.
    const { deps } = resolveDeps([
      'three</script><script>alert(1)</script>',
      'https://evil.example.com/x.js',
      'x","evil":"https://evil.example.com',
    ]);
    const doc = buildPlaygroundDoc(APP, { deps });
    expect(doc).not.toContain('evil.example.com');
    expect(doc).not.toContain('alert(1)');

    const match = /<script type="importmap">\s*([\s\S]*?)\s*<\/script>/.exec(doc);
    const parsed = JSON.parse(match![1]);
    // Only the base runtime survived.
    expect(Object.keys(parsed.imports).sort()).toEqual(
      ['lucide-react', 'react', 'react-dom', 'react-dom/client', 'react/'].sort()
    );
  });

  it('leaves the rest of the document intact', () => {
    const doc = buildPlaygroundDoc(APP, { deps: resolveDeps(['three']).deps });
    expect(doc).toContain('cdn.tailwindcss.com');
    expect(doc).toContain('@babel/standalone');
    expect(doc).toContain('=== USER CODE START ===');
    expect(doc).toContain('kanthinkUpload');
  });
});
