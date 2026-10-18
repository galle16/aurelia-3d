import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const rnd = (a, b) => a + Math.random() * (b - a);

// Materiales compartidos
export const MAT = {
  polished: new THREE.MeshStandardMaterial({ color: '#f5c66c', metalness: 1, roughness: 0.17 }),
  brushed: new THREE.MeshStandardMaterial({ color: '#e9b95f', metalness: 1, roughness: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: '#d4d7dc', metalness: 1, roughness: 0.22 }),
  plate: new THREE.MeshStandardMaterial({ color: '#9a9ea6', metalness: 1, roughness: 0.38 }),
  jewel: new THREE.MeshStandardMaterial({ color: '#d0103a', metalness: 0.1, roughness: 0.15, emissive: '#3a0010' }),
  glass: new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: 0, transparent: true, opacity: 0.05,
    clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 0.8, depthWrite: false,
  }),
};

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}

function dialTexture({ dial, ink }) {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const c = S / 2;

  const grad = g.createRadialGradient(c * 0.85, c * 0.8, 20, c, c, c);
  grad.addColorStop(0, shade(dial, 0.12));
  grad.addColorStop(0.6, dial);
  grad.addColorStop(1, shade(dial, -0.22));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  // Rayos de sol
  g.save();
  g.translate(c, c);
  for (let i = 0; i < 360; i++) {
    g.rotate((Math.PI * 2) / 360);
    g.globalAlpha = 0.035 + 0.04 * Math.abs(Math.sin(i * 0.035));
    g.fillStyle = i % 2 ? '#ffffff' : '#000000';
    g.fillRect(-1.5, 0, 3, c);
  }
  g.restore();
  g.globalAlpha = 1;

  // Pista de minutos
  g.strokeStyle = ink;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    g.lineWidth = i % 5 ? 2 : 4;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * (c - 18), c + Math.sin(a) * (c - 18));
    g.lineTo(c + Math.cos(a) * (c - (i % 5 ? 34 : 44)), c + Math.sin(a) * (c - (i % 5 ? 34 : 44)));
    g.stroke();
  }

  // Textos (marca ficticia)
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.font = '600 50px "Cormorant Garamond", Georgia, serif';
  g.fillText('AURELIA', c, c - 168);
  g.font = '500 19px Inter, Arial, sans-serif';
  g.fillText('PERPETUAL  ·  DATE', c, c - 136);
  g.fillText('AUTOMATIC CHRONOMETER', c, c + 196);
  g.font = '500 15px Inter, Arial, sans-serif';
  g.fillText('CERTIFIED  ·  GENÈVE', c, c + 222);

  // Ventana de fecha (3 en punto)
  const wx = c + (0.62 / 0.86) * c;
  g.fillStyle = '#f7f4ec';
  g.fillRect(wx - 46, c - 36, 92, 72);
  g.fillStyle = '#111';
  g.font = '700 58px Inter, Arial, sans-serif';
  g.fillText('18', wx, c + 21);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function gearGeometry(r, teeth, thick, spokes = 4) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = i % 4;
    const rad = k === 1 || k === 2 ? r : r * 0.88;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  const hub = new THREE.Path();
  hub.absarc(0, 0, r * 0.12, 0, Math.PI * 2, true);
  s.holes.push(hub);
  if (r > 0.18) {
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * Math.PI * 2 + 0.25;
      const a1 = a0 + (Math.PI * 2) / spokes - 0.5;
      const w = new THREE.Path();
      w.absarc(0, 0, r * 0.72, a0, a1, false);
      w.absarc(0, 0, r * 0.26, a1, a0, true);
      s.holes.push(w);
    }
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
  geo.translate(0, 0, -thick / 2);
  return geo;
}

// Lathe alrededor de Y → girado para mirar a +Z
function latheZ(points, segments, displace) {
  const geo = new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), segments);
  if (displace) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      const phi = Math.atan2(x, z);
      const [nr, ny] = displace(r, y, phi);
      const k = r > 1e-5 ? nr / r : 1;
      p.setXYZ(i, x * k, ny, z * k);
    }
  }
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Reloj procedural estilo "Datejust" (sin marcas registradas).
 * Mira hacia +Z y la pulsera recorre el eje Y curvándose hacia atrás.
 * opts.links = eslabones por lado, opts.curve = radio de curvatura de la pulsera.
 */
