import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const CHRONO_START = Date.now();

// Variantes de la colección (marca ficticia, sin logos registrados)
export const VARIANTS = {
  solstice: { metal: 'steel', dial: '#f2f2ef', subdial: '#dcdddf', subRing: '#a5a8ae', ink: '#141414', subInk: '#141414', accent: '#c41e2a' },
  abyss: { metal: 'steel', dial: '#131415', subdial: '#d3d5d8', subRing: '#a1a5ab', ink: '#f1f1f1', subInk: '#141414', accent: '#e23a40' },
  meridian: { metal: 'gold', dial: '#d8c18d', subdial: '#1b1b1b', subRing: '#2c2c2c', ink: '#2a2214', subInk: '#ead9aa', accent: '#8f1d1d' },
};

// Las fuentes de Google tardan en llegar: las texturas se redibujan cuando están listas
const fontsReady = document.fonts
  ? Promise.all([
      document.fonts.load('600 40px "Cormorant Garamond"'),
      document.fonts.load('600 40px Inter'),
      document.fonts.load('500 40px Inter'),
    ]).catch(() => {})
  : Promise.resolve();

function canvasTexture(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  fontsReady.then(() => {
    g.clearRect(0, 0, size, size);
    draw(g, size);
    tex.needsUpdate = true;
  });
  return tex;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}

// ── Materiales ──────────────────────────────────────────
let _brushed;
function brushedRoughness() {
  if (_brushed) return _brushed;
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const col = new Float32Array(S);
  let v = 0;
  for (let x = 0; x < S; x++) {
    v = v * 0.55 + (Math.random() - 0.5) * 0.9;
    col[x] = v;
  }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = 96 + col[x] * 42 + (Math.random() - 0.5) * 8;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  _brushed = new THREE.CanvasTexture(cv);
  _brushed.wrapS = _brushed.wrapT = THREE.RepeatWrapping;
  _brushed.repeat.set(5, 1);
  return _brushed;
}

const METAL = {
  steel: { p: '#eef0f3', b: '#d9dce1' },
  gold: { p: '#f5c66c', b: '#e5b55b' },
};
const _mats = {};
export function metalMats(metal = 'steel') {
  if (_mats[metal]) return _mats[metal];
  const c = METAL[metal];
  return (_mats[metal] = {
    polished: new THREE.MeshPhysicalMaterial({ color: c.p, metalness: 1, roughness: 0.14, side: THREE.DoubleSide }),
    brushed: new THREE.MeshPhysicalMaterial({
      color: c.b, metalness: 1, roughness: 1, roughnessMap: brushedRoughness(), anisotropy: 0.55,
    }),
    semi: new THREE.MeshPhysicalMaterial({
      color: c.p, metalness: 1, roughness: 0.34, roughnessMap: brushedRoughness(), anisotropy: 0.2,
    }),
    satin: new THREE.MeshPhysicalMaterial({
      color: c.p, metalness: 1, roughness: 0.55, roughnessMap: brushedRoughness(), anisotropy: 0.35,
    }),
  });
}

export const MAT = {
  whiteGold: new THREE.MeshPhysicalMaterial({ color: '#f2f3f5', metalness: 1, roughness: 0.12 }),
  plate: new THREE.MeshStandardMaterial({ color: '#9a9ea6', metalness: 1, roughness: 0.38 }),
  jewel: new THREE.MeshStandardMaterial({ color: '#d0103a', metalness: 0.1, roughness: 0.15, emissive: '#3a0010' }),
  rehaut: new THREE.MeshStandardMaterial({ color: '#c9cbcf', metalness: 0.4, roughness: 0.45 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: 0, transparent: true, opacity: 0.05,
    clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 0.8, depthWrite: false,
  }),
  get shard() {
    return metalMats('steel').polished;
  },
};

// ── Texturas: esfera y bisel taquimétrico ──────────────
const RD = 0.86; // radio de la esfera

