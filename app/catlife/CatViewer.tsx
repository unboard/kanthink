'use client';

// Small standalone 3D viewer for a single cat (used by the field guide,
// intro kitten picker, and challenge reward screens).

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CatAvatar } from './cats';
import type { CatSpec } from './types';

export default function CatViewer({
  spec,
  size = 280,
  rotation = null,
  action = 'idle',
}: {
  spec: CatSpec;
  size?: number;
  rotation?: number | null; // radians; null = autorotate
  action?: 'idle' | 'sit' | 'run';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef(rotation);
  rotRef.current = rotation;

  // key fields that require a rebuild
  const rebuildKey = `${spec.id}|${spec.coat.pattern}|${spec.accessory}|${spec.coat.base}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 1.1, 3.4);
    camera.lookAt(0, 0.55, 0);

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

    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      avatar.update(dt, t);
      avatar.root.rotation.y = rotRef.current !== null ? rotRef.current : t * 0.6;
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
