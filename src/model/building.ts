import { defaultRoof } from '../roof/roof';
import { emptyStructure } from '../structure/types';
import { buildExamplePlan } from './example';
import { addFurniture, addOpeningAt, addWall, createEmptyPlan, uid } from './ops';
import type { Building, Level, Plan } from './types';
import { isStair, placeStairAuto, stairDims } from './stairs';

export const DEFAULT_LEVEL_HEIGHT = 2.95;

export function createLevel(name: string, elevation: number, plan: Plan = createEmptyPlan(), height = DEFAULT_LEVEL_HEIGHT): Level {
  return { id: uid('lv'), name, elevation, height, plan };
}

export function createBuilding(plan: Plan = createEmptyPlan()): Building {
  return { version: 2, meta: plan.meta, levels: [createLevel('Térreo', 0, plan)], structure: emptyStructure(), roof: defaultRoof() };
}

/** Aceita o formato antigo (uma planta, versão 1) e o atual (edifício, versão 2). */
export function migrate(data: unknown): Building | null {
  const d = data as Partial<Building> & Partial<Plan>;
  if (!d || typeof d !== 'object') return null;
  if (d.version === 2 && Array.isArray(d.levels) && d.levels.length > 0) {
    return { ...(d as Building), roof: { ...defaultRoof(), ...(d.roof ?? {}) }, structure: { ...emptyStructure(), ...(d.structure ?? {}), settings: { ...emptyStructure().settings, ...(d.structure?.settings ?? {}) } } };
  }
  if (d.version === 1 && d.nodes && d.walls) {
    const plan = { ...createEmptyPlan(), ...(d as Plan) };
    return createBuilding(plan);
  }
  return null;
}

/** Recalcula as cotas dos pavimentos empilhando as alturas piso a piso. */
export function restack(b: Building) {
  let z = b.levels[0]?.elevation ?? 0;
  for (const l of b.levels) {
    l.elevation = Math.round(z * 1000) / 1000;
    z += l.height;
  }
}

export type NewLevelMode = 'empty' | 'outer' | 'all';

/** Adiciona um pavimento acima do último, opcionalmente copiando as paredes do pavimento de baixo. */
/**
 * Adiciona um pavimento acima do último. Opcionalmente copia paredes do pavimento de baixo e
 * cria a escada no pavimento de baixo (o vão na laje do novo pavimento é automático).
 */
export function addLevelOnTop(b: Building, mode: NewLevelMode, opts: { stair?: boolean; name?: string } = {}): { id: string; message: string } {
  const top = b.levels[b.levels.length - 1];
  let stairMsg = '';
  if (opts.stair !== false && !Object.values(top.plan.furniture).some(isStair)) {
    stairMsg = ' ' + placeStairAuto(top.plan, top.height).message;
  }
  const plan = createEmptyPlan();
  if (mode !== 'empty') {
    const src = top.plan;
    const outerWalls = mode === 'outer' ? outerWallIds(src) : null;
    for (const w of Object.values(src.walls)) {
      if (outerWalls && !outerWalls.has(w.id)) continue;
      addWall(plan, src.nodes[w.a], src.nodes[w.b], { thickness: w.thickness, height: w.height });
    }
  }
  const n = b.levels.length;
  const level = createLevel(opts.name ?? (n === 1 ? '1º andar' : `${n}º andar`), top.elevation + top.height, plan, top.height);
  b.levels.push(level);
  return { id: level.id, message: `${level.name} criado sobre o ${top.name}.${stairMsg}` };
}

