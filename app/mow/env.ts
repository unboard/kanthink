// Clean Cut — sky, sun and time of day.

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export class Environment {
  readonly sky: Sky;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDir = new THREE.Vector3();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private skyScene = new THREE.Scene();
  private lastEnvMinute = -999;
  private shadowSize: number;
  private useEnvMap: boolean;

  /** `envMap: false` skips the baked sky reflection: some phone GPUs bake it full of NaNs, which paints every lit surface black. */
  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, shadowMap: number, envMap = true) {
    this.shadowSize = shadowMap;
    this.useEnvMap = envMap;
    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.sun = new THREE.DirectionalLight('#fff3df', 3.2);
    this.sun.castShadow = shadowMap > 0;
    if (shadowMap > 0) {
      this.sun.shadow.mapSize.set(shadowMap, shadowMap);
      const c = this.sun.shadow.camera;
      c.left = -38;
      c.right = 38;
      c.top = 38;
      c.bottom = -38;
      c.near = 1;
      c.far = 220;
      this.sun.shadow.bias = -0.00025;
      this.sun.shadow.normalBias = 0.035;
      this.sun.shadow.radius = 3;
    }
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#bcd4ff', '#4a5a2a', 0.55);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog('#c9d8e6', 90, 420);
  }

  /** minute = minutes since midnight. */
  setTime(minute: number, focus: THREE.Vector3) {
    // sun arc: rises in the east (+X), peaks a bit after 1pm, sets west; south-ish (+Z) bias
    const t = (minute - 6 * 60) / (14.5 * 60); // 06:00 → 20:30
    const elev = Math.max(0.02, Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * 1.02);
    const az = Math.PI * (0.15 + 0.7 * t);
    this.sunDir.set(Math.cos(az), Math.sin(elev), Math.sin(az) * 0.55 + 0.35).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    const low = 1 - Math.min(1, Math.max(0, (this.sunDir.y - 0.05) / 0.45));
    const warm = new THREE.Color('#fff4e2').lerp(new THREE.Color('#ffb36b'), low * 0.85);
    this.sun.color.copy(warm);
    this.sun.intensity = 2.0 + 1.6 * (1 - low);
    // without the baked sky light, the hemisphere carries the fill on its own
    this.hemi.intensity = (0.22 + 0.12 * (1 - low)) * (this.useEnvMap ? 1 : 1.9);
    this.hemi.color.set('#bcd4ff').lerp(new THREE.Color('#ffd2a8'), low * 0.5);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set('#cfdde9').lerp(new THREE.Color('#f0c9a0'), low * 0.6);
    this.sky.material.uniforms.turbidity.value = 3.5 + low * 5;

    // shadow camera follows the action, snapped to texels to stop shimmering
    const span = 76;
    const texel = span / Math.max(1, this.shadowSize);
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 110, this.sunDir.y * 110, fz + this.sunDir.z * 110);
    this.sun.target.updateMatrixWorld();

    if (this.useEnvMap && Math.abs(minute - this.lastEnvMinute) > 20) {
      this.lastEnvMinute = minute;
      this.bakeEnv();
    }
  }

  private bakeEnv() {
    const sky = this.sky;
    this.scene.remove(sky);
    this.skyScene.add(sky);
    const rt = this.pmrem.fromScene(this.skyScene, 0, 1, 5000);
    this.skyScene.remove(sky);
    this.scene.add(sky);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.2;
  }

  dispose() {
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}