function drawDial(g, S, v) {
  const c = S / 2;
  const k = c / RD;
  const P = (x, y) => [c + x * k, c - y * k];
  const polar = (cx, cy, r, a) => [c + (cx + Math.sin(a) * r) * k, c - (cy + Math.cos(a) * r) * k];
  const line = (p0, p1, w) => {
    g.lineWidth = w * k;
    g.beginPath();
    g.moveTo(...p0);
    g.lineTo(...p1);
    g.stroke();
  };
  const circle = (x, y, r, fill) => {
    g.beginPath();
    g.arc(...P(x, y), r * k, 0, Math.PI * 2);
    fill ? g.fill() : g.stroke();
  };

  const grad = g.createRadialGradient(c * 0.8, c * 0.72, 0, c, c, c);
  grad.addColorStop(0, shade(v.dial, 0.05));
  grad.addColorStop(1, shade(v.dial, -0.07));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  // Pista de 1/5 de segundo
  g.strokeStyle = v.ink;
  for (let i = 0; i < 300; i++) {
    const a = (i / 300) * Math.PI * 2;
    const major = i % 5 === 0;
    line(polar(0, 0, major ? 0.795 : 0.815, a), polar(0, 0, 0.848, a), major ? 0.0055 : 0.0028);
  }
  g.lineWidth = 0.003 * k;
  circle(0, 0, 0.815, false);

  // Contadores: 9 = segundero, 3 = minutos, 6 = horas
  const R = 0.215;
  const subs = [
    { x: -0.38, y: 0, ticks: 60, major: 10, labels: [['20', 1 / 3], ['40', 2 / 3], ['60', 0]] },
    { x: 0.38, y: 0, ticks: 30, major: 5, labels: [['10', 1 / 3], ['20', 2 / 3], ['30', 0]] },
    { x: 0, y: -0.38, ticks: 12, major: 3, labels: [['3', 0.25], ['6', 0.5], ['9', 0.75], ['12', 0]] },
  ];
  const darkSub = new THREE.Color(v.subdial).getHSL({}).l < 0.4;
  for (const s of subs) {
    g.fillStyle = v.subRing;
    circle(s.x, s.y, R, true);
    g.fillStyle = v.subdial;
    circle(s.x, s.y, R * 0.79, true);
    g.strokeStyle = darkSub ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)';
    g.lineWidth = Math.max(1, 0.0016 * k);
    for (let rr = 0.012; rr < R * 0.79; rr += 0.0065) circle(s.x, s.y, rr, false);
    g.strokeStyle = v.subInk;
    for (let i = 0; i < s.ticks; i++) {
      const a = (i / s.ticks) * Math.PI * 2;
      const major = i % s.major === 0;
      line(polar(s.x, s.y, R * (major ? 0.8 : 0.87), a), polar(s.x, s.y, R * 0.97, a), major ? 0.005 : 0.0028);
    }
    g.fillStyle = v.subInk;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${0.042 * k}px Inter, Arial, sans-serif`;
    for (const [txt, f] of s.labels) {
      const a = f * Math.PI * 2;
      g.fillText(txt, ...polar(s.x, s.y, R * 0.56, a));
    }
  }

  // Textos
  g.fillStyle = v.ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = `${0.004 * k}px`;
  g.font = `600 ${0.075 * k}px "Cormorant Garamond", Georgia, serif`;
  g.fillText('AURELIA', ...P(0, 0.535));
  g.font = `500 ${0.029 * k}px Inter, Arial, sans-serif`;
  g.fillText('PERPETUAL', ...P(0, 0.455));
  g.fillText('AUTOMATIC CHRONOMETER', ...P(0, 0.413));
  g.fillText('CERTIFIED PRECISION', ...P(0, 0.371));
  g.font = `600 ${0.031 * k}px Inter, Arial, sans-serif`;
  g.fillText('CHRONOGRAPH', ...P(0, 0.325));
  g.fillStyle = v.accent;
  g.font = `600 ${0.036 * k}px Inter, Arial, sans-serif`;
  g.fillText('RACING', ...P(0, -0.112));
  g.fillStyle = v.ink;
  g.font = `500 ${0.02 * k}px Inter, Arial, sans-serif`;
  g.fillText('SWISS', ...P(-0.09, -0.775));
  g.fillText('MADE', ...P(0.09, -0.775));
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

const BR = 1.065; // radio exterior del bisel
const tachy = (v) => ((21600 / v) * Math.PI) / 180; // ángulo de la escala taquimétrica

function drawBezel(g, S) {
  const c = S / 2;
  const k = c / BR;
  const polar = (r, a) => [c + Math.sin(a) * r * k, c - Math.cos(a) * r * k];
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = g.fillStyle = '#111111';
  const tick = (a, long) => {
    g.lineWidth = (long ? 0.0065 : 0.0038) * k;
    g.beginPath();
    g.moveTo(...polar(0.878, a));
    g.lineTo(...polar(long ? 0.918 : 0.9, a));
    g.stroke();
  };
  for (let v = 60; v < 100; v++) tick(tachy(v), v % 5 === 0);
  for (let v = 100; v < 200; v += 2) tick(tachy(v), v % 10 === 0);
  for (let v = 200; v <= 400; v += 10) tick(tachy(v), v % 50 === 0 || v === 240);

  const upright = (a) => {
    const d = ((a * 180) / Math.PI) % 360;
    return d > 90 && d < 270 ? a + Math.PI : a;
  };
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${0.066 * k}px Inter, Arial, sans-serif`;
  for (const n of [400, 300, 240, 200, 180, 160, 150, 140, 130, 120, 110, 100, 90, 85, 80, 75, 70, 65, 60]) {
    const a = tachy(n);
    g.save();
    g.translate(...polar(0.985, a));
    g.rotate(upright(a));
    g.fillText(String(n), 0, 0);
    g.restore();
  }
  // "UNITS PER HOUR" curvado
  g.font = `600 ${0.04 * k}px Inter, Arial, sans-serif`;
  const label = 'UNITS PER HOUR';
  const a0 = (9 * Math.PI) / 180;
  const a1 = (47 * Math.PI) / 180;
  [...label].forEach((ch, i) => {
    const a = a0 + ((a1 - a0) * i) / (label.length - 1);
    g.save();
    g.translate(...polar(0.985, a));
    g.rotate(a);
    g.fillText(ch, 0, 0);
    g.restore();
  });
}

