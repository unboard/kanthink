// Snowpath — GLB asset loading (models authored in Blender, see blender/snowpath_assets.py)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const ASSET_NAMES = [
  'plow', 'blower', 'car', 'house_a', 'house_b', 'house_c',
  'store', 'school', 'tree', 'lamp', 'player', 'kid_a', 'kid_b', 'kid_c', 'snowman',
] as const;

export type AssetName = typeof ASSET_NAMES[number];

export type AssetLib = Record<AssetName, THREE.Group>;

export async function loadAssets(onProgress?: (frac: number) => void): Promise<AssetLib> {
  const loader = new GLTFLoader();
  let done = 0;
  const lib = {} as AssetLib;
  await Promise.all(ASSET_NAMES.map(async (name) => {
    const gltf = await loader.loadAsync(`/snowpath/${name}.glb`);
    const g = gltf.scene;
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    lib[name] = g;
    done++;
    onProgress?.(done / ASSET_NAMES.length);
  }));
  return lib;
}

// Clone an asset; optionally recolor the material named `matName` (e.g. car paint).
export function spawn(lib: AssetLib, name: AssetName, recolor?: { matName: string; color: THREE.Color }): THREE.Group {
  const g = lib[name].clone(true);
  if (recolor) {
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m, i) => {
          if (m.name === recolor.matName) {
            const c = (m as THREE.MeshStandardMaterial).clone();
            c.color.copy(recolor.color);
            if (Array.isArray(mesh.material)) mesh.material[i] = c;
            else mesh.material = c;
          }
        });
      }
    });
  }
  return g;
}
