/**
 * Monta a casa como um grupo Three.js "puro" (sem React). Usado para gerar imagens
 * do PDF e, no futuro, para exportar glTF/OBJ/USDZ.
 */
import * as THREE from 'three';
import { CATALOG_BY_ID } from '../catalog/catalog';
import { detectRooms } from '../geometry/rooms';
import type { Vec2 } from '../geometry/vec';
import { type WallGeom, computeWallGeometry, openingCenter, wallPrisms } from '../geometry/walls';
import type { Opening, Plan } from '../model/types';
import { styleOf } from '../model/openings';
import { type P3, ROOF_COLOR, roofGeometry } from '../roof/roof';
import {
  doorLeafMaterial,
  floorMaterial,
  frameMaterial,
  glassMaterial,
  handleMaterial,
  partMaterial,
  unitBox,
  unitCylinder,
  unitSphere,
  wallMaterialFor,
  slabMaterialFor,
} from './materials';


export function prismGeometry(poly: Vec2[], bottom: number, top: number, holes: Vec2[][] = []): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, top, 0);
  return g;
}

function box(size: [number, number, number], pos: [number, number, number], mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(...size);
  m.position.set(...pos);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function openingGroup(op: Opening, g: WallGeom): THREE.Group {
  const grp = new THREE.Group();
  const c = openingCenter(g, op);
  grp.position.set(c.x, 0, c.y);
  grp.rotation.y = -Math.atan2(g.dir.y, g.dir.x);
  const mats = { frame: frameMaterial, leaf: doorLeafMaterial, handle: handleMaterial, glass: glassMaterial };
  for (const p of openingParts(op, g)) grp.add(box(p.size, p.pos, mats[p.mat], p.mat !== 'glass'));
  return grp;
}

export interface OpeningPart {
  size: [number, number, number];
  pos: [number, number, number];
  mat: 'frame' | 'leaf' | 'handle' | 'glass';
}

/** Peças de uma porta/janela (batentes, folhas, vidros), conforme o tipo. Coordenadas locais da abertura. */
export function openingParts(op: Opening, g: WallGeom): OpeningPart[] {
  const t = g.thickness + 0.02;
  const w = op.width;
  const f = 0.05;
  const base = op.sill;
  const h = Math.min(op.height, g.height - op.sill);
  const style = styleOf(op);
  const P = (size: OpeningPart['size'], pos: OpeningPart['pos'], mat: OpeningPart['mat']): OpeningPart => ({ size, pos, mat });
  const out: OpeningPart[] = [
    P([f, h, t], [-w / 2 + f / 2, base + h / 2, 0], 'frame'),
    P([f, h, t], [w / 2 - f / 2, base + h / 2, 0], 'frame'),
    P([w, f, t], [0, base + h - f / 2, 0], 'frame'),
  ];
  const inner = w - 2 * f;
  const lh = h - f;
  if (op.kind === 'door') {
    if (style === 'dupla') {
      for (const sd of [-1, 1]) {
        out.push(P([inner / 2 - 0.006, lh, 0.04], [(sd * inner) / 4, lh / 2, 0], 'leaf'));
        out.push(P([0.025, 0.12, 0.1], [sd * 0.06, 1.0, 0], 'handle'));
      }
    } else if (style === 'correr') {
      for (const sd of [-1, 1]) {
        out.push(P([inner * 0.55, lh, 0.035], [(-sd * inner * 0.225), lh / 2, sd * 0.025], 'leaf'));
        out.push(P([0.025, 0.25, 0.05], [-sd * (inner * 0.225 - inner * 0.25), 1.0, sd * 0.05], 'handle'));
      }
    } else if (style === 'porta_vidro') {
      for (const sd of [-1, 1]) {
        out.push(P([inner * 0.52, lh, 0.012], [-sd * inner * 0.24, lh / 2, sd * 0.02], 'glass'));
        out.push(P([0.02, 0.6, 0.04], [-sd * 0.04, 1.05, sd * 0.04], 'handle'));
      }
      out.push(P([inner, 0.04, 0.06], [0, lh - 0.02, 0], 'frame'));
    } else if (style === 'camarao') {
      const k = 4;
      for (let i = 0; i < k; i++) out.push(P([inner / k - 0.01, lh, 0.035], [-inner / 2 + (i + 0.5) * (inner / k), lh / 2, (i % 2 ? 1 : -1) * 0.03], 'leaf'));
    } else if (style === 'portao_basculante') {
      out.push(P([inner, lh, 0.05], [0, lh / 2, 0], 'leaf'));
      const ribs = Math.max(3, Math.round(lh / 0.25));
      for (let i = 1; i < ribs; i++) out.push(P([inner, 0.025, 0.07], [0, (i * lh) / ribs, 0], 'frame'));
    } else if (style === 'portao_correr') {
      out.push(P([inner, 0.08, 0.06], [0, 0.1, 0], 'frame'));
      out.push(P([inner, 0.08, 0.06], [0, lh - 0.1, 0], 'frame'));
      const bars = Math.max(4, Math.round(inner / 0.12));
      for (let i = 0; i <= bars; i++) out.push(P([0.03, lh - 0.1, 0.03], [-inner / 2 + (i * inner) / bars, lh / 2, 0], 'frame'));
    } else if (style === 'pivotante') {
      out.push(P([inner, lh, 0.05], [0, lh / 2, 0], 'leaf'));
      out.push(P([0.035, 0.9, 0.12], [(op.flip ? -1 : 1) * (inner / 2 - 0.15), 1.05, 0], 'handle'));
    } else {
      out.push(P([inner, lh, 0.04], [0, lh / 2, 0], 'leaf'));
      out.push(P([0.12, 0.025, 0.1], [(op.flip ? -1 : 1) * (w / 2 - f - 0.1), 1.0, 0], 'handle'));
    }
    return out;
  }
  if (base > 0.01) {
    out.push(P([w, f, t], [0, base + f / 2, 0], 'frame'));
    out.push(P([w + 0.08, 0.025, t + 0.06], [0, base - 0.0125, 0], 'frame'));
  }
  const gy = base + h / 2;
  const gh = h - (base > 0.01 ? 2 * f : f);
  if (style === 'janela_correr' || style === 'porta_janela') out.push(P([f * 0.6, gh, 0.05], [0, gy, 0], 'frame'));
  if (style === 'basculante') out.push(P([inner, 0.03, 0.04], [0, gy, 0], 'frame'));
  if (style === 'pele_vidro') {
    const cols = Math.max(2, Math.round(inner / 1.0));
    for (let i = 1; i < cols; i++) out.push(P([0.05, gh, 0.08], [-inner / 2 + (i * inner) / cols, gy, 0], 'frame'));
    out.push(P([inner, 0.05, 0.08], [0, base + Math.min(1.1, h * 0.45), 0], 'frame'));
  }
  if (style === 'veneziana') {
    // folhas de veneziana (metade) do lado de fora + vidro
    out.push(P([f * 0.6, gh, 0.05], [0, gy, 0], 'frame'));
    const slats = Math.max(4, Math.round(gh / 0.08));
    for (let i = 0; i < slats; i++) out.push(P([inner / 2, 0.05, 0.02], [-inner / 4, gy - gh / 2 + (i + 0.5) * (gh / slats), t / 2 - 0.02], 'leaf'));
  }
  out.push(P([inner, gh, 0.01], [0, gy, 0], 'glass'));
  return out;
}

export function buildHouseGroup(plan: Plan, opts: { lights?: boolean; slab?: boolean; colors?: import('../model/types').ProjectColors } = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Casa';
  const geoms = computeWallGeometry(plan);
  const byWall: Record<string, Opening[]> = {};
  for (const op of Object.values(plan.openings)) (byWall[op.wallId] ??= []).push(op);

  const walls = new THREE.Group();
  walls.name = 'Paredes';
  for (const g of Object.values(geoms)) {
    for (const p of wallPrisms(g, byWall[g.id] ?? [])) {
      const m = new THREE.Mesh(prismGeometry(p.polygon, p.bottom, p.top), wallMaterialFor(plan.walls[g.id]?.color ?? opts.colors?.wall));
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = `Parede ${g.id}`;
      walls.add(m);
    }
  }
  root.add(walls);

  const floors = new THREE.Group();
  floors.name = 'Pisos';
  for (const r of detectRooms(plan)) {
    const geo = new THREE.ShapeGeometry(new THREE.Shape(r.inner.map((p) => new THREE.Vector2(p.x, p.y))));
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, floorMaterial(r.floorColor, false));
    m.position.y = 0.002;
    m.receiveShadow = true;
    m.name = r.name;
    floors.add(m);
    if (opts.slab) {
      const s = new THREE.Mesh(prismGeometry(r.polygon, -0.12, -0.001), slabMaterialFor(opts.colors?.ceiling));
      s.castShadow = true;
      s.receiveShadow = true;
      floors.add(s);
    }
  }
  root.add(floors);

  const openings = new THREE.Group();
  openings.name = 'Esquadrias';
  for (const op of Object.values(plan.openings)) {
    const g = geoms[op.wallId];
    if (g) openings.add(openingGroup(op, g));
  }
  root.add(openings);

  const furniture = new THREE.Group();
  furniture.name = 'Mobiliário';
  for (const f of Object.values(plan.furniture)) {
    const item = CATALOG_BY_ID[f.catalogId];
    if (!item) continue;
    const grp = new THREE.Group();
    grp.name = item.name;
    grp.position.set(f.x, f.elevation, f.y);
    grp.rotation.y = -f.rotation;
    for (const p of item.parts(f.width, f.depth, f.height)) {
      const m = new THREE.Mesh(p.shape === 'box' ? unitBox : p.shape === 'cyl' ? unitCylinder : unitSphere, partMaterial(p.color, p.material, false));
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = -(p.ry ?? 0);
      m.scale.set(p.sx, p.sy, p.sz);
      m.castShadow = p.material !== 'glass';
      m.receiveShadow = true;
      grp.add(m);
    }
    if (opts.lights && item.light) {
      const l = new THREE.PointLight(item.light.color, item.light.intensity, 6, 2);
      l.position.set(0, item.light.y, 0);
      grp.add(l);
    }
    furniture.add(grp);
  }
  root.add(furniture);
  return root;
}

/** Telhado (planos e oitões) como malha Three.js, para imagens e exportações. */
export function buildRoofGroup(b: import('../model/types').Building): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'Telhado';
  const g = roofGeometry(b);
  if (!g) return grp;
  const toGeo = (faces: P3[][]) => {
    const pos: number[] = [];
    for (const f of faces) for (let k = 1; k + 1 < f.length; k++) for (const p of [f[0], f[k], f[k + 1]]) pos.push(p[0], p[2], p[1]);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.computeVertexNormals();
    return bg;
  };
  const material = (b.roof?.type ?? 'duas_aguas') === 'plano' ? 'laje' : b.structure.settings.roof;
  const roofMesh = new THREE.Mesh(toGeo(g.faces), new THREE.MeshStandardMaterial({ color: b.colors?.roof ?? ROOF_COLOR[material], roughness: 0.75, side: THREE.DoubleSide }));
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  const gables = new THREE.Mesh(toGeo(g.gables), new THREE.MeshStandardMaterial({ color: b.colors?.wall ?? '#f1ede6', roughness: 0.9, side: THREE.DoubleSide }));
  gables.castShadow = true;
  grp.add(roofMesh, gables);
  return grp;
}
