import * as THREE from 'three';
import type { Weather } from '@/lib/kan/zoo/sim';
import type { ZooWorld } from './world';
import { BOUNDARY, inside, toPx } from '@/lib/kan/zoo/map';

/**
 * The zoo's sky and air: the sun across the day, then the moon and the stars;
 * fireflies over the grass at night; birds by day and bats by night; fog, rain,
 * snow, and lightning in a storm. All of it follows the zoo's own clock.
 */

const DAY_TOP = new THREE.Color('#4f86d9'), DAY_HORIZON = new THREE.Color('#bfe0ff');
const DUSK_TOP = new THREE.Color('#3b3f8f'), DUSK_HORIZON = new THREE.Color('#ff9a5a');
const NIGHT_TOP = new THREE.Color('#060a1e'), NIGHT_HORIZON = new THREE.Color('#1a2348');
const GRAY_TOP = new THREE.Color('#7d8794'), GRAY_HORIZON = new THREE.Color('#b9c0c8');

export class ZooSky {
  private skyMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private stars: THREE.Points;
  private moon: THREE.Mesh;
  private moonGlow: THREE.Sprite;
  readonly sun = new THREE.DirectionalLight('#fff1d6', 1.5);
  readonly hemi = new THREE.HemisphereLight('#cfe3ff', '#5a6a3a', 0.9);
  private flies: THREE.Points;
  private fliesMat: THREE.ShaderMaterial;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private snow: THREE.Points;
  private snowPos: Float32Array;
  private wings: THREE.InstancedMesh;
  private birds: { cx: number; cz: number; r: number; y: number; a: number; w: number; phase: number }[] = [];
  private bolt: THREE.Line;
  private flash = 0;
  private nextBolt = 2;
  /** 0 by day, 1 at midnight. */
  night = 0;
  private top = new THREE.Color();
  private horizon = new THREE.Color();
  private tmp = new THREE.Color();