let _bezelTex;
const bezelTexture = () => (_bezelTex ||= canvasTexture(2048, drawBezel));

// ── Geometrías ─────────────────────────────────────────
function gearGeometry(r, teeth, thick, spokes = 4) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const q = i % 4;
    const rad = q === 1 || q === 2 ? r : r * 0.88;
    i ? s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : s.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
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
function latheZ(points, segments) {
  const geo = new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), segments);
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function bezelTopGeometry() {
  const geo = new THREE.RingGeometry(0.87, BR, 240, 3);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i));
    p.setZ(i, 0.275 - (r - 0.87) * 0.28);
  }
  geo.computeVertexNormals();
  return geo;
}

// Normales suaves para piezas pequeñas (toCreasedNormals cuantiza a 0.01, por eso se escala)
function smooth(geo, angle = Math.PI / 3) {
  geo.scale(100, 100, 100);
  const out = toCreasedNormals(geo, angle);
  out.scale(0.01, 0.01, 0.01);
  return out;
}

// Eslabón Jubilee tipo "barril": perfil redondeado (largo × alto) extruido a lo ancho
const JB = 0.01;
const PERM = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1); // (x,y,z) → (z,x,y)
function barrelLink(len, h, w, rTop, rBot = 0.018) {
  const L = len - 2 * JB;
  const H = h - 2 * JB;
  const rt = Math.min(rTop, L / 2 - 0.001, H - 0.001);
  const rb = Math.min(rBot, L / 2 - 0.001);
  const s = new THREE.Shape();
  s.moveTo(-L / 2 + rb, 0);
  s.lineTo(L / 2 - rb, 0);
  s.absarc(L / 2 - rb, rb, rb, -Math.PI / 2, 0, false);
  s.lineTo(L / 2, H - rt);
  s.absarc(L / 2 - rt, H - rt, rt, 0, Math.PI / 2, false);
  s.lineTo(-L / 2 + rt, H);
  s.absarc(-L / 2 + rt, H - rt, rt, Math.PI / 2, Math.PI, false);
  s.lineTo(-L / 2, rb);
  s.absarc(-L / 2 + rb, rb, rb, Math.PI, Math.PI * 1.5, false);
  const depth = Math.max(0.01, w - 2 * JB);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: JB, bevelSize: JB, bevelSegments: 3, curveSegments: 12,
  });
  geo.translate(0, JB, -depth / 2);
  geo.applyMatrix4(PERM); // largo → y, alto → z, ancho → x
  return smooth(geo);
}

