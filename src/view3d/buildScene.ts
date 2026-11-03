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
  wallMaterial,
} from './materials';

const slabMaterial = new THREE.MeshStandardMaterial({ color: '#cfcac2', roughness: 0.9 });

export function prismGeometry(poly: Vec2[], bottom: number, top: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
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
  const t = g.thickness + 0.02;
  const w = op.width;
  const f = 0.05;
  const base = op.sill;
  const h = Math.min(op.height, g.height - op.sill);
  grp.add(box([f, h, t], [-w / 2 + f / 2, base + h / 2, 0], frameMaterial));
  grp.add(box([f, h, t], [w / 2 - f / 2, base + h / 2, 0], frameMaterial));
  grp.add(box([w, f, t], [0, base + h - f / 2, 0], frameMaterial));
  if (op.kind === 'door') {
    grp.add(box([w - 2 * f, h - f, 0.04], [0, (h - f) / 2, 0], doorLeafMaterial));
    grp.add(box([0.12, 0.025, 0.1], [(op.flip ? -1 : 1) * (w / 2 - f - 0.1), 1.0, 0], handleMaterial));
  } else {
    grp.add(box([w, f, t], [0, base + f / 2, 0], frameMaterial));
    grp.add(box([f * 0.6, h - 2 * f, 0.05], [0, base + h / 2, 0], frameMaterial));
    grp.add(box([w - 2 * f, h - 2 * f, 0.01], [0, base + h / 2, 0], glassMaterial, false));
    grp.add(box([w + 0.08, 0.025, t + 0.06], [0, base - 0.0125, 0], frameMaterial));
  }
  return grp;
}

export function buildHouseGroup(plan: Plan, opts: { lights?: boolean; slab?: boolean } = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Casa';
  const geoms = computeWallGeometry(plan);
  const byWall: Record<string, Opening[]> = {};
  for (const op of Object.values(plan.openings)) (byWall[op.wallId] ??= []).push(op);

  const walls = new THREE.Group();
  walls.name = 'Paredes';
  for (const g of Object.values(geoms)) {
    for (const p of wallPrisms(g, byWall[g.id] ?? [])) {
      const m = new THREE.Mesh(prismGeometry(p.polygon, p.bottom, p.top), wallMaterial);
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
      const s = new THREE.Mesh(prismGeometry(r.polygon, -0.12, -0.001), slabMaterial);
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
