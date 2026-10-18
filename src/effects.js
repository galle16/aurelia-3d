import * as THREE from 'three';
import { MAT } from './watch.js';

const rnd = (a, b) => a + Math.random() * (b - a);

function glowTexture(stops, w = 128, h = 128, horizontal = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const gr = horizontal
    ? g.createLinearGradient(0, 0, w, 0)
    : g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  if (horizontal) {
    // atenuar arriba y abajo
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(0,0,0,1)');
    v.addColorStop(0.5, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const additive = (map, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });

/** Esquirlas doradas que salen despedidas con la explosión. */
export function createShards(count = 520) {
  const geo = new THREE.TetrahedronGeometry(1, 0);
  geo.scale(1, 0.55, 0.14);
  const mesh = new THREE.InstancedMesh(geo, MAT.polished, count);
  mesh.frustumCulled = false;
  const data = [];
  for (let i = 0; i < count; i++) {
    const head = Math.random() < 0.75;
    const o = head
      ? new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-0.3, 0.3))
      : new THREE.Vector3(rnd(-0.5, 0.5), rnd(-4, 4), rnd(-0.6, 0));
    const d = new THREE.Vector3(o.x + rnd(-0.6, 0.6), o.y * (head ? 1 : 0.2) + rnd(-0.6, 0.6), rnd(-0.4, 1.2))
      .normalize()
      .multiplyScalar(rnd(2.5, 8));
    data.push({
      o, d,
      s: rnd(0.025, 0.11) * (Math.random() < 0.08 ? 2.2 : 1),
      axis: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(),
      spin: rnd(2, 9),
      delay: rnd(0, 0.25),
    });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  function update(e, time) {
    for (let i = 0; i < count; i++) {
      const it = data[i];
      const k = Math.max(0, Math.min(1, (e - it.delay) / (1 - it.delay)));
      const ek = 1 - Math.pow(1 - k, 3); // salida rápida
      p.copy(it.o).addScaledVector(it.d, ek);
      q.setFromAxisAngle(it.axis, it.spin * ek + time * 0.4 * k);
      const sc = it.s * Math.min(1, k * 6);
      s.set(sc, sc, sc);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = e > 0.005;
  }
  return { mesh, update };
}

/** Chispas + polvo dorado (con bloom). */
export function createSparks(count = 1400) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const dir = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    base.set([rnd(-1, 1) * 0.9, rnd(-1, 1) * 0.9, rnd(-0.2, 0.3)], i * 3);
    const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-0.3, 1)).normalize().multiplyScalar(rnd(1.5, 9));
    dir.set([v.x, v.y, v.z], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.07,
    map: glowTexture([[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,205,110,.8)'], [1, 'rgba(255,170,50,0)']], 64, 64),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  mat.color.setScalar(6);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  function update(e, time) {
    const ek = 1 - Math.pow(1 - Math.min(1, e), 2.2);
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      const w = Math.sin(time * 1.3 + i) * 0.04;
      pos[k] = base[k] + dir[k] * ek + w;
      pos[k + 1] = base[k + 1] + dir[k + 1] * ek + Math.cos(time + i * 0.7) * 0.04 - ek * ek * 0.6;
      pos[k + 2] = base[k + 2] + dir[k + 2] * ek;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = Math.min(1, e * 4) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, e)));
    points.visible = mat.opacity > 0.01;
  }
  return { points, update };
}

/** Haz de luz diagonal + halo detrás del reloj. */
export function createStreak() {
  const group = new THREE.Group();
  const lineTex = glowTexture(
    [[0, 'rgba(255,220,160,0)'], [0.42, 'rgba(255,225,170,.35)'], [0.5, 'rgba(255,250,235,1)'], [0.58, 'rgba(255,225,170,.35)'], [1, 'rgba(255,220,160,0)']],
    512, 32, true
  );
  const line = new THREE.Mesh(new THREE.PlaneGeometry(46, 0.07), additive(lineTex, 1));
  line.material.color.setScalar(5);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(46, 1.2), additive(lineTex, 0.2));
  const haloTex = glowTexture([[0, 'rgba(255,214,140,.22)'], [0.45, 'rgba(160,110,40,.07)'], [1, 'rgba(0,0,0,0)']], 256, 256);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), additive(haloTex, 1));
  halo.position.z = -0.5;
  const beams = new THREE.Group();
  beams.add(line, glow);
  beams.rotation.z = 0.36;
  group.add(beams, halo);
  group.position.z = -2.5;
  function update(o, time) {
    line.material.opacity = o * (0.85 + 0.15 * Math.sin(time * 2));
    glow.material.opacity = o * 0.2;
    halo.material.opacity = 0.5 + o * 0.5;
    beams.position.x = Math.sin(time * 0.25) * 0.6;
    group.visible = o > 0.001 || halo.material.opacity > 0.01;
  }
  return { group, update, halo };
}
