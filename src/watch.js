import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const rnd = (a, b) => a + Math.random() * (b - a);

const goldMat = () =>
  new THREE.MeshStandardMaterial({ color: 0xd9a93c, metalness: 1, roughness: 0.2 });
const steelMat = () =>
  new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.35 });
const darkMat = () =>
  new THREE.MeshStandardMaterial({ color: 0x1a1a1d, metalness: 0.7, roughness: 0.45 });

function makeDialTextures({ dial, marker }) {
  const S = 1024;
  const c = document.createElement('canvas');
  const e = document.createElement('canvas');
  c.width = c.height = e.width = e.height = S;
  const g = c.getContext('2d');
  const l = e.getContext('2d');
  const cx = S / 2;

  const grad = g.createRadialGradient(cx, cx, 40, cx, cx, cx);
  grad.addColorStop(0, dial);
  grad.addColorStop(1, shade(dial, -0.35));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  // sunburst
  g.save();
  g.translate(cx, cx);
  g.globalAlpha = 0.09;
  for (let i = 0; i < 180; i++) {
    g.rotate((Math.PI * 2) / 180);
    g.fillStyle = i % 2 ? '#fff' : '#000';
    g.fillRect(-2, 0, 4, cx);
  }
  g.restore();

  l.fillStyle = '#000';
  l.fillRect(0, 0, S, S);

  // markers
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const big = i % 3 === 0;
    g.save();
    g.translate(cx, cx);
    g.rotate(a);
    g.fillStyle = marker;
    g.shadowColor = 'rgba(0,0,0,.5)';
    g.shadowBlur = 8;
    const w = big ? 46 : 34;
    const h = big ? 120 : 96;
    g.fillRect(-w / 2, -cx + 70, w, h);
    g.restore();

    l.save();
    l.translate(cx, cx);
    l.rotate(a);
    l.fillStyle = '#9fffe0';
    l.fillRect(-(big ? 15 : 10), -cx + 84, big ? 30 : 20, big ? 92 : 68);
    l.restore();
  }

  // minute track
  g.strokeStyle = marker;
  g.globalAlpha = 0.6;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (cx - 28), cx + Math.sin(a) * (cx - 28));
    g.lineTo(cx + Math.cos(a) * (cx - 8), cx + Math.sin(a) * (cx - 8));
    g.stroke();
  }
  g.globalAlpha = 1;

  // text
  g.fillStyle = marker;
  g.textAlign = 'center';
  g.font = '600 54px "Cormorant Garamond", Georgia, serif';
  g.fillText('AURELIA', cx, cx - 210);
  g.font = '500 22px Inter, Arial, sans-serif';
  g.globalAlpha = 0.85;
  g.fillText('OYSTER PERPETUAL · CRONOS', cx, cx - 175);
  g.font = '500 20px Inter, Arial, sans-serif';
  g.fillText('SUPERLATIVE CHRONOMETER', cx, cx + 230);
  g.globalAlpha = 1;

  // date window
  g.fillStyle = '#f4f1e8';
  g.fillRect(cx + 270, cx - 42, 100, 84);
  g.strokeStyle = marker;
  g.lineWidth = 6;
  g.strokeRect(cx + 270, cx - 42, 100, 84);
  g.fillStyle = '#111';
  g.font = '700 56px Inter, Arial, sans-serif';
  g.fillText('18', cx + 320, cx + 20);

  const map = new THREE.CanvasTexture(c);
  const emi = new THREE.CanvasTexture(e);
  map.colorSpace = THREE.SRGBColorSpace;
  emi.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = emi.anisotropy = 8;
  return { map, emi };
}

function shade(hex, amt) {
  const col = new THREE.Color(hex);
  col.offsetHSL(0, 0, amt);
  return '#' + col.getHexString();
}