/** Paredes de fachada: um dos lados não pertence a nenhum cômodo. */
function outerWallIds(plan: Plan): Set<string> {
  const ids = new Set<string>();
  // paredes na envoltória: as que tocam o contorno convexo aproximado (bounding box)
  const xs = Object.values(plan.nodes).map((n) => n.x);
  const ys = Object.values(plan.nodes).map((n) => n.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const on = (v: number, t: number) => Math.abs(v - t) < 1e-3;
  for (const w of Object.values(plan.walls)) {
    const A = plan.nodes[w.a];
    const B = plan.nodes[w.b];
    if ((on(A.x, minX) && on(B.x, minX)) || (on(A.x, maxX) && on(B.x, maxX)) || (on(A.y, minY) && on(B.y, minY)) || (on(A.y, maxY) && on(B.y, maxY))) ids.add(w.id);
  }
  return ids;
}

export function levelBelow(b: Building, levelId: string): Level | undefined {
  const i = b.levels.findIndex((l) => l.id === levelId);
  return i > 0 ? b.levels[i - 1] : undefined;
}

/** Sobrado de exemplo: térreo com sala/cozinha, 2 quartos e banheiro; superior com suíte, sala íntima, 2 quartos e banheiro. */
export function buildExampleBuilding(): Building {
  const ground = buildExamplePlan();
  // sala do sobrado: estar voltado para a parede do meio, escada junto à parede esquerda
  const drop = new Set(['bookshelf', 'plant', 'tv_rack', 'rug', 'coffee_table', 'sofa3', 'armchair', 'floor_lamp']);
  for (const f of Object.values(ground.furniture)) if (drop.has(f.catalogId)) delete ground.furniture[f.id];
  for (const op of Object.values(ground.openings)) {
    const w = ground.walls[op.wallId];
    const A = ground.nodes[w.a];
    const B = ground.nodes[w.b];
    if (Math.abs(A.x - 6) < 1e-6 && Math.abs(B.x - 6) < 1e-6 && Math.min(A.y, B.y) >= 4 - 1e-6) op.offset = 0.5;
  }
  const stair = stairDims(DEFAULT_LEVEL_HEIGHT);
  addFurniture(ground, 'stair', { x: 0.56, y: 3.5 + stair.depth / 2 }, Math.PI, { depth: stair.depth, height: DEFAULT_LEVEL_HEIGHT });
  addFurniture(ground, 'tv_rack', { x: 5.72, y: 6.6 }, Math.PI / 2);
  addFurniture(ground, 'rug', { x: 3.6, y: 6.2 }, Math.PI / 2);
  addFurniture(ground, 'coffee_table', { x: 3.75, y: 6.2 }, Math.PI / 2);
  addFurniture(ground, 'sofa3', { x: 2.55, y: 6.2 }, -Math.PI / 2);
  addFurniture(ground, 'armchair', { x: 3.7, y: 7.4 }, Math.PI);
  addFurniture(ground, 'floor_lamp', { x: 1.6, y: 7.5 });

  const up = createEmptyPlan();
  const EXT = { thickness: 0.2, height: 2.8 };
  const INT = { thickness: 0.12, height: 2.8 };
  const outline = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 },
  ];
  for (let i = 0; i < 4; i++) addWall(up, outline[i], outline[(i + 1) % 4], EXT);
  addWall(up, { x: 6, y: 0 }, { x: 6, y: 8 }, INT);
  addWall(up, { x: 6, y: 4 }, { x: 10, y: 4 }, INT);
  addWall(up, { x: 8.5, y: 4 }, { x: 8.5, y: 8 }, INT);
  addWall(up, { x: 0, y: 3.4 }, { x: 6, y: 3.4 }, INT);
  addOpeningAt(up, { x: 3.0, y: 3.4 }, 'door', { width: 0.8 });
  addOpeningAt(up, { x: 6, y: 2.0 }, 'door', { width: 0.8, flip: true });
  addOpeningAt(up, { x: 6, y: 4.6 }, 'door', { width: 0.8 });
  addOpeningAt(up, { x: 9.25, y: 4 }, 'door', { width: 0.7, side: true });
  addOpeningAt(up, { x: 3, y: 0 }, 'window', { width: 2.0, height: 1.2, sill: 1.0 });
  addOpeningAt(up, { x: 0, y: 6 }, 'window', { width: 2.0, height: 1.2, sill: 1.0 });
  addOpeningAt(up, { x: 8, y: 0 }, 'window', { width: 1.5, height: 1.2, sill: 1.0 });
  addOpeningAt(up, { x: 7.25, y: 8 }, 'window', { width: 1.2, height: 1.2, sill: 1.0 });
  addOpeningAt(up, { x: 9.25, y: 8 }, 'window', { width: 0.6, height: 0.6, sill: 1.5 });
  addFurniture(up, 'double_bed', { x: 3.0, y: 1.13 }, 0);
  addFurniture(up, 'nightstand', { x: 1.9, y: 0.31 }, 0);
  addFurniture(up, 'nightstand', { x: 4.1, y: 0.31 }, 0);
  addFurniture(up, 'wardrobe', { x: 0.4, y: 2.0 }, -Math.PI / 2);
  addFurniture(up, 'sofa2', { x: 2.9, y: 7.45 }, Math.PI);
  addFurniture(up, 'tv_rack', { x: 2.9, y: 3.69 }, 0);
  addFurniture(up, 'double_bed', { x: 8.0, y: 1.13 }, 0);
  addFurniture(up, 'wardrobe', { x: 9.6, y: 2.6 }, Math.PI / 2);
  addFurniture(up, 'single_bed', { x: 7.45, y: 7.4 }, Math.PI / 2);
  addFurniture(up, 'desk', { x: 7.4, y: 4.37 }, 0);
  addFurniture(up, 'toilet', { x: 9.56, y: 5.5 }, Math.PI / 2);
  addFurniture(up, 'bath_sink', { x: 9.67, y: 6.4 }, Math.PI / 2);
  addFurniture(up, 'shower', { x: 9.03, y: 7.44 }, Math.PI);
  const label = (x: number, y: number, name: string, floorColor: string) => {
    const id = uid('r');
    up.rooms[id] = { id, x, y, name, floorColor };
  };
  label(3, 1.8, 'Suíte', '#c8a77f');
  label(3, 5.8, 'Sala íntima', '#d9c4a3');
  label(8, 2, 'Quarto 3', '#c8a77f');
  label(7.25, 6, 'Quarto 4', '#c8a77f');
  label(9.25, 6, 'Banheiro 2', '#cfd8dc');

  const b: Building = {
    version: 2,
    meta: { title: 'Sobrado exemplo', client: '', address: '', author: '', registry: '', notes: '' },
    levels: [createLevel('Térreo', 0, ground), createLevel('1º andar', DEFAULT_LEVEL_HEIGHT, up)],
    structure: emptyStructure(),
    roof: defaultRoof(),
  };
  return b;
}
