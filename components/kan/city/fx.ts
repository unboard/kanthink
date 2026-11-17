import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Sky } from './engine';

/**
 * How the map view is finished, past plain rendering: soft ambient occlusion so
 * buildings sit on the ground and corners darken the way real ones do, and a
 * tilt-shift band that keeps the middle sharp and softens the top and bottom of
 * the screen, so the city reads as a miniature on a table. Then tone mapping.
 *
 * Only the map view goes through it. Walking, driving and the insides of buildings
 * render plainly, and a slow GPU skips it altogether (the engine decides).
 */

/** A tilt-shift that blurs by distance from a focus band, both ways in one pass each. */
const TiltShift = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    dir: { value: new THREE.Vector2(1, 0) },
    focus: { value: 0.5 },
    band: { value: 0.22 },
    amount: { value: 1.6 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 dir;
    uniform float focus;
    uniform float band;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      float d = max(0.0, abs(vUv.y - focus) - band);
      float k = smoothstep(0.0, 0.35, d) * amount;
      vec4 c = texture2D(tDiffuse, vUv);
      if (k < 0.01) { gl_FragColor = c; return; }
      vec4 sum = c * 0.2270270270;
      vec2 o1 = dir * k * 1.3846153846, o2 = dir * k * 3.2307692308;
      sum += texture2D(tDiffuse, vUv + o1) * 0.3162162162;
      sum += texture2D(tDiffuse, vUv - o1) * 0.3162162162;
      sum += texture2D(tDiffuse, vUv + o2) * 0.0702702703;
      sum += texture2D(tDiffuse, vUv - o2) * 0.0702702703;
      gl_FragColor = sum;
    }`,
};

export class CityFx {
  private composer: EffectComposer;
  private render: RenderPass;
  private ao: GTAOPass;
  private tiltH: ShaderPass;
  private tiltV: ShaderPass;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.OrthographicCamera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.render = new RenderPass(scene, camera);
    this.composer.addPass(this.render);
    this.ao = new GTAOPass(scene, camera, size.x, size.y);
    // Scaled to the city: a building is about ten units across.
    this.ao.updateGtaoMaterial({ radius: 2.4, distanceExponent: 1.4, thickness: 3, scale: 1.15, samples: 12, distanceFallOff: 1 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.ao.blendIntensity = 0.85;
    this.composer.addPass(this.ao);
    this.tiltH = new ShaderPass(TiltShift);
    this.tiltV = new ShaderPass(TiltShift);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y, renderer.getPixelRatio());
  }

  setSize(w: number, h: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    // AO at half resolution: it's soft anyway, and the GPU is often a laptop's.
    this.ao.setSize(Math.round((w * pixelRatio) / 2), Math.round((h * pixelRatio) / 2));
    const px = 1 / Math.max(1, w * pixelRatio), py = 1 / Math.max(1, h * pixelRatio);
    this.tiltH.uniforms.dir.value.set(px, 0);
    this.tiltV.uniforms.dir.value.set(0, py);
  }

  /** Zoomed in, the band is wider and the blur gentler: close up you want to read things. */
  frame(zoom: number) {
    const band = THREE.MathUtils.clamp(0.2 + (zoom - 1) * 0.08, 0.2, 0.42);
    const amount = THREE.MathUtils.clamp(2.2 - (zoom - 1) * 0.5, 0.6, 2.2);
    for (const p of [this.tiltH, this.tiltV]) { p.uniforms.band.value = band; p.uniforms.amount.value = amount; }
    this.composer.render();
  }

  setSky(sky: Sky) {
    // At night the lights carry the scene; the occlusion eases off so it isn't muddy.
    this.ao.blendIntensity = sky === 'night' ? 0.55 : 0.85;
  }

  dispose() {
    this.composer.dispose();
    this.ao.dispose();
  }
}

// ---------- The sea ----------

const SEA: Record<Sky, { deep: string; shallow: string }> = {
  day: { deep: '#3f9fcf', shallow: '#7fd3e8' },
  dawn: { deep: '#6f8fc0', shallow: '#e9b4a8' },
  dusk: { deep: '#4b4a8f', shallow: '#b98aa9' },
  night: { deep: '#141a3a', shallow: '#263063' },
};

export interface Sea {
  group: THREE.Group;
  setSky(sky: Sky): void;
  tick(t: number): void;
}

/**
 * The sea the islands sit in: the city, the Strip and the Sprout Field are islands
 * with sandy shores, and gentle waves catch the sun. Deeper color out at the edges,
 * lighter near the land.
 */
export function buildSea(shores: { x0: number; z0: number; x1: number; z1: number }[], level = -1.35): Sea {
  const group = new THREE.Group();
  const size = 1600;
  const uniforms = {
    time: { value: 0 },
    deep: { value: new THREE.Color(SEA.day.deep) },
    shallow: { value: new THREE.Color(SEA.day.shallow) },
  };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.05 }));
  const m = water.material as THREE.MeshStandardMaterial;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.time = uniforms.time;
    shader.uniforms.deep = uniforms.deep;
    shader.uniforms.shallow = uniforms.shallow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSeaPos;\nuniform float time;\nuniform vec3 deep;\nuniform vec3 shallow;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float far = smoothstep(60.0, 260.0, length(vSeaPos.xz));
        diffuseColor.rgb = mix(shallow, deep, far);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 p = vSeaPos.xz;
        float wx = sin(p.x * 0.35 + time * 1.1) * 0.5 + sin(p.x * 0.9 + p.y * 0.4 + time * 1.7) * 0.25;
        float wz = cos(p.y * 0.3 + time * 0.9) * 0.5 + cos(p.y * 0.85 - p.x * 0.35 + time * 1.4) * 0.25;
        normal = normalize(normal + (viewMatrix * vec4(wx * 0.09, 0.0, wz * 0.09, 0.0)).xyz);`);
  };
  water.rotation.x = -Math.PI / 2;
  water.position.y = level;
  water.receiveShadow = true;
  group.add(water);

  // A sandy shore around each island, and a ring of foam where it meets the water.
  const sand = new THREE.MeshStandardMaterial({ color: '#ead9b0', roughness: 1 });
  const foam = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 });
  const foams: THREE.Mesh[] = [];
  for (const r of shores) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const shore = new THREE.Mesh(new THREE.BoxGeometry(w + 7, 0.6, d + 7), sand);
    shore.position.set(cx, level - 0.12, cz);
    shore.receiveShadow = true;
    group.add(shore);
    const ring = new THREE.Mesh(new THREE.BoxGeometry(w + 9, 0.05, d + 9), foam);
    ring.position.set(cx, level + 0.02, cz);
    group.add(ring);
    foams.push(ring);
  }

  return {
    group,
    setSky(sky) {
      uniforms.deep.value.set(SEA[sky].deep);
      uniforms.shallow.value.set(SEA[sky].shallow);
      foam.opacity = sky === 'night' ? 0.18 : 0.55;
    },
    tick(t) {
      uniforms.time.value = t;
      // The foam breathes in and out with the waves.
      const s = 1 + Math.sin(t * 0.8) * 0.004;
      for (const f of foams) f.scale.set(s, 1, s);
    },
  };
}

export function seaColor(sky: Sky) { return SEA[sky].deep; }