function gearGeometry(r, teeth, thick) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = i % 4;
    const rad = k === 1 || k === 2 ? r : r * 0.86;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.28, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  geo.translate(0, 0, -thick / 2);
  return geo;
}

/**
 * Reloj procedural. Mira hacia +Z, la pulsera va a lo largo de Y.
 * Cada pieza tiene una posición "home" (ensamblada) y "away" (explotada).
 */
export function createWatch({ dial = '#d8bd82', marker = '#e7c35f', bracelet = true } = {}) {
  const root = new THREE.Group();
  const parts = [];
  const spinners = [];
  const hands = {};

  const addPart = (obj, home, away, awayRot) => {
    obj.position.copy(home);
    root.add(obj);
    parts.push({
      obj,
      home: home.clone(),
      away,
      awayRot: awayRot || new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)),
    });
    return obj;
  };

  // Caja + asas
  const caseG = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.42, 72).rotateX(Math.PI / 2),
    goldMat()
  );
  body.position.z = -0.17;
  caseG.add(body);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const lug = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.62, 0.3, 3, 0.07), goldMat());
      lug.position.set(sx * 0.6, sy * 1.02, -0.02);
      caseG.add(lug);
    }
  addPart(caseG, new THREE.Vector3(0, 0, 0), new THREE.Vector3(rnd(-0.5, 0.5), 0.2, 0), new THREE.Vector3(0.3, 0.6, 0.2));

  // Bisel acanalado
  const bezel = new THREE.Group();
  bezel.add(new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.1, 24, 96), goldMat()));
  const flute = new THREE.BoxGeometry(0.045, 0.1, 0.12);
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const m = new THREE.Mesh(flute, goldMat());
    m.position.set(Math.cos(a) * 1.02, Math.sin(a) * 1.02, 0.05);
    m.rotation.z = a - Math.PI / 2;
    bezel.add(m);
  }
  addPart(bezel, new THREE.Vector3(0, 0, 0.2), new THREE.Vector3(0.4, 0.5, 2.6), new THREE.Vector3(0.2, -0.4, 1.2));

  // Cristal
  const crystal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.93, 0.93, 0.07, 64).rotateX(Math.PI / 2),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0, transparent: true,
      opacity: 0.1, clearcoat: 1, envMapIntensity: 1.5,
    })
  );
  addPart(crystal, new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(-0.6, 0.4, 4.2), new THREE.Vector3(0.5, 0.5, 0.3));

  // Esfera
  const tex = makeDialTextures({ dial, marker });
  const dialG = new THREE.Group();
  dialG.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.92, 0.92, 0.05, 72).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: shade(dial, -0.2), metalness: 0.6, roughness: 0.4 })
    )
  );
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.92, 72),
    new THREE.MeshStandardMaterial({
      map: tex.map, emissiveMap: tex.emi, emissive: 0xffffff, emissiveIntensity: 1.6,
      metalness: 0.5, roughness: 0.35,
    })
  );
  face.position.z = 0.026;
  dialG.add(face);
  addPart(dialG, new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(0.8, -0.5, 1.4), new THREE.Vector3(0.4, 0.2, -0.5));

  // Agujas
  const handsG = new THREE.Group();
  const mkHand = (len, w, mat) => {
    const piv = new THREE.Group();
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, len, 0.03, 2, w * 0.3), mat);
    m.position.y = len * 0.4;
    piv.add(m);
    handsG.add(piv);
    return piv;
  };
  hands.h = mkHand(0.5, 0.1, goldMat());
  hands.m = mkHand(0.76, 0.075, goldMat());
  hands.s = mkHand(0.86, 0.018, steelMat());
  hands.h.position.z = 0;
  hands.m.position.z = 0.03;
  hands.s.position.z = 0.06;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 24).rotateX(Math.PI / 2), goldMat());
  cap.position.z = 0.04;
  handsG.add(cap);
  addPart(handsG, new THREE.Vector3(0, 0, 0.17), new THREE.Vector3(0, 0.3, 3.2), new THREE.Vector3(0.6, 0.3, 1.4));

  // Corona
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 24).rotateZ(Math.PI / 2), goldMat());
  addPart(crown, new THREE.Vector3(1.1, 0, 0), new THREE.Vector3(3.2, 0.4, 0.4), new THREE.Vector3(1, 0.3, 0.2));

  // Mecanismo: placa + engranajes
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.86, 0.86, 0.06, 64).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x6d7077, metalness: 1, roughness: 0.3 })
  );
  addPart(plate, new THREE.Vector3(0, 0, -0.2), new THREE.Vector3(0, 0, -1.3), new THREE.Vector3(0.3, 0.3, 0.1));

  const gearDefs = [
    [0.0, 0.0, 0.42, 16, 1], [0.5, 0.3, 0.3, 12, -1.4], [-0.45, 0.35, 0.34, 13, -1],
    [-0.3, -0.5, 0.28, 11, 1.5], [0.42, -0.42, 0.36, 14, 1], [0.05, 0.62, 0.2, 9, 2],
  ];
  gearDefs.forEach(([x, y, r, t, sp], i) => {
    const holder = new THREE.Group();
    const m = new THREE.Mesh(gearGeometry(r, t, 0.05), i % 2 ? goldMat() : steelMat());
    holder.add(m);
    const jewel = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.16, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xc0143c, metalness: 0.2, roughness: 0.2, emissive: 0x500010 })
    );
    jewel.position.z = 0.04;
    holder.add(jewel);
    spinners.push({ obj: m, speed: sp * 0.6 });
    addPart(
      holder,
      new THREE.Vector3(x, y, -0.14),
      new THREE.Vector3(x * 3 + rnd(-1, 1), y * 3 + rnd(-1, 1), rnd(-2.4, -0.6)),
    );
  });

  // Fondo de caja
  const back = new THREE.Mesh(
    new THREE.CylinderGeometry(0.97, 0.97, 0.06, 64).rotateX(Math.PI / 2),
    steelMat()
  );
  addPart(back, new THREE.Vector3(0, 0, -0.26), new THREE.Vector3(0.5, -0.4, -3.2), new THREE.Vector3(0.4, -0.2, 0.3));

  // Pulsera
  if (bracelet) {
    for (const dir of [1, -1]) {
      for (let i = 0; i < 6; i++) {
        const link = new THREE.Group();
        const k = 1 - i * 0.045;
        const sideW = 0.24 * k;
        const centerW = 0.4 * k;
        const gap = 0.02;
        const mat = goldMat();
        const c = new THREE.Mesh(new RoundedBoxGeometry(centerW, 0.4, 0.2, 3, 0.05), mat);
        link.add(c);
        for (const s of [-1, 1]) {
          const sl = new THREE.Mesh(new RoundedBoxGeometry(sideW, 0.4, 0.18, 3, 0.05), mat);
          sl.position.x = s * (centerW / 2 + sideW / 2 + gap);
          link.add(sl);
        }
        const y = dir * (1.42 + i * 0.43);
        const z = -0.12 - i * 0.045;
        link.rotation.x = dir * -i * 0.04;
        const home = new THREE.Vector3(0, y, z);
        addPart(
          link,
          home,
          new THREE.Vector3(rnd(-2.6, 2.6), y * 1.5 + rnd(-0.6, 0.6), rnd(-1.5, 2.5)),
          new THREE.Vector3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2))
        );
      }
    }
  }

  // Estado
  function setExplode(e) {
    for (const p of parts) {
      p.obj.position.lerpVectors(p.home, p.home.clone().add(p.away), e);
      p.obj.rotation.set(p.awayRot.x * e, p.awayRot.y * e, p.awayRot.z * e);
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
    for (const sp of spinners) sp.obj.rotation.z += dt * sp.speed;
  }

  return { root, setExplode, tick };
}