// Fila Jubilee: 2 eslabones exteriores + 3 centrales; la columna del medio va desfasada media fila
const J_PITCH = 0.2;
const J_GAP = 0.006;
function jubileeRow(k, dir, first) {
  const wo = 0.225 * k;
  const ws = 0.17 * k;
  const g = 0.004;
  const len = J_PITCH - J_GAP;
  const outer = [];
  const inner = [];
  for (const sx of [-1, 1]) {
    outer.push(barrelLink(len, 0.17, wo, 0.07).translate(sx * (1.5 * ws + 2 * g + wo / 2), 0, 0));
    inner.push(barrelLink(len * 0.94, 0.152, ws, 0.075).translate(sx * (ws + g), 0, 0));
  }
  inner.push(barrelLink(len * 0.94, 0.152, ws, 0.075).translate(0, (dir * J_PITCH) / 2, 0));
  if (first) inner.push(barrelLink(J_PITCH * 0.46, 0.152, ws, 0.06).translate(0, -dir * J_PITCH * 0.23, 0));
  // alma interior: evita ver a través de la pulsera entre eslabones
  outer.push(new THREE.BoxGeometry(3 * ws + 2 * wo, J_PITCH, 0.06).translate(0, 0, 0.035).toNonIndexed());
  return { outer, inner };
}

const END_TOP = 1.31;
function endLinkGeometry() {
  const w = 0.5;
  const R = 1.045;
  const yw = Math.sqrt(R * R - w * w);
  const s = new THREE.Shape();
  s.moveTo(w, yw);
  s.lineTo(w, END_TOP);
  s.lineTo(-w, END_TOP);
  s.lineTo(-w, yw);
  s.absarc(0, 0, R, Math.atan2(yw, -w), Math.atan2(yw, w), true);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.17, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.014, bevelSegments: 3, curveSegments: 32,
  });
  geo.translate(0, 0, -0.19);
  return smooth(geo, Math.PI / 4);
}

/**
 * Cronógrafo procedural inspirado en un "Daytona" de acero (sin marcas registradas).
 * Mira hacia +Z; la pulsera Jubilee recorre el eje Y curvándose hacia atrás.
 */
