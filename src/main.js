import './style.css';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createWatch } from './watch.js';

gsap.registerPlugin(ScrollTrigger);

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

// Luces
const key = new THREE.DirectionalLight(0xfff0cf, 2.4);
key.position.set(4, 5, 6);
const rim = new THREE.DirectionalLight(0xffc873, 2);
rim.position.set(-6, 2, -4);
const spot = new THREE.PointLight(0xffd68a, 30, 20);
spot.position.set(0, 0, 5);
scene.add(key, rim, spot, new THREE.AmbientLight(0xffffff, 0.15));

// Reloj principal
const hero = createWatch();
const heroGroup = new THREE.Group();
heroGroup.add(hero.root);
scene.add(heroGroup);

// Colección
const variants = [
  { dial: '#efece3', marker: '#b8892b' },
  { dial: '#5a5e66', marker: '#e7c35f' },
  { dial: '#d8bd82', marker: '#8d6414' },
];
const collection = new THREE.Group();
const colWatches = variants.map((v) => {
  const w = createWatch(v);
  const holder = new THREE.Group();
  holder.add(w.root);
  collection.add(holder);
  return { w, holder };
});
scene.add(collection);

// Partículas
const N = 900;
const sparkGeo = new THREE.BufferGeometry();
const base = new Float32Array(N * 3);
const dirs = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(Math.random() * 1.2);
  base.set([v.x, v.y, v.z * 0.6], i * 3);
  const d = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-0.4, 1)).normalize().multiplyScalar(rnd(2, 7));
  dirs.set([d.x, d.y, d.z], i * 3);
}
sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
function rnd(a, b) { return a + Math.random() * (b - a); }
const dot = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.3, 'rgba(255,200,100,.7)'); gr.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const sparkMat = new THREE.PointsMaterial({
  size: 0.09, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
});
const sparks = new THREE.Points(sparkGeo, sparkMat);
scene.add(sparks);

// Estado de scroll
const state = { p: 0 };
gsap.to(state, {
  p: 1, ease: 'none',
  scrollTrigger: { trigger: '#scroll', start: 'top top', end: 'bottom bottom', scrub: 1.2 },
});

// Overlays
const chapters = [
  { el: document.getElementById('c0'), r: [-1, -1, 0.05, 0.11] },
  { el: document.getElementById('c1'), r: [0.14, 0.2, 0.38, 0.45] },
  { el: document.getElementById('c2'), r: [0.5, 0.55, 0.66, 0.71] },
  { el: document.getElementById('c3'), r: [0.73, 0.76, 0.82, 0.86] },
  { el: document.getElementById('c4'), r: [0.9, 0.95, 1.1, 1.2] },
];
const labels = [0, 1, 2].map((i) => document.getElementById('l' + i));
const cta = document.getElementById('cta');
const streak = document.getElementById('streak');
const trap = (p, [a, b, c, d]) => Math.min(Math.max((p - a) / (b - a || 1), 0), Math.max((d - p) / (d - c || 1), 0), 1);
const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

// Mouse
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = (e.clientY / innerHeight) * 2 - 1;
});

let aspect = 1;
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  aspect = innerWidth / innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

cta.addEventListener('click', () => {
  gsap.fromTo(cta, { scale: 1 }, { scale: 1.06, yoyo: true, repeat: 1, duration: 0.18 });
});

