import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createWatch, VARIANTS } from './watch.js';
import { loadGLBWatch } from './glbWatch.js';
import { createShards, createSparks, createStreak } from './effects.js';
import { createShowcase, MODELS } from './showcase.js';

gsap.registerPlugin(ScrollTrigger);

// ── Render ────────────────────────────────────────────
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#030303');

// Entorno de estudio: fondo oscuro con softboxes → reflejos de joyería
function studioEnv() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: '#1c1b1a', side: THREE.BackSide })));
  // softbox con bordes difuminados: reflejos más fotográficos en el metal pulido
  const soft = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.filter = 'blur(22px)';
    g.fillStyle = '#fff';
    g.fillRect(40, 40, 176, 176);
    return new THREE.CanvasTexture(c);
  })();
  const box = (w, h, x, y, z, intensity, color = '#ffffff') => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, alphaMap: soft, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    m.material.color.multiplyScalar(intensity);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(18, 8, 0, 10, 4, 1.8);                 // gran softbox cenital
  box(6, 18, -11, 0, 5, 2.4, '#f2f5fa');     // tira lateral izquierda
  box(6, 18, 11, 1, 3, 1.8, '#ffe2bd');      // tira lateral derecha cálida
  box(20, 4, 0, -4, 11, 1.1);              // tira frontal baja
  box(10, 6, 0, 2, 12, 0.22);                 // relleno frontal suave
  box(5, 5, 6, 6, -9, 1.5, '#ffcf8a');       // contraluz
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.02).texture;
  pm.dispose();
  return tex;
}
scene.environment = studioEnv();

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

const key = new THREE.DirectionalLight('#fff1d6', 0);
key.position.set(3, 6, 8);
const rim = new THREE.DirectionalLight('#ffbf66', 0);
rim.position.set(-6, 3, -5);
const front = new THREE.PointLight('#ffd690', 8, 30, 1.6);
front.position.set(0, 0, 6);
scene.add(key, rim, front, new THREE.AmbientLight('#ffffff', 0.08));

// ── Reloj protagonista ────────────────────────────────
const heroGroup = new THREE.Group();
scene.add(heroGroup);
let hero = createWatch({ ...VARIANTS.solstice, links: 18, curve: 5 });
heroGroup.add(hero.root);

loadGLBWatch()
  .then((glb) => {
    heroGroup.remove(hero.root);
    hero = glb;
    heroGroup.add(hero.root);
    console.info('[AURELIA] reloj.glb cargado', glb.info);
  })
  .catch(() => console.info('[AURELIA] Sin public/models/reloj.glb → reloj procedural'));

const shards = createShards();
const sparks = createSparks();
heroGroup.add(shards.mesh, sparks.points);
const streak = createStreak();
scene.add(streak.group);

// ── Estuche ───────────────────────────────────────────
const SHOWCASE_Y = -16;
const showcase = createShowcase();
showcase.group.position.y = SHOWCASE_Y;
scene.add(showcase.group);

// ── Postproceso ───────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.35, 2.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ── Scroll ────────────────────────────────────────────
const state = { p: 0 };
gsap.to(state, {
  p: 1, ease: 'none',
  scrollTrigger: { trigger: '#scroll', start: 'top top', end: 'bottom bottom', scrub: 1 },
});

const $ = (id) => document.getElementById(id);
const chapters = [
  { el: $('c0'), r: [-1, -1, 0.04, 0.1] },
  { el: $('c1'), r: [0.15, 0.2, 0.4, 0.46] },
  { el: $('c2'), r: [0.5, 0.54, 0.62, 0.67] },
  { el: $('c3'), r: [0.71, 0.74, 0.8, 0.83] },
  { el: $('c4'), r: [0.92, 0.96, 1.1, 1.2] },
];
const labels = [0, 1, 2].map((i) => $('l' + i));
labels.forEach((l, i) => (l.textContent = MODELS[i].name));
const cta = $('cta');
const hint = $('hint');

const clamp = (x, a = 0, b = 1) => Math.min(Math.max(x, a), b);
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const trap = (p, [a, b, c, d]) => Math.min(clamp((p - a) / (b - a || 1)), clamp((d - p) / (d - c || 1)));
const lerp = (a, b, t) => a + (b - a) * t;

const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = (e.clientY / innerHeight) * 2 - 1;
});