export function createWatch({
  metal = 'steel', dial = '#f2f2ef', subdial = '#dcdddf', subRing = '#a5a8ae', ink = '#141414',
  subInk = '#141414', accent = '#c41e2a', links = 18, curve = 5, texSize = 2048,
} = {}) {
  const M = metalMats(metal);
  const v = { dial, subdial, subRing, ink, subInk, accent };
  const root = new THREE.Group();
  const parts = [];
  const spinners = [];
  const hands = { sub: [] };
  const lume = new THREE.MeshStandardMaterial({ color: '#e9fff6', emissive: '#6dffc8', emissiveIntensity: 0.6, roughness: 0.4 });

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
  const cylX = (r, len, seg = 32) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
  const fluted = (group, r, len, x, n) => {
    const g = new THREE.BoxGeometry(len, 0.022, 0.022);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      group.add(mesh(g, M.polished, x, Math.cos(a) * r, Math.sin(a) * r));
    }
  };

  // ── Caja, asas, eslabones finales y protectores ──────
  const caseG = new THREE.Group();
  caseG.add(
    mesh(
      latheZ([[0, -0.2], [0.84, -0.2], [0.84, 0.13], [0.98, 0.14], [1.03, 0.12], [1.05, 0.02],
        [1.045, -0.12], [1.0, -0.24], [0.92, -0.3], [0.8, -0.32]], 128),
      M.polished
    )
  );
  caseG.add(mesh(latheZ([[0.84, 0.072], [0.87, 0.2]], 96), MAT.rehaut));
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const lug = mesh(new RoundedBoxGeometry(0.22, 0.48, 0.27, 4, 0.08), M.polished, sx * 0.63, sy * 1.03, -0.06);
      lug.rotation.z = sx * sy * -0.05;
      caseG.add(lug);
    }
  const endGeo = endLinkGeometry();
  caseG.add(mesh(endGeo, M.semi));
  caseG.add(mesh(endGeo.clone().rotateZ(Math.PI), M.semi));
  for (const sy of [-1, 1]) caseG.add(mesh(new RoundedBoxGeometry(0.15, 0.12, 0.22, 3, 0.05), M.polished, 1.04, sy * 0.19, -0.04));
  addPart(caseG, new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0.15, 0.35, 0.05));

  // ── Bisel taquimétrico ───────────────────────────────
  const bezel = new THREE.Group();
  const bezelMat = M.polished.clone();
  bezelMat.map = bezelTexture();
  bezelMat.roughness = 0.2;
  bezelMat.side = THREE.FrontSide;
  bezel.add(mesh(bezelTopGeometry(), bezelMat));
  bezel.add(mesh(latheZ([[0.87, 0.275], [0.87, 0.19]], 96), M.polished));
  bezel.add(mesh(latheZ([[1.068, 0.13], [1.072, 0.18], [BR, 0.222]], 128), M.polished));
  addPart(bezel, new THREE.Vector3(-0.3, 0.5, 2.4), new THREE.Vector3(0.6, -0.5, 1.2));

  // ── Cristal de zafiro ────────────────────────────────
  const crystal = mesh(new THREE.CylinderGeometry(0.87, 0.87, 0.03, 64).rotateX(Math.PI / 2), MAT.glass, 0, 0, 0.235);
  crystal.renderOrder = 2;
  addPart(crystal, new THREE.Vector3(-1.1, 1.0, 3.6), new THREE.Vector3(0.7, 0.5, 0.4));

  // ── Esfera, contadores e índices ─────────────────────
  const dialG = new THREE.Group();
  dialG.add(
    mesh(
      new THREE.CircleGeometry(RD, 128),
      (() => {
        const map = canvasTexture(texSize, (g, S) => drawDial(g, S, v));
        return new THREE.MeshStandardMaterial({
          map, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.32, metalness: 0.1, roughness: 0.5,
        });
      })()
    )
  );
  const idxGeo = new RoundedBoxGeometry(0.046, 0.11, 0.028, 2, 0.01);
  const lumeGeo = new THREE.BoxGeometry(0.02, 0.08, 0.008);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const holder = new THREE.Group();
    holder.position.set(Math.sin(a) * 0.7, Math.cos(a) * 0.7, 0.016);
    holder.rotation.z = -a;
    for (const o of i === 0 ? [-0.034, 0.034] : [0]) {
      holder.add(mesh(idxGeo, MAT.whiteGold, o, 0, 0));
      holder.add(mesh(lumeGeo, lume, o, 0, 0.016));
    }
    dialG.add(holder);
  }
  const ringGeo = new THREE.TorusGeometry(0.215, 0.005, 6, 96);
  const subHandGeo = new RoundedBoxGeometry(0.012, 0.19, 0.008, 2, 0.004);
  const hubGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16).rotateX(Math.PI / 2);
  for (const [x, y] of [[-0.38, 0], [0.38, 0], [0, -0.38]]) {
    dialG.add(mesh(ringGeo, MAT.whiteGold, x, y, 0.004));
    const piv = new THREE.Group();
    piv.position.set(x, y, 0.022);
    piv.add(mesh(subHandGeo, MAT.whiteGold, 0, 0.07, 0));
    piv.add(mesh(hubGeo, MAT.whiteGold));
    dialG.add(piv);
    hands.sub.push(piv);
  }
  dialG.position.z = 0.07;
  addPart(dialG, new THREE.Vector3(1.9, -1.3, 1.8), new THREE.Vector3(0.5, 0.4, -0.8));

  // ── Agujas ───────────────────────────────────────────
  const handsG = new THREE.Group();
  const mkHand = (len, w, z) => {
    const piv = new THREE.Group();
    piv.position.z = z;
    piv.add(mesh(new RoundedBoxGeometry(w, len, 0.02, 2, w * 0.3), MAT.whiteGold, 0, len * 0.4, 0));
    piv.add(mesh(new THREE.BoxGeometry(w * 0.48, len * 0.62, 0.008), lume, 0, len * 0.5, 0.012));
    handsG.add(piv);
    return piv;
  };
  hands.h = mkHand(0.44, 0.052, 0);
  hands.m = mkHand(0.7, 0.042, 0.022);
  hands.c = new THREE.Group();
  hands.c.position.z = 0.046;
  hands.c.add(mesh(new RoundedBoxGeometry(0.012, 0.98, 0.01, 2, 0.004), MAT.whiteGold, 0, 0.32, 0));
  hands.c.add(mesh(new RoundedBoxGeometry(0.036, 0.08, 0.012, 2, 0.01), MAT.whiteGold, 0, -0.12, 0));
  handsG.add(hands.c);
  handsG.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 24).rotateX(Math.PI / 2), MAT.whiteGold, 0, 0, 0.03));
  handsG.position.z = 0.12;
  addPart(handsG, new THREE.Vector3(-1.4, 1.6, 2.8), new THREE.Vector3(0.6, 0.3, 1.6));

  // ── Corona y pulsadores roscados ─────────────────────
  const crown = new THREE.Group();
  crown.add(mesh(cylX(0.05, 0.12, 16), M.polished, -0.06, 0, 0));
  crown.add(mesh(cylX(0.125, 0.15, 40), M.polished, 0.05, 0, 0));
  fluted(crown, 0.125, 0.15, 0.05, 22);
  crown.position.set(1.11, 0, -0.04);
  addPart(crown, new THREE.Vector3(3.2, 0.5, 0.6), new THREE.Vector3(2, 0.3, 0.2));

  for (const sgn of [1, -1]) {
    const ang = sgn * 0.62;
    const pusher = new THREE.Group();
    pusher.add(mesh(cylX(0.042, 0.12, 16), M.polished, 0.02, 0, 0));
    pusher.add(mesh(cylX(0.085, 0.09, 32), M.polished, 0.1, 0, 0));
    fluted(pusher, 0.085, 0.09, 0.1, 14);
    pusher.add(mesh(cylX(0.06, 0.07, 24), M.polished, 0.18, 0, 0));
    pusher.position.set(Math.cos(ang) * 1.02, Math.sin(ang) * 1.02, -0.04);
    pusher.rotation.z = ang;
    addPart(pusher, new THREE.Vector3(2.8, sgn * 1.6, 0.8), new THREE.Vector3(1.4, 0.3, sgn * 0.8));
  }

  // ── Mecanismo (visible al salir la esfera) ───────────
  const plate = mesh(new THREE.CylinderGeometry(0.83, 0.83, 0.04, 64).rotateX(Math.PI / 2), MAT.plate, 0, 0, -0.06);
  addPart(plate, new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0, 0, 0.2));
  const gearDefs = [
    [0, 0, 0.36, 22, 0.5, M.polished], [0.46, 0.3, 0.26, 16, -0.8, M.brushed],
    [-0.42, 0.34, 0.3, 18, -0.6, MAT.whiteGold], [-0.3, -0.44, 0.22, 14, 1.1, M.polished],
    [0.42, -0.4, 0.3, 18, 0.7, MAT.whiteGold], [0.05, 0.6, 0.16, 12, 1.6, M.polished],
    [-0.62, -0.06, 0.15, 10, -1.8, M.brushed], [0.66, -0.02, 0.14, 10, 2, M.polished],
  ];
  gearDefs.forEach(([x, y, r, t, sp, mat], i) => {
    const holder = new THREE.Group();
    const g = mesh(gearGeometry(r, t, 0.035), mat);
    holder.add(g);
    holder.add(mesh(new THREE.SphereGeometry(Math.min(0.022, r * 0.08), 16, 12), MAT.jewel, 0, 0, 0.02));
    holder.position.set(x, y, -0.03 + (i % 3) * 0.012);
    spinners.push({ obj: g, speed: sp });
    addPart(holder, new THREE.Vector3(x * 1.6 + rnd(-0.3, 0.3), y * 1.6 + rnd(-0.3, 0.3), rnd(0.6, 1.6)));
  });
  const balance = new THREE.Group();
  balance.add(mesh(new THREE.TorusGeometry(0.17, 0.02, 10, 48), M.polished));
  balance.add(mesh(new THREE.BoxGeometry(0.34, 0.025, 0.02), M.polished));
  balance.add(mesh(new THREE.BoxGeometry(0.025, 0.34, 0.02), M.polished));
  const balHolder = new THREE.Group();
  balHolder.add(balance);
  balHolder.position.set(-0.05, -0.62, 0.02);
  hands.balance = balance;
  addPart(balHolder, new THREE.Vector3(-0.4, -1.4, 1.2));
  for (const [x, y, w, rz] of [[0.25, 0.15, 0.9, 0.5], [-0.3, -0.25, 0.7, -0.7]]) {
    const b = mesh(new RoundedBoxGeometry(w, 0.13, 0.03, 2, 0.03), MAT.plate, x, y, 0.04);
    b.rotation.z = rz;
    addPart(b, new THREE.Vector3(x * 2, y * 2, 1.0));
  }

  // ── Fondo de caja + rotor ────────────────────────────
  const back = mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.06, 64).rotateX(Math.PI / 2), M.brushed, 0, 0, -0.35);
  addPart(back, new THREE.Vector3(0.4, -0.4, -3.2), new THREE.Vector3(0.6, -0.4, 0.3));
  const rotorShape = new THREE.Shape();
  rotorShape.absarc(0, 0, 0.8, Math.PI, Math.PI * 2, false);
  rotorShape.absarc(0, 0, 0.18, Math.PI * 2, Math.PI, true);
  const rotor = mesh(new THREE.ExtrudeGeometry(rotorShape, { depth: 0.03, bevelEnabled: false }), M.polished, 0, 0, -0.17);
  addPart(rotor, new THREE.Vector3(-0.8, -0.6, -2.0), new THREE.Vector3(0.3, 0.8, 2.5));

  // ── Pulsera Jubilee de 5 piezas ──────────────────────
  // Eslabones abombados pulidos en patrón de ladrillo; cada bloque de 3 filas se fusiona
  // en 2 mallas (exteriores / centrales) para mantener pocas llamadas de dibujo.
  const rowMatrix = (i, dir) => {
    const th = ((i + 0.5) * J_PITCH + J_GAP) / curve;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(0, dir * (END_TOP + curve * Math.sin(th)), -curve * (1 - Math.cos(th))),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-dir * th, 0, 0)),
      new THREE.Vector3(1, 1, 1)
    );
  };
  for (const dir of [1, -1]) {
    for (let start = 0; start < links; start += 3) {
      const outerList = [];
      const innerList = [];
      for (let i = start; i < Math.min(start + 3, links); i++) {
        const k = 1 - (i / Math.max(1, links - 1)) * 0.18;
        const { outer, inner } = jubileeRow(k, dir, i === 0);
        const m = rowMatrix(i, dir);
        for (const g of outer) outerList.push(g.translate(0, 0, -0.17).applyMatrix4(m));
        for (const g of inner) innerList.push(g.translate(0, 0, -0.17).applyMatrix4(m));
      }
      const outerGeo = mergeGeometries(outerList);
      const innerGeo = mergeGeometries(innerList);
      [...outerList, ...innerList].forEach((g) => g.dispose());
      outerGeo.computeBoundingBox();
      innerGeo.computeBoundingBox();
      const c = outerGeo.boundingBox.clone().union(innerGeo.boundingBox).getCenter(new THREE.Vector3());
      outerGeo.translate(-c.x, -c.y, -c.z);
      innerGeo.translate(-c.x, -c.y, -c.z);
      const chunk = new THREE.Group();
      chunk.position.copy(c);
      chunk.add(new THREE.Mesh(outerGeo, M.semi), new THREE.Mesh(innerGeo, M.polished));
      const side = Math.random() < 0.5 ? -1 : 1;
      addPart(
        chunk,
        new THREE.Vector3(side * rnd(2.4, 3.6), dir * rnd(0.2, 1.4) - c.y * 0.25, rnd(-0.5, 1.8)),
        new THREE.Vector3(rnd(-1, 1), rnd(-0.8, 0.8), side * rnd(0.4, 1.2))
      );
    }
  }

  // ── API ──────────────────────────────────────────────
  const tmp = new THREE.Vector3();
  function setExplode(e) {
    for (const p of parts) {
      p.obj.position.copy(p.home).add(tmp.copy(p.away).multiplyScalar(e));
      p.obj.rotation.set(p.homeRot.x + p.awayRot.x * e, p.homeRot.y + p.awayRot.y * e, p.homeRot.z + p.awayRot.z * e);
    }
  }

  const TAU = Math.PI * 2;
  function tick(dt, now) {
    const d = new Date(now);
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    hands.h.rotation.z = -(h / 12) * TAU;
    hands.m.rotation.z = -(m / 60) * TAU;
    // Cronógrafo en marcha desde que se abre la página
    const el = (now - CHRONO_START) / 1000;
    hands.c.rotation.z = -((el % 60) / 60) * TAU;
    hands.sub[0].rotation.z = -(s / 60) * TAU;                          // segundero continuo (9 h)
    hands.sub[1].rotation.z = -((Math.floor(el / 60) % 30) / 30) * TAU; // minutos cronografiados (3 h)
    hands.sub[2].rotation.z = -(((el / 3600) % 12) / 12) * TAU;         // horas cronografiadas (6 h)
    hands.balance.rotation.z = Math.sin(now * 0.025) * 1.4;
    for (const sp of spinners) sp.obj.rotation.z += dt * sp.speed;
  }

  return { root, setExplode, tick, setGlow: (g) => (lume.emissiveIntensity = g) };
}