export function createWatch({ dial = '#cfae6a', ink = '#5a4114', links = 10, curve = 5 } = {}) {
  const root = new THREE.Group();
  const parts = [];
  const spinners = [];
  const hands = {};
  const lume = new THREE.MeshStandardMaterial({
    color: '#dffff3', emissive: '#6dffc8', emissiveIntensity: 0.6, roughness: 0.4,
  });

  const addPart = (obj, away, awayRot) => {
    root.add(obj);
    parts.push({
      obj,
      home: obj.position.clone(),
      homeRot: obj.rotation.clone(),
      away,
      awayRot: awayRot || new THREE.Vector3(rnd(-1.5, 1.5), rnd(-1.5, 1.5), rnd(-1.5, 1.5)),
    });
    return obj;
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };

  // ── Caja ─────────────────────────────────────────────
  const caseG = new THREE.Group();
  caseG.add(
    mesh(
      latheZ(
        [[0, -0.2], [0.86, -0.2], [0.86, 0.13], [0.98, 0.14], [1.03, 0.12],
         [1.05, 0.02], [1.04, -0.12], [1.0, -0.24], [0.92, -0.3], [0.8, -0.32]],
        128
      ),
      MAT.polished
    )
  );
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const lug = mesh(new RoundedBoxGeometry(0.28, 0.55, 0.3, 4, 0.1), MAT.polished, sx * 0.5, sy * 0.98, -0.07);
      lug.rotation.z = sx * sy * -0.08;
      caseG.add(lug);
    }
  for (const sy of [-1, 1]) caseG.add(mesh(new RoundedBoxGeometry(0.98, 0.22, 0.22, 3, 0.07), MAT.brushed, 0, sy * 1.14, -0.09));
  // guardacorona
  caseG.add(mesh(new RoundedBoxGeometry(0.12, 0.4, 0.24, 3, 0.05), MAT.polished, 1.06, 0, -0.04));
  addPart(caseG, new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0.15, 0.35, 0.05));

  // ── Bisel acanalado ──────────────────────────────────
  const FLUTES = 48;
  const bezelGeo = latheZ(
    [[0.84, 0.13], [0.85, 0.19], [0.88, 0.25], [0.93, 0.285], [0.99, 0.28], [1.04, 0.24], [1.065, 0.18], [1.06, 0.13]],
    FLUTES * 10,
    (r, h, phi) => {
      let t = ((phi / (Math.PI * 2)) * FLUTES) % 1;
      if (t < 0) t += 1;
      const f = 1 - Math.abs(2 * t - 1); // diente de sierra → aristas
      const w = Math.max(0, Math.min(1, (r - 0.87) / 0.08)) * (h > 0.15 ? 1 : 0.3);
      return [r + 0.018 * f * w, h + 0.035 * f * w];
    }
  );
  const bezel = mesh(bezelGeo, MAT.polished, 0, 0, 0);
  addPart(bezel, new THREE.Vector3(-0.3, 0.5, 2.4), new THREE.Vector3(0.6, -0.5, 1.2));

  // ── Cristal + lupa ───────────────────────────────────
  const crystal = new THREE.Group();
  crystal.add(mesh(new THREE.CylinderGeometry(0.87, 0.87, 0.04, 64).rotateX(Math.PI / 2), MAT.glass, 0, 0, 0));
  crystal.add(mesh(new RoundedBoxGeometry(0.3, 0.26, 0.07, 4, 0.03), MAT.glass, 0.62, 0, 0.04));
  crystal.position.z = 0.24;
  crystal.renderOrder = 2;
  addPart(crystal, new THREE.Vector3(-1.1, 1.0, 3.6), new THREE.Vector3(0.7, 0.5, 0.4));

  // ── Esfera + índices ─────────────────────────────────
  const dialG = new THREE.Group();
  dialG.add(
    mesh(
      new THREE.CircleGeometry(0.86, 96),
      new THREE.MeshStandardMaterial({ map: dialTexture({ dial, ink }), metalness: 0.55, roughness: 0.32 })
    )
  );
  const idxGeo = new RoundedBoxGeometry(0.075, 0.2, 0.035, 2, 0.012);
  const lumeGeo = new THREE.BoxGeometry(0.036, 0.15, 0.012);
  for (let i = 0; i < 12; i++) {
    if (i === 3) continue; // ventana de fecha
    const a = (i / 12) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.position.set(Math.sin(a) * 0.68, Math.cos(a) * 0.68, 0.018);
    holder.rotation.z = -a;
    const offs = i === 0 ? [-0.05, 0.05] : [0];
    for (const o of offs) {
      holder.add(mesh(idxGeo, MAT.polished, o, 0, 0));
      holder.add(mesh(lumeGeo, lume, o, 0, 0.018));
    }
    dialG.add(holder);
  }
  // marco de la ventana de fecha
  const frame = mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 4), MAT.polished, 0.62, 0, 0.01);
  frame.rotation.z = Math.PI / 4;
  frame.scale.set(1.15, 0.92, 1);
  dialG.add(frame);
  dialG.position.z = 0.07;
  addPart(dialG, new THREE.Vector3(1.9, -1.3, 1.8), new THREE.Vector3(0.5, 0.4, -0.8));

  // ── Agujas ───────────────────────────────────────────
  const handsG = new THREE.Group();
  const mkHand = (len, w, z, mat = MAT.polished, withLume = true) => {
    const piv = new THREE.Group();
    piv.position.z = z;
    piv.add(mesh(new RoundedBoxGeometry(w, len, 0.022, 2, w * 0.3), mat, 0, len * 0.42, 0));
    if (withLume) piv.add(mesh(new THREE.BoxGeometry(w * 0.45, len * 0.6, 0.01), lume, 0, len * 0.5, 0.013));
    handsG.add(piv);
    return piv;
  };
  hands.h = mkHand(0.46, 0.075, 0);
  hands.m = mkHand(0.72, 0.058, 0.025);
  hands.s = mkHand(0.84, 0.016, 0.05, MAT.steel, false);
  hands.s.add(mesh(new THREE.CircleGeometry(0.035, 20), lume, 0, 0.56, 0.013));
  handsG.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 24).rotateX(Math.PI / 2), MAT.polished, 0, 0, 0.04));
  handsG.position.z = 0.12;
  addPart(handsG, new THREE.Vector3(-1.4, 1.6, 2.8), new THREE.Vector3(0.6, 0.3, 1.6));

  // ── Corona ───────────────────────────────────────────
  const crown = new THREE.Group();
  crown.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 24, 1).rotateZ(Math.PI / 2), MAT.polished));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    crown.add(mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), MAT.polished, 0, Math.cos(a) * 0.13, Math.sin(a) * 0.13));
  }
  crown.position.set(1.2, 0, -0.04);
  addPart(crown, new THREE.Vector3(3.2, 0.5, 0.6), new THREE.Vector3(2, 0.3, 0.2));

  // ── Mecanismo (queda visible al salir la esfera) ─────
  const plate = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.04, 64).rotateX(Math.PI / 2), MAT.plate, 0, 0, -0.06);
  addPart(plate, new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0, 0, 0.2));

  const gearDefs = [
    [0, 0, 0.36, 22, 0.5, MAT.polished], [0.46, 0.3, 0.26, 16, -0.8, MAT.brushed],
    [-0.42, 0.34, 0.3, 18, -0.6, MAT.steel], [-0.3, -0.44, 0.22, 14, 1.1, MAT.polished],
    [0.42, -0.4, 0.3, 18, 0.7, MAT.steel], [0.05, 0.6, 0.16, 12, 1.6, MAT.polished],
    [-0.62, -0.06, 0.15, 10, -1.8, MAT.brushed], [0.66, -0.02, 0.14, 10, 2, MAT.polished],
  ];
  gearDefs.forEach(([x, y, r, t, sp, mat], i) => {
    const holder = new THREE.Group();
    const g = mesh(gearGeometry(r, t, 0.035), mat);
    holder.add(g);
    holder.add(mesh(new THREE.SphereGeometry(Math.max(0.025, r * 0.1), 16, 12), MAT.jewel, 0, 0, 0.03));
    holder.position.set(x, y, -0.01 + (i % 3) * 0.018);
    spinners.push({ obj: g, speed: sp });
    addPart(holder, new THREE.Vector3(x * 1.6 + rnd(-0.3, 0.3), y * 1.6 + rnd(-0.3, 0.3), rnd(0.6, 1.6)));
  });
  // volante
  const balance = new THREE.Group();
  balance.add(mesh(new THREE.TorusGeometry(0.17, 0.02, 10, 48), MAT.polished));
  balance.add(mesh(new THREE.BoxGeometry(0.34, 0.025, 0.02), MAT.polished));
  balance.add(mesh(new THREE.BoxGeometry(0.025, 0.34, 0.02), MAT.polished));
  const balHolder = new THREE.Group();
  balHolder.add(balance);
  balHolder.position.set(-0.05, -0.62, 0.02);
  hands.balance = balance;
  addPart(balHolder, new THREE.Vector3(-0.4, -1.4, 1.2));
  // puentes
  for (const [x, y, w, rz] of [[0.25, 0.15, 0.9, 0.5], [-0.3, -0.25, 0.7, -0.7]]) {
    const b = mesh(new RoundedBoxGeometry(w, 0.13, 0.03, 2, 0.03), MAT.plate, x, y, 0.04);
    b.rotation.z = rz;
    addPart(b, new THREE.Vector3(x * 2, y * 2, 1.0));
  }

  // ── Fondo de caja + rotor ────────────────────────────
  const back = mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.06, 64).rotateX(Math.PI / 2), MAT.brushed, 0, 0, -0.35);
  addPart(back, new THREE.Vector3(0.4, -0.4, -3.2), new THREE.Vector3(0.6, -0.4, 0.3));
  const rotorShape = new THREE.Shape();
  rotorShape.absarc(0, 0, 0.8, Math.PI, Math.PI * 2, false);
  rotorShape.absarc(0, 0, 0.18, Math.PI * 2, Math.PI, true);
  const rotor = mesh(new THREE.ExtrudeGeometry(rotorShape, { depth: 0.03, bevelEnabled: false }), MAT.polished, 0, 0, -0.17);
  addPart(rotor, new THREE.Vector3(-0.8, -0.6, -2.0), new THREE.Vector3(0.3, 0.8, 2.5));

  // ── Pulsera Oyster de 3 eslabones ─────────────────────
  const L = 0.34;
  const centerGeo = (k) => new RoundedBoxGeometry(0.34 * k, L, 0.2, 3, 0.06);
  const sideGeo = (k) => new RoundedBoxGeometry(0.3 * k, L, 0.23, 3, 0.07);
  for (const dir of [1, -1]) {
    let chunk = null;
    for (let i = 0; i < links; i++) {
      if (i % 3 === 0) {
        chunk = new THREE.Group();
        chunk.userData.side = Math.random() < 0.5 ? -1 : 1;
      }
      const k = 1 - (i / Math.max(1, links - 1)) * 0.16;
      const link = new THREE.Group();
      link.add(mesh(centerGeo(k), MAT.polished));
      for (const s of [-1, 1]) link.add(mesh(sideGeo(k), MAT.brushed, s * (0.17 * k + 0.15 * k + 0.012), 0, -0.01));
      const sArc = (i + 0.5) * (L + 0.02);
      const th = sArc / curve;
      link.position.set(0, dir * (1.27 + curve * Math.sin(th)), -0.09 - curve * (1 - Math.cos(th)));
      link.rotation.x = -dir * th;
      chunk.add(link);
      if (i % 3 === 2 || i === links - 1) {
        // centrar el grupo en su contenido para que gire sobre sí mismo
        const box = new THREE.Box3().setFromObject(chunk);
        const c = box.getCenter(new THREE.Vector3());
        chunk.children.forEach((ch) => ch.position.sub(c));
        chunk.position.copy(c);
        const side = chunk.userData.side;
        addPart(
          chunk,
          new THREE.Vector3(side * rnd(2.4, 3.6), dir * rnd(0.2, 1.4) - c.y * 0.25, rnd(-0.5, 1.8)),
          new THREE.Vector3(rnd(-1, 1), rnd(-0.8, 0.8), side * rnd(0.4, 1.2))
        );
      }
    }
  }

  // ── API ──────────────────────────────────────────────
  const tmp = new THREE.Vector3();
  function setExplode(e) {
    for (const p of parts) {
      p.obj.position.copy(p.home).add(tmp.copy(p.away).multiplyScalar(e));
      p.obj.rotation.set(
        p.homeRot.x + p.awayRot.x * e,
        p.homeRot.y + p.awayRot.y * e,
        p.homeRot.z + p.awayRot.z * e
      );
    }
  }

  function tick(dt, now) {
    const d = new Date(now);
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    hands.s.rotation.z = -(s / 60) * Math.PI * 2;
    hands.m.rotation.z = -(m / 60) * Math.PI * 2;
    hands.h.rotation.z = -(h / 12) * Math.PI * 2;
    hands.balance.rotation.z = Math.sin(now * 0.025) * 1.4;
    for (const sp of spinners) sp.obj.rotation.z += dt * sp.speed;
  }

  function setGlow(g) {
    lume.emissiveIntensity = g;
  }

  return { root, setExplode, tick, setGlow };
}
