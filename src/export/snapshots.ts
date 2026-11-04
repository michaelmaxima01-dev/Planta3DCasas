/** Gera imagens da casa em 3D (fora da tela) para o PDF. */
import * as THREE from 'three';
import { planBounds } from '../model/ops';
import type { Building, Level } from '../model/types';
import { buildHouseGroup, buildRoofGroup } from '../view3d/buildScene';
import { CATALOG_BY_ID } from '../catalog/catalog';

export type ViewKind = 'front' | 'back' | 'top';

export function renderViews(levels: Level[], views: ViewKind[], width = 1600, height = 1000, building?: Building): string[] {
  const plan = levels[0].plan;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const b = planBounds(plan) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const r = Math.max(3, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3f5f8');
  scene.add(new THREE.HemisphereLight('#ffffff', '#b8b0a2', 1.0));
  scene.add(new THREE.AmbientLight('#ffffff', 0.15));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(cx + r * 0.8, r * 2.2, cz + r * 0.5);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -r * 1.4, right: r * 1.4, top: r * 1.4, bottom: -r * 1.4, near: 0.5, far: r * 6 });
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(r * 12, r * 12), new THREE.MeshStandardMaterial({ color: '#dfe4ea', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -0.01, cz);
  ground.receiveShadow = true;
  scene.add(ground);
  levels.forEach((l, i) => {
    const g = buildHouseGroup(l.plan, { lights: true, slab: i > 0, colors: building?.colors });
    g.position.y = l.elevation;
    scene.add(g);
  });
  if (building) scene.add(buildRoofGroup(building));
  const top = levels[levels.length - 1];
  const height3d = top.elevation + top.height;

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 500);
  const out: string[] = [];
  for (const v of views) {
    if (v === 'front') camera.position.set(cx + r * 1.0, r * 1.4 + height3d * 0.5, cz + r * 1.5);
    else if (v === 'back') camera.position.set(cx - r * 1.05, r * 1.4 + height3d * 0.5, cz - r * 1.45);
    else camera.position.set(cx + 0.001, r * 2.1 + height3d, cz + 0.001);
    camera.up.set(0, 1, 0);
    if (v === 'top') camera.up.set(0, 0, -1);
    camera.lookAt(cx, v === 'top' ? 0 : height3d * 0.35, cz);
    renderer.render(scene, camera);
    out.push(renderer.domElement.toDataURL('image/jpeg', 0.9));
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

// ---------------------------------------------------------------------
// Tour completo para o caderno: 8 perspectivas ao redor, 4 fachadas e vistas aéreas.
// ---------------------------------------------------------------------

export interface TourShot {
  group: 'Vistas ao redor da casa' | 'Fachadas' | 'Vistas aéreas';
  title: string;
  src: string;
  /** Ângulo da câmera em planta (rad, 0 = frente) para o mini-mapa da folha; ausente nas aéreas. */
  angle?: number;
}

const AROUND = ['Frente', 'Frente / lateral direita', 'Lateral direita', 'Fundos / lateral direita', 'Fundos', 'Fundos / lateral esquerda', 'Lateral esquerda', 'Frente / lateral esquerda'];
const FACADES: [number, string][] = [
  [0, 'Fachada frontal'],
  [2, 'Fachada lateral direita'],
  [4, 'Fachada posterior'],
  [6, 'Fachada lateral esquerda'],
];

/** Ângulo (em planta) da direção da rua: 0 = frente para +y da planta. */
function frontAngle(b: Building) {
  switch (b.site?.front) {
    case 'cima':
      return Math.PI;
    case 'direita':
      return Math.PI / 2;
    case 'esquerda':
      return -Math.PI / 2;
    default:
      return 0;
  }
}

const isWallItem = (catalogId: string) => {
  const c = CATALOG_BY_ID[catalogId];
  return !!(c?.fence || c?.gate);
};

/**
 * Renderiza a casa de todos os lados. Retorna a imagem de capa e as vistas agrupadas.
 * O enquadramento usa a caixa envolvente real (inclui telhado); as fachadas são ortogonais
 * e omitem muros/portões do terreno para não esconder a casa.
 */
export function renderTour(building: Building, o: { width?: number; height?: number; full?: boolean } = {}): { cover: string; shots: TourShot[] } {
  const width = o.width ?? 1600;
  const height = o.height ?? 1000;
  const levels = building.levels;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef2f6');
  scene.add(new THREE.HemisphereLight('#ffffff', '#b8b0a2', 1.05));
  scene.add(new THREE.AmbientLight('#ffffff', 0.2));

  // casa (sem muros) e muros separados, para poder ocultá-los nas fachadas
  const house = new THREE.Group();
  const walls = new THREE.Group();
  levels.forEach((l, i) => {
    const plain = { ...l.plan, furniture: Object.fromEntries(Object.entries(l.plan.furniture).filter(([, f]) => !isWallItem(f.catalogId))) };
    const g = buildHouseGroup(plain, { lights: true, slab: i > 0, colors: building.colors });
    g.position.y = l.elevation;
    house.add(g);
    const onlyWalls = { ...l.plan, walls: {}, nodes: {}, openings: {}, rooms: {}, annotations: {}, furniture: Object.fromEntries(Object.entries(l.plan.furniture).filter(([, f]) => isWallItem(f.catalogId))) };
    if (Object.keys(onlyWalls.furniture).length) {
      const gw = buildHouseGroup(onlyWalls, { lights: false, slab: false });
      gw.position.y = l.elevation;
      walls.add(gw);
    }
  });
  const roofG = buildRoofGroup(building);
  house.add(roofG);
  scene.add(house, walls);
  scene.updateMatrixWorld(true);

  // caixa só da edificação (paredes e telhado) para enquadrar — árvores e gramados não contam
  const core = new THREE.Box3();
  house.traverse((m) => {
    if (m.name === 'Paredes') core.expandByObject(m);
  });
  if (!core.isEmpty()) core.expandByObject(roofG);
  else house.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) core.expandByObject(m);
  });
  const bb = planBounds(levels[0].plan);
  if (core.isEmpty()) core.set(new THREE.Vector3(bb?.minX ?? 0, 0, bb?.minY ?? 0), new THREE.Vector3(bb?.maxX ?? 10, 3, bb?.maxY ?? 8));
  const c = core.getCenter(new THREE.Vector3());
  const size = core.getSize(new THREE.Vector3());
  const R = Math.max(3, size.length() / 2);

  // chão: lote (se houver) e entorno
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(R * 30, R * 30), new THREE.MeshStandardMaterial({ color: '#dfe4ea', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(c.x, -0.01, c.z);
  ground.receiveShadow = true;
  scene.add(ground);
  const site = building.site;
  if (site?.show) {
    const sx = site.front === 'baixo' || site.front === 'cima' ? site.w : site.d;
    const sy = site.front === 'baixo' || site.front === 'cima' ? site.d : site.w;
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), new THREE.MeshStandardMaterial({ color: '#a9c98a', roughness: 1 }));
    lot.rotation.x = -Math.PI / 2;
    lot.position.set(site.x + sx / 2, 0.003, site.y + sy / 2);
    lot.receiveShadow = true;
    scene.add(lot);
  }

  const sun = new THREE.DirectionalLight('#ffffff', 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const S = R * 2.2;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 0.5, far: R * 10 });
  scene.add(sun, sun.target);
  sun.target.position.copy(c);

  const base = frontAngle(building);
  /** Direção horizontal (x, z) da câmera para um ângulo em planta. */
  const dirOf = (a: number) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const corners = () => {
    const pts: THREE.Vector3[] = [];
    for (const x of [core.min.x, core.max.x]) for (const y of [core.min.y, core.max.y]) for (const z of [core.min.z, core.max.z]) pts.push(new THREE.Vector3(x, y, z));
    return pts;
  };
  /** Sol sempre por trás do observador, um pouco de lado: fachadas iluminadas. */
  const placeSun = (dir: THREE.Vector3) => {
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    sun.position.copy(c).addScaledVector(dir, R * 1.6).addScaledVector(side, R * 0.9).add(new THREE.Vector3(0, R * 2.4, 0));
    sun.shadow.camera.updateProjectionMatrix();
  };
  const snap = () => {
    return renderer.domElement.toDataURL('image/jpeg', 0.88);
  };

  const persp = new THREE.PerspectiveCamera(35, width / height, 0.05, R * 40);
  /** Perspectiva enquadrada: recua a câmera até a caixa caber com folga. */
  const shootPersp = (angle: number, elev: number, zoom = 0.82) => {
    const dir = dirOf(angle);
    const viewDir = dir.clone().multiplyScalar(Math.cos(elev)).add(new THREE.Vector3(0, Math.sin(elev), 0)).normalize();
    const target = c.clone();
    target.y = core.min.y + size.y * 0.4;
    const vFov = (persp.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * persp.aspect);
    const fit = Math.min(vFov, hFov) / 2;
    const dist = (R / Math.sin(fit)) * zoom;
    persp.position.copy(target).addScaledVector(viewDir, dist);
    persp.up.set(0, 1, 0);
    persp.lookAt(target);
    persp.updateProjectionMatrix();
    placeSun(dir);
    renderer.render(scene, persp);
    return snap();
  };

  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, R * 40);
  const shootFacade = (angle: number) => {
    const dir = dirOf(angle);
    const right = new THREE.Vector3(dir.z, 0, -dir.x).negate();
    let minU = Infinity;
    let maxU = -Infinity;
    for (const p of corners()) {
      const u = p.clone().sub(c).dot(right);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
    }
    const halfW0 = (maxU - minU) / 2 + 0.6;
    const halfH0 = (core.max.y - 0) / 2 + 0.5;
    const aspect = width / height;
    const halfW = Math.max(halfW0, halfH0 * aspect);
    const halfH = halfW / aspect;
    const midU = (minU + maxU) / 2;
    const target = c.clone().addScaledVector(right, midU);
    target.y = core.max.y / 2;
    Object.assign(ortho, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    ortho.position.copy(target).addScaledVector(dir, R * 4);
    ortho.up.set(0, 1, 0);
    ortho.lookAt(target);
    ortho.updateProjectionMatrix();
    placeSun(dir);
    renderer.render(scene, ortho);
    return snap();
  };

  const shots: TourShot[] = [];
  const cover = shootPersp(base + Math.PI / 5, 0.38);
  if (o.full !== false) {
    AROUND.forEach((t, k) => shots.push({ group: 'Vistas ao redor da casa', title: `${k + 1} · ${t}`, src: shootPersp(base + (k * Math.PI) / 4, 0.32), angle: (k * Math.PI) / 4 }));
    walls.visible = false;
    for (const [k, t] of FACADES) shots.push({ group: 'Fachadas', title: t, src: shootFacade(base + (k * Math.PI) / 4), angle: (k * Math.PI) / 4 });
    walls.visible = true;
    shots.push({ group: 'Vistas aéreas', title: 'Vista aérea em perspectiva', src: shootPersp(base - Math.PI / 4, 0.85, 1.25) });
    // vista de cima (planta humanizada)
    const top = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, R * 40);
    const aspect = width / height;
    // enquadra o terreno inteiro (se houver) ou a casa com folga; o lado da rua fica embaixo
    let ex = { minX: core.min.x - 3, maxX: core.max.x + 3, minZ: core.min.z - 3, maxZ: core.max.z + 3 };
    if (site?.show) {
      const sx = site.front === 'baixo' || site.front === 'cima' ? site.w : site.d;
      const sy = site.front === 'baixo' || site.front === 'cima' ? site.d : site.w;
      ex = { minX: Math.min(ex.minX, site.x - 1), maxX: Math.max(ex.maxX, site.x + sx + 1), minZ: Math.min(ex.minZ, site.y - 1), maxZ: Math.max(ex.maxZ, site.y + sy + 1) };
    }
    const side = Math.abs(Math.sin(base)) > 0.5;
    const wx = (side ? ex.maxZ - ex.minZ : ex.maxX - ex.minX) / 2;
    const wz = (side ? ex.maxX - ex.minX : ex.maxZ - ex.minZ) / 2;
    const halfW = Math.max(wx, wz * aspect);
    Object.assign(top, { left: -halfW, right: halfW, top: halfW / aspect, bottom: -halfW / aspect });
    const tc = { x: (ex.minX + ex.maxX) / 2, z: (ex.minZ + ex.maxZ) / 2 };
    top.position.set(tc.x, core.max.y + R * 3, tc.z);
    top.up.set(-Math.sin(base), 0, -Math.cos(base));
    top.lookAt(tc.x, 0, tc.z);
    top.updateProjectionMatrix();
    placeSun(dirOf(base));
    renderer.render(scene, top);
    shots.push({ group: 'Vistas aéreas', title: 'Vista superior (cobertura)', src: snap() });
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return { cover, shots };
}