  constructor(private scene: THREE.Scene, private world: ZooWorld) {
    scene.fog = new THREE.Fog('#bfe0ff', 160, 700);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(vP.y*1.5+0.1,0.,1.); gl_FragColor = vec4(mix(horizon, top, pow(h,0.65)),1.); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), this.skyMat);
    scene.add(this.sky);
    const sp: number[] = [];
    for (let i = 0; i < 1400; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.08 + Math.random() * 1.4;
      sp.push(Math.cos(a) * Math.cos(e) * 1300, Math.sin(e) * 1300, Math.sin(a) * Math.cos(e) * 1300);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 16), new THREE.MeshBasicMaterial({ color: '#f4f1e1', fog: false, transparent: true }));
    scene.add(this.moon);
    const glow = document.createElement('canvas');
    glow.width = glow.height = 128;
    const g = glow.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,250,220,0.55)');
    grd.addColorStop(1, 'rgba(255,250,220,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const gt = new THREE.CanvasTexture(glow);
    this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.moonGlow.scale.setScalar(260);
    scene.add(this.moonGlow);
    scene.add(this.sun, this.sun.target, this.hemi);

    // Fireflies: over the grass, never in the yards.
    const fp: number[] = [], phase: number[] = [];
    const { x0, x1, z0, z1 } = world.bounds;
    for (let i = 0; i < 6000; i++) {
      const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
      if (!inside(BOUNDARY, toPx(x, z)) || world.habitatAt(x, z) || world.waterAt(x, z) !== null) continue;
      fp.push(x, world.groundAt(x, z) + 0.4 + Math.random() * 2.2, z);
      phase.push(Math.random() * 100);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
    this.fliesMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { time: { value: 0 }, night: { value: 0 } },
      vertexShader: `attribute float phase; uniform float time; varying float vA;
        void main(){ vec3 p = position + vec3(sin(time*0.6+phase)*0.9, sin(time*0.9+phase*1.7)*0.35, cos(time*0.5+phase)*0.9);
          vec4 mv = modelViewMatrix * vec4(p,1.); gl_Position = projectionMatrix * mv;
          float blink = pow(max(0., sin(time*1.7 + phase*3.1)), 6.);
          vA = blink; gl_PointSize = (3. + blink*5.) * (60. / max(8., -mv.z)); }`,
      fragmentShader: `uniform float night; varying float vA;
        void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; float a = smoothstep(0.5,0.,d) * vA * night; gl_FragColor = vec4(0.85,1.,0.35,a); }`,
    });
    this.flies = new THREE.Points(fg, this.fliesMat);
    this.flies.frustumCulled = false;
    scene.add(this.flies);

    // Rain and snow in a box that follows the camera.
    const R = 1400;
    this.rainPos = new Float32Array(R * 6);
    for (let i = 0; i < R; i++) this.dropAt(i, true);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#a8c4e0', transparent: true, opacity: 0.55 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.snowPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) { this.snowPos[i * 3] = (Math.random() - 0.5) * 120; this.snowPos[i * 3 + 1] = Math.random() * 50; this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * 120; }
    const sng = new THREE.BufferGeometry();
    sng.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(sng, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.snow);

    // Birds circling by day, bats by night: two wings each, flapping.
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.25, 1.1, 0, -0.1], 3));
    wing.computeVertexNormals();
    const flocks = [[700, 300], [300, 450], [900, 600], [550, 150], [600, 720]];
    for (const [px, py] of flocks) {
      const c = { x: (px - 620) * 0.55, z: (py - 480) * 0.55 };
      for (let k = 0; k < 9; k++) this.birds.push({ cx: c.x, cz: c.z, r: 16 + Math.random() * 22, y: 22 + Math.random() * 18, a: Math.random() * 6.28, w: (0.18 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1), phase: Math.random() * 10 });
    }
    this.wings = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: '#2a2a33', side: THREE.DoubleSide }), this.birds.length * 2);
    this.wings.frustumCulled = false;
    scene.add(this.wings);

    this.bolt = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#f5f3ff', transparent: true, opacity: 0, fog: false }));
    this.bolt.frustumCulled = false;
    scene.add(this.bolt);
  }

  private dropAt(i: number, anywhere: boolean) {
    const x = (Math.random() - 0.5) * 140, z = (Math.random() - 0.5) * 140, y = anywhere ? Math.random() * 60 : 60;
    const p = this.rainPos;
    p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.15; p[i * 6 + 4] = y - 1.2; p[i * 6 + 5] = z;
  }

  /** How dark it is at this hour: 0 noon … 1 midnight, with a slow dusk and dawn. */
  static darkness(hour: number) {
    if (hour >= 7 && hour < 18.5) return 0;
    if (hour >= 18.5 && hour < 21) return (hour - 18.5) / 2.5;
    if (hour >= 5 && hour < 7) return 1 - (hour - 5) / 2;
    return 1;
  }

  update(dt: number, t: number, hour: number, weather: Weather, cam: THREE.Vector3) {
    const dark = ZooSky.darkness(hour);
    this.night = dark;
    // Dusk and dawn glow orange in the middle of the change.
    const dusk = Math.max(0, 1 - Math.abs(dark - 0.45) / 0.45) * (hour > 12 || hour < 7 ? 1 : 0);
    const gray = weather === 'rain' || weather === 'storm' ? 0.75 : weather === 'fog' ? 0.6 : weather === 'snow' ? 0.55 : weather === 'cloudy' ? 0.35 : 0;
    this.top.copy(DAY_TOP).lerp(GRAY_TOP, gray).lerp(DUSK_TOP, dusk * 0.8).lerp(NIGHT_TOP, Math.max(0, dark - dusk * 0.4));
    this.horizon.copy(DAY_HORIZON).lerp(GRAY_HORIZON, gray).lerp(DUSK_HORIZON, dusk * (1 - gray * 0.6)).lerp(NIGHT_HORIZON, Math.max(0, dark - dusk * 0.5));
    // Lightning lights it all up for a blink.
    if (weather === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt < 0) { this.flash = 1; this.nextBolt = 2 + Math.random() * 6; this.strike(cam); }
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const f = this.flash > 0.5 ? 1 : this.flash > 0.2 ? 0.3 : this.flash;
    this.top.lerp(this.tmp.set('#e8e6ff'), f * 0.7);
    this.horizon.lerp(this.tmp.set('#ffffff'), f * 0.7);
    (this.bolt.material as THREE.LineBasicMaterial).opacity = this.flash > 0.4 ? 1 : 0;
    this.skyMat.uniforms.top.value.copy(this.top);
    this.skyMat.uniforms.horizon.value.copy(this.horizon);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.horizon).lerp(this.top, 0.2);
    const near = weather === 'fog' ? 6 : weather === 'rain' || weather === 'storm' ? 40 : weather === 'snow' ? 30 : 160;
    const far = weather === 'fog' ? 95 : weather === 'rain' || weather === 'storm' ? 300 : weather === 'snow' ? 240 : 760;
    fog.near += (near - fog.near) * Math.min(1, dt * 0.8);
    fog.far += (far - fog.far) * Math.min(1, dt * 0.8);

    // The sun goes over, and the moon comes up behind it.
    const sunA = ((hour - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(sunA) * 0.8, Math.sin(sunA), 0.45).normalize();
    this.sun.position.copy(cam).addScaledVector(sunDir, 200);
    this.sun.target.position.copy(cam);
    this.sun.intensity = Math.max(0, 1.6 * (1 - dark) * (1 - gray * 0.55)) + f * 1.5;
    this.sun.color.set(dusk > 0.2 ? '#ffb27a' : '#fff1d6');
    this.hemi.intensity = 0.5 + (1 - dark) * 0.55 * (1 - gray * 0.25) + f * 1.2;
    this.hemi.color.set(dark > 0.6 ? '#6a7ab8' : '#cfe3ff');
    const moonA = ((hour - 18) / 12) * Math.PI;
    const moonDir = new THREE.Vector3(-Math.cos(moonA) * 0.7, Math.max(0.12, Math.sin(moonA)), -0.55).normalize();
    this.moon.position.copy(cam).addScaledVector(moonDir, 1100);
    this.moonGlow.position.copy(this.moon.position);
    const mo = Math.min(1, dark * 1.4) * (1 - gray * 0.7);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = mo;
    (this.moonGlow.material as THREE.SpriteMaterial).opacity = mo;
    this.moon.visible = mo > 0.02;
    this.moonGlow.visible = this.moon.visible;
    if (dark > 0.5) {
      // Moonlight is a cool, soft light from the moon's side.
      this.sun.position.copy(cam).addScaledVector(moonDir, 200);
      this.sun.color.set('#9fb4ff');
      this.sun.intensity = 0.55 * dark * (1 - gray * 0.6) + f * 1.5;
    }
    this.sky.position.copy(cam);
    this.stars.position.copy(cam);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, dark - 0.3) * (1 - gray);

    this.fliesMat.uniforms.time.value = t;
    this.fliesMat.uniforms.night.value = weather === 'rain' || weather === 'storm' || weather === 'snow' ? 0 : Math.max(0, dark - 0.35) * 1.4;
    this.flies.visible = dark > 0.35;

    // Rain or snow.
    const raining = weather === 'rain' || weather === 'storm';
    this.rain.visible = raining;
    if (raining) {
      const p = this.rainPos;
      const fall = (weather === 'storm' ? 55 : 40) * dt;
      for (let i = 0; i < p.length / 6; i++) {
        p[i * 6 + 1] -= fall; p[i * 6 + 4] -= fall;
        if (p[i * 6 + 1] < -2) this.dropAt(i, false);
      }
      this.rain.geometry.getAttribute('position').needsUpdate = true;
      this.rain.position.set(cam.x, cam.y - 30, cam.z);
    }
    this.snow.visible = weather === 'snow';
    if (this.snow.visible) {
      const p = this.snowPos;
      for (let i = 0; i < p.length / 3; i++) {
        p[i * 3 + 1] -= dt * 2.2;
        p[i * 3] += Math.sin(t + i) * dt * 0.6;
        if (p[i * 3 + 1] < -10) p[i * 3 + 1] = 45;
      }
      this.snow.geometry.getAttribute('position').needsUpdate = true;
      this.snow.position.set(cam.x, cam.y - 20, cam.z);
    }

    // Birds circle by day; at night they're bats, lower and jittery.
    const bats = dark > 0.6;
    (this.wings.material as THREE.MeshBasicMaterial).color.set(bats ? '#14101c' : '#2a2a33');
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    this.birds.forEach((b, i) => {
      b.a += b.w * dt * (bats ? 2.2 : 1);
      const jitter = bats ? Math.sin(t * 7 + b.phase) * 2 : 0;
      const r = bats ? b.r * 0.5 : b.r;
      const x = b.cx + Math.cos(b.a) * r + jitter, z = b.cz + Math.sin(b.a) * r, y = (bats ? 9 : b.y) + Math.sin(t * 0.7 + b.phase) * 2;
      const heading = Math.atan2(-Math.sin(b.a) * Math.sign(b.w), Math.cos(b.a) * Math.sign(b.w));
      const flap = Math.sin(t * (bats ? 18 : 9) + b.phase) * 0.7;
      const scale = bats ? 0.6 : 1;
      for (const side of [1, -1]) {
        e.set(0, heading, side * flap);
        q.setFromEuler(e);
        s.set(side * scale, scale, scale);
        m.compose(v.set(x, y, z), q, s);
        this.wings.setMatrixAt(i * 2 + (side > 0 ? 0 : 1), m);
      }
    });
    this.wings.instanceMatrix.needsUpdate = true;
    this.wings.visible = weather !== 'storm';
  }

  private strike(cam: THREE.Vector3) {
    const pts: THREE.Vector3[] = [];
    const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 200;
    let x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d, y = 160;
    while (y > 0) { pts.push(new THREE.Vector3(x, y, z)); y -= 12 + Math.random() * 14; x += (Math.random() - 0.5) * 18; z += (Math.random() - 0.5) * 18; }
    pts.push(new THREE.Vector3(x, this.world.groundAt(x, z), z));
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }

  /** A blink of lightning right now (for the storm's arrival). */
  thunder() { this.flash = 1; this.nextBolt = 0.5; }

  dispose() {
    for (const o of [this.sky, this.stars, this.moon, this.flies, this.rain, this.snow, this.wings, this.bolt]) (o as THREE.Mesh).geometry.dispose();
  }
}
