import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Carga public/models/reloj.glb (si existe) y lo adapta a la misma API que
 * createWatch(): { root, setExplode, tick, setGlow }.
 *
 * Ajustes manuales por si el modelo llega girado o con logos:
 */
export const GLB_CONFIG = {
  url: '/models/reloj.glb',
  // Rotación extra (radianes) aplicada tras la orientación automática.
  extraRotation: [0, 0, 0],
  // Ancho objetivo de la caja (el reloj procedural mide 2.1).
  targetWidth: 2.3,
  // Mallas que se ocultan (logos y marcas registradas).
  hidePattern: /logo|rolex|brand|wordmark|coronet/i,
  // Mallas/materiales que brillan como material luminiscente.
  lumePattern: /lume|lumi|glow|superluminova/i,
};

const rnd = (a, b) => a + Math.random() * (b - a);

export async function loadGLBWatch() {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(GLB_CONFIG.url);
  const model = gltf.scene;

  // Ocultar logos
  model.traverse((o) => {
    const matName = o.material && !Array.isArray(o.material) ? o.material.name : '';
    if (GLB_CONFIG.hidePattern.test(o.name) || GLB_CONFIG.hidePattern.test(matName)) o.visible = false;
  });

  // Orientación automática: eje más corto → Z (cara del reloj), eje más largo → Y (pulsera)
  const orient = new THREE.Group();
  orient.add(model);
  let size = new THREE.Box3().setFromObject(orient).getSize(new THREE.Vector3());
  const minAxis = ['x', 'y', 'z'].reduce((a, b) => (size[a] <= size[b] ? a : b));
  if (minAxis === 'y') orient.rotation.x = Math.PI / 2;
  if (minAxis === 'x') orient.rotation.y = -Math.PI / 2;
  orient.updateMatrixWorld(true);
  size = new THREE.Box3().setFromObject(orient).getSize(new THREE.Vector3());
  if (size.x > size.y) {
    orient.rotation.z += Math.PI / 2;
    orient.updateMatrixWorld(true);
  }
  orient.rotation.x += GLB_CONFIG.extraRotation[0];
  orient.rotation.y += GLB_CONFIG.extraRotation[1];
  orient.rotation.z += GLB_CONFIG.extraRotation[2];
  orient.updateMatrixWorld(true);

  // Escala y centrado
  let box = new THREE.Box3().setFromObject(orient);
  size = box.getSize(new THREE.Vector3());
  const scale = GLB_CONFIG.targetWidth / size.x;
  orient.scale.setScalar(scale);
  orient.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(orient);
  const center = box.getCenter(new THREE.Vector3());
  orient.position.sub(center);

  const root = new THREE.Group();
  root.add(orient);
  root.updateMatrixWorld(true);

  // Cada malla visible pasa a ser una pieza que explota
  const parts = [];
  const lumeMats = new Set();
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && o.visible) meshes.push(o);
  });
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (mat.envMapIntensity !== undefined) mat.envMapIntensity = 1.4;
      if (GLB_CONFIG.lumePattern.test(m.name) || GLB_CONFIG.lumePattern.test(mat.name || '')) {
        mat.emissive = new THREE.Color('#6dffc8');
        lumeMats.add(mat);
      }
    }
    const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
    const dir = c.clone();
    if (dir.lengthSq() < 0.01) dir.set(rnd(-1, 1), rnd(-1, 1), 1);
    dir.normalize();
    // en coordenadas locales del padre de la malla
    const parentInv = new THREE.Matrix4().copy(m.parent.matrixWorld).invert();
    const worldAway = c.clone().add(
      new THREE.Vector3(dir.x * rnd(1.5, 3.2), dir.y * rnd(1.0, 2.4), dir.z * 1.5 + rnd(0.3, 2.2))
    );
    const localAway = worldAway.applyMatrix4(parentInv);
    const localHome = c.clone().applyMatrix4(parentInv);
    parts.push({
      obj: m,
      home: m.position.clone(),
      homeRot: m.rotation.clone(),
      away: localAway.sub(localHome),
      awayRot: new THREE.Vector3(rnd(-1.4, 1.4), rnd(-1.4, 1.4), rnd(-1.4, 1.4)),
    });
  }

  const tmp = new THREE.Vector3();
  function setExplode(e) {
    for (const p of parts) {
      p.obj.position.copy(p.home).add(tmp.copy(p.away).multiplyScalar(e));
      p.obj.rotation.set(p.homeRot.x + p.awayRot.x * e, p.homeRot.y + p.awayRot.y * e, p.homeRot.z + p.awayRot.z * e);
    }
  }

  const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
  if (mixer) gltf.animations.forEach((a) => mixer.clipAction(a).play());

  return {
    root,
    setExplode,
    tick: (dt) => mixer && mixer.update(dt),
    setGlow: (g) => lumeMats.forEach((m) => (m.emissiveIntensity = g)),
    info: { meshes: meshes.length, size: size.toArray() },
  };
}
