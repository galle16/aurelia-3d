import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createWatch, MAT } from './watch.js';

const velvet = new THREE.MeshPhysicalMaterial({
  color: '#0b0a0c', roughness: 1, metalness: 0, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color('#4a4048'),
});
const lacquer = new THREE.MeshPhysicalMaterial({
  color: '#040404', roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08,
});

export const MODELS = [
  { name: 'Solstice', dial: '#eeebe2', ink: '#3d3424' },
  { name: 'Abyss', dial: '#6a6f78', ink: '#1a1c20' },
  { name: 'Meridian', dial: '#ece2c8', ink: '#4a3a1c' },
];

/** Estuche de terciopelo negro con 3 compartimentos y un reloj en cada uno. */
export function createShowcase() {
  const group = new THREE.Group();
  const W = 8.4;
  const H = 3.8;
  const slotX = [-2.72, 0, 2.72];

  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), velvet);
  back.position.z = -1.0;
  group.add(back);

  const bar = (w, h, d, x, y, z, mat = lacquer) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(w, h) * 0.3), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  // marco exterior lacado
  bar(W + 0.5, 0.36, 1.3, 0, H / 2 + 0.05, -0.4);
  bar(W + 0.5, 0.36, 1.3, 0, -H / 2 - 0.05, -0.4);
  bar(0.36, H + 0.5, 1.3, -W / 2 - 0.05, 0, -0.4);
  bar(0.36, H + 0.5, 1.3, W / 2 + 0.05, 0, -0.4);
  // filete dorado
  const trim = new THREE.MeshStandardMaterial({ color: '#c99a45', metalness: 1, roughness: 0.25 });
  bar(W + 0.2, 0.025, 0.025, 0, H / 2 - 0.13, 0.26, trim);
  bar(W + 0.2, 0.025, 0.025, 0, -H / 2 + 0.13, 0.26, trim);
  // separadores
  for (const x of [-1.36, 1.36]) bar(0.16, H - 0.1, 1.1, x, 0, -0.45);
  // suelo de cada compartimento
  bar(W, 0.1, 1.1, 0, -H / 2 + 0.22, -0.45, velvet);

  const watches = [];
  const lights = [];
  slotX.forEach((x, i) => {
    // cojín
    const cushion = new THREE.Mesh(new RoundedBoxGeometry(1.15, 1.35, 0.8, 6, 0.36), velvet);
    cushion.position.set(x, -0.05, -0.62);
    group.add(cushion);

    const w = createWatch({ ...MODELS[i], links: 5, curve: 0.95 });
    w.root.scale.setScalar(0.66);
    w.root.position.set(x, 0.05, -0.05);
    w.root.rotation.x = -0.08;
    w.setExplode(0);
    group.add(w.root);
    watches.push(w);

    // foco cenital por compartimento
    const spot = new THREE.SpotLight('#ffe2b0', 2, 7, 0.55, 0.6, 1.4);
    spot.position.set(x, 2.8, 0.9);
    spot.target.position.set(x, 0, -0.2);
    group.add(spot, spot.target);
    lights.push(spot);
  });

  function tick(dt, now, t) {
    watches.forEach((w, i) => {
      w.tick(dt, now);
      w.root.rotation.y = Math.sin(t * 0.6 + i * 1.9) * 0.18;
    });
  }

  return { group, watches, slotX, tick, lights };
}