const tmp = new THREE.Vector3();
const clock = new THREE.Clock();
let sm = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = Date.now();
  const p = state.p;
  sm += (p - sm) * Math.min(1, dt * 8);

  // Explosión: 0.12→0.36 sale, mantiene, 0.5→0.72 vuelve
  const e = Math.max(0, ss(0.12, 0.36, sm) - ss(0.5, 0.72, sm));
  hero.setExplode(e);
  hero.tick(dt, now);
  colWatches.forEach((c) => c.w.tick(dt, now));

  // Rotación del reloj
  const spin = ss(0.5, 0.74, sm) * Math.PI * 2;
  heroGroup.rotation.y = Math.sin(now * 0.0005) * 0.25 + spin + sm * 0.4 * Math.sin(sm * 6);
  heroGroup.position.y = -1.3 * (1 - ss(0.04, 0.16, sm));
  heroGroup.rotation.x = Math.sin(now * 0.0007) * 0.05 + e * 0.25;

  // Cámara
  const fit = aspect < 1.1 ? 1.1 / aspect : 1;
  const zoom = ss(0.72, 0.84, sm);
  const out = ss(0.86, 0.95, sm);
  let z = 15 + 6 * e;
  z = z + (4.4 - z) * zoom;
  z = z + (13.5 - z) * out;
  camera.position.set(mouse.sx * 0.6, -mouse.sy * 0.4, z * fit);
  camera.lookAt(0, 0, 0);
  mouse.sx += (mouse.x - mouse.sx) * 0.05;
  mouse.sy += (mouse.y - mouse.sy) * 0.05;

  // Hero vs colección
  const heroScale = 1 - out;
  heroGroup.scale.setScalar(Math.max(heroScale, 0.0001));
  heroGroup.visible = heroScale > 0.01;
  collection.visible = out > 0.01;
  const spacing = Math.min(3.3, (2 * Math.tan((camera.fov * Math.PI) / 360) * 13.5 * aspect) / 3.4);
  colWatches.forEach((c, i) => {
    c.holder.position.set((i - 1) * spacing, -0.1 + (1 - out) * -1.2, 0);
    const s = 0.5 * (spacing / 3.3 > 0.7 ? 1 : 0.8) * out;
    c.holder.scale.setScalar(Math.max(s, 0.0001));
    c.holder.rotation.y = Math.sin(now * 0.0006 + i * 1.7) * 0.45;
    const lp = tmp.set((i - 1) * spacing, -2.1 * 0.4 * 3 * 0.45 - 0.5, 0).project(camera);
    labels[i].style.left = (lp.x * 0.5 + 0.5) * innerWidth + 'px';
    labels[i].style.top = (-lp.y * 0.5 + 0.5) * innerHeight + 'px';
    labels[i].style.opacity = String(trap(sm, [0.92, 0.97, 1.1, 1.2]));
  });

  // Luz que sigue el zoom
  spot.intensity = 30 + zoom * 40;

  // Chispas
  const arr = sparkGeo.attributes.position.array;
  const burst = Math.min(1, e * 1.4);
  const flash = Math.sin(Math.PI * Math.min(1, Math.max(0, e))) ; // más visibles a mitad del movimiento
  for (let i = 0; i < N; i++) {
    const k = i * 3;
    arr[k] = base[k] + dirs[k] * burst * 0.8 + Math.sin(now * 0.001 + i) * 0.03;
    arr[k + 1] = base[k + 1] + dirs[k + 1] * burst * 0.8 + Math.cos(now * 0.0013 + i) * 0.03;
    arr[k + 2] = base[k + 2] + dirs[k + 2] * burst * 0.5;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparks.rotation.copy(heroGroup.rotation);
  sparkMat.opacity = Math.min(1, 0.12 + flash * 1.2) * (1 - out);
  sparks.visible = sparkMat.opacity > 0.01;

  // Texto
  chapters.forEach(({ el, r }) => {
    const o = trap(sm, r);
    el.style.opacity = String(o);
    el.style.filter = o < 1 ? `blur(${(1 - o) * 6}px)` : 'none';
  });
  const ctaO = trap(sm, [0.93, 0.98, 1.1, 1.2]);
  cta.style.opacity = String(ctaO);
  cta.style.pointerEvents = ctaO > 0.5 ? 'auto' : 'none';
  streak.style.opacity = String(0.9 * (1 - ss(0.0, 0.12, sm)));

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

gsap.from('#c0 > *', { y: 30, opacity: 0, duration: 1.4, stagger: 0.15, ease: 'power3.out', delay: 0.3 });
