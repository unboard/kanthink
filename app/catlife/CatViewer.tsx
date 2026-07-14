'use client';

// Small standalone 3D viewer for a single cat (used by the field guide,
// intro kitten picker, challenge reward screens, and the Style Studio's
// close-up inspection views).

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CatAvatar } from './cats';
import type { CatSpec } from './types';

export type ViewerView = 'full' | 'face' | 'ears' | 'eyes' | 'mouth' | 'whiskers' | 'tail';

// camera presets per body part, scaled by the cat's size in the effect below
const VIEWS: Record<ViewerView, { pos: [number, number, number]; look: [number, number, number] }> = {
  full: { pos: [0, 1.1, 3.4], look: [0, 0.55, 0] },
  face: { pos: [0, 1.05, 1.75], look: [0, 0.92, 0.3] },
  eyes: { pos: [0, 1.05, 1.35], look: [0, 0.98, 0.3] },
  mouth: { pos: [0, 0.92, 1.7], look: [0, 0.83, 0.35] },
  whiskers: { pos: [0.35, 0.95, 1.45], look: [0, 0.88, 0.28] },
  ears: { pos: [0, 1.5, 1.85], look: [0, 1.12, 0.5] },
  tail: { pos: [1.35, 1.5, -2.5], look: [0, 0.9, -0.45] },
};

export default function CatViewer({
  spec,
  size = 280,
  rotation = null,
  action = 'idle',
  view = 'full',
}: {
  spec: CatSpec;
  size?: number;
  rotation?: number | null; // radians; null = autorotate (full view only)
  action?: 'idle' | 'sit' | 'run';
  view?: ViewerView;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef(rotation);
  rotRef.current = rotation;
  const viewRef = useRef<ViewerView>(view);
  viewRef.current = view;

  // key fields that require a rebuild
  const rebuildKey = `${spec.id}|${spec.coat.pattern}|${spec.accessory}|${spec.coat.base}|${spec.stage ?? 'adult'}|${spec.coat.eyeColor}|${spec.coat.accentColor}|${JSON.stringify(spec.style ?? {})}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);

    scene.add(new THREE.HemisphereLight('#fff7e8', '#b8a888', 1.1));
    const key = new THREE.DirectionalLight('#fff2d8', 2.2);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#cfe3f5', 0.8);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    // soft ground shadow disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 32),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.12 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    scene.add(disc);

    const avatar = new CatAvatar(spec);
    avatar.setAction(action);
    if (action === 'run') avatar.moveSpeed = 5;
    scene.add(avatar.root);

    // close-up presets scale with the cat so kittens frame nicely too
    const s = Math.max(0.6, spec.size);
    const applyView = (v: ViewerView) => {
      const preset = VIEWS[v];
      camera.position.set(preset.pos[0] * s, preset.pos[1] * s, preset.pos[2] * s);
      camera.lookAt(preset.look[0] * s, preset.look[1] * s, preset.look[2] * s);
    };
    applyView(viewRef.current);
    let lastView = viewRef.current;

    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      if (viewRef.current !== lastView) {
        lastView = viewRef.current;
        applyView(lastView);
      }
      avatar.update(dt, t);
      // close-ups hold still (facing camera) unless the kid uses the spin slider
      const autorotate = lastView === 'full' && rotRef.current === null;
      avatar.root.rotation.y = autorotate ? t * 0.6 : (rotRef.current ?? 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      avatar.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebuildKey, size, action]);

  return <canvas ref={canvasRef} style={{ width: size, height: size, touchAction: 'none' }} />;
}