let aspect = 1;
function resize() {
  const w = innerWidth, h = innerHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  aspect = w / h;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// distancia de cámara para que quepa un alto/ancho dado
const fitZ = (height, width) => {
  const t = Math.tan((camera.fov * Math.PI) / 360);
  return Math.max(height / (2 * t), width / (2 * t * aspect));
};

const tmp = new THREE.Vector3();
const clock = new THREE.Clock();
// Solo en desarrollo: ?p=0.5 fija el progreso para revisar una fase
const DEBUG_P = import.meta.env.DEV ? parseFloat(new URLSearchParams(location.search).get('p')) : NaN;
let sm = Number.isFinite(DEBUG_P) ? DEBUG_P : 0;
// Solo en desarrollo: ?cam=x,y,z,tx,ty,tz coloca la cámara para inspeccionar detalles
const DEBUG_CAM = import.meta.env.DEV && new URLSearchParams(location.search).get('cam')?.split(',').map(Number);
let ctaShown = false;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const now = Date.now();
  sm += ((Number.isFinite(DEBUG_P) ? DEBUG_P : state.p) - sm) * Math.min(1, dt * 7);
  const p = sm;

  // Fases
  const e = Math.max(0, ss(0.12, 0.34, p) - ss(0.48, 0.66, p)); // explosión
  const spin = ss(0.48, 0.7, p);                                 // giro al rearmarse
  const zoom = ss(0.67, 0.78, p);                                // esfera a pantalla completa
  const pan = ss(0.82, 0.94, p);                                 // bajada al estuche

  hero.setExplode(e);
  hero.tick(dt, now);
  hero.setGlow(0.7 + zoom * 3.3);
  shards.update(e, t);
  sparks.update(e, t);
  showcase.tick(dt, now, t);

  heroGroup.rotation.y = (Math.sin(t * 0.45) * 0.18 - 0.38) * (1 - zoom) + spin * Math.PI * 2 + e * 0.5;
  heroGroup.rotation.x = Math.sin(t * 0.6) * 0.04 + 0.16 * (1 - zoom) + e * 0.22;

  // Cámara
  const zHero = fitZ(8.6, 3.2);
  const zExplode = fitZ(6.4, 7.5);
  const zDial = fitZ(2.5, 2.4);
  const zCase = fitZ(5.6, 9.6);
  let z = lerp(zHero, zExplode, ss(0.1, 0.3, p) * (1 - ss(0.5, 0.66, p)));
  z = lerp(z, zDial, zoom);
  z = lerp(z, zCase, pan);
  mouse.sx += (mouse.x - mouse.sx) * 0.05;
  mouse.sy += (mouse.y - mouse.sy) * 0.05;
  const par = 1 - zoom * 0.7;
  camera.position.set(mouse.sx * 0.5 * par, -mouse.sy * 0.35 * par + SHOWCASE_Y * pan + 0.35 * pan, z);
  camera.lookAt(0, SHOWCASE_Y * pan + 0.35 * pan, 0);

  if (DEBUG_CAM) {
    camera.position.set(...DEBUG_CAM.slice(0, 3));
    camera.lookAt(...DEBUG_CAM.slice(3, 6));
  }
  front.intensity = 0;
  front.position.y = SHOWCASE_Y * pan;
  streak.update(1 - ss(0.04, 0.14, p), t);
  streak.group.position.y = SHOWCASE_Y * pan;
  streak.halo.material.opacity *= 1 - pan;
  bloom.strength = 0.55 + zoom * 0.1 + e * 0.3;

  // Rótulos bajo cada compartimento
  const lo = trap(p, [0.93, 0.97, 1.1, 1.2]);
  showcase.slotX.forEach((x, i) => {
    tmp.set(x, SHOWCASE_Y - 1.55, 0.3).project(camera);
    labels[i].style.transform = `translate(${(tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-tmp.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, 0)`;
    labels[i].style.opacity = lo;
  });

  chapters.forEach(({ el, r }) => {
    const o = trap(p, r);
    el.style.opacity = o;
    el.style.filter = o < 0.999 ? `blur(${(1 - o) * 8}px)` : 'none';
  });
  hint.style.opacity = 1 - ss(0.01, 0.05, p);

  const show = p > 0.95;
  if (show !== ctaShown) {
    ctaShown = show;
    cta.classList.toggle('on', show);
  }

  composer.render();
  requestAnimationFrame(frame);
}
frame();

gsap.from('#c0 > *', { y: 24, opacity: 0, duration: 1.4, stagger: 0.12, ease: 'power3.out', delay: 0.2 });
gsap.from('.nav', { y: -20, opacity: 0, duration: 1.2, ease: 'power3.out' });
if (import.meta.env.DEV) window.__dbg = { scene, bloom, renderer, key, rim, front, heroGroup };
