/**
 * Operações de edição da planta. Todas alteram o objeto `plan` recebido (um rascunho
 * clonado pela store), o que mantém o código simples e o desfazer/refazer correto.
 */
import { CATALOG_BY_ID } from '../catalog/catalog';
import { clampOpeningOffset } from '../geometry/walls';
import { type Vec2, add, dist, mul, normalize, projectOnSegment, segmentIntersection, sub } from '../geometry/vec';
import type { FurnitureItem, Opening, OpeningKind, Plan, Selection, Wall } from './types';

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createEmptyPlan(): Plan {
  return { version: 1, nodes: {}, walls: {}, openings: {}, furniture: {}, rooms: {} };
}

export interface WallProps {
  thickness: number;
  height: number;
}

export const OPENING_DEFAULTS: Record<OpeningKind, Pick<Opening, 'width' | 'height' | 'sill'>> = {
  door: { width: 0.8, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 1.0 },
};

export function findNodeAt(plan: Plan, p: Vec2, eps = 1e-4): string | null {
  for (const n of Object.values(plan.nodes)) if (dist(n, p) <= eps) return n.id;
  return null;
}

export function addNode(plan: Plan, p: Vec2): string {
  const existing = findNodeAt(plan, p);
  if (existing) return existing;
  const id = uid('n');
  plan.nodes[id] = { id, x: p.x, y: p.y };
  return id;
}

export function wallBetween(plan: Plan, a: string, b: string): Wall | undefined {
  return Object.values(plan.walls).find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
}

export function wallsAtNode(plan: Plan, nodeId: string): Wall[] {
  return Object.values(plan.walls).filter((w) => w.a === nodeId || w.b === nodeId);
}

/** Divide a parede no ponto p (projetado). Portas/janelas vão para o trecho certo. Retorna o nó criado. */
export function splitWall(plan: Plan, wallId: string, p: Vec2): string {
  const w = plan.walls[wallId];
  const A = plan.nodes[w.a];
  const B = plan.nodes[w.b];
  const pr = projectOnSegment(p, A, B);
  if (dist(pr.point, A) < 1e-4) return w.a;
  if (dist(pr.point, B) < 1e-4) return w.b;
  const nId = addNode(plan, pr.point);
  const cut = dist(A, pr.point);
  const w2: Wall = { ...w, id: uid('w'), a: nId, b: w.b };
  w.b = nId;
  plan.walls[w2.id] = w2;
  for (const op of Object.values(plan.openings)) {
    if (op.wallId === w.id && op.offset > cut) {
      op.wallId = w2.id;
      op.offset -= cut;
    }
  }
  return nId;
}

/** Retorna o nó no ponto: reaproveita um existente, divide uma parede que passa por ali ou cria um novo. */
export function resolvePoint(plan: Plan, p: Vec2): string {
  const existing = findNodeAt(plan, p);
  if (existing) return existing;
  for (const w of Object.values(plan.walls)) {
    const A = plan.nodes[w.a];
    const B = plan.nodes[w.b];
    const pr = projectOnSegment(p, A, B);
    if (pr.dist < 1e-5 && pr.t > 0 && pr.t < 1) return splitWall(plan, w.id, pr.point);
  }
  return addNode(plan, p);
}

/**
 * Adiciona uma parede de `from` até `to`, dividindo paredes cruzadas e encaixando
 * em nós/paredes existentes. Retorna os ids das paredes criadas.
 */
export function addWall(plan: Plan, from: Vec2, to: Vec2, props: WallProps): string[] {
  if (dist(from, to) < 0.01) return [];
  const aId = resolvePoint(plan, from);
  const bId = resolvePoint(plan, to);
  if (aId === bId) return [];
  const A = { ...plan.nodes[aId] };
  const B = { ...plan.nodes[bId] };

  const hits: { t: number; p: Vec2 }[] = [];
  for (const w of Object.values(plan.walls)) {
    if (w.a === aId || w.a === bId || w.b === aId || w.b === bId) continue;
    const si = segmentIntersection(A, B, plan.nodes[w.a], plan.nodes[w.b]);
    if (si && si.t > 1e-6 && si.t < 1 - 1e-6) hits.push({ t: si.t, p: si.point });
  }
  for (const n of Object.values(plan.nodes)) {
    if (n.id === aId || n.id === bId) continue;
    const pr = projectOnSegment(n, A, B);
    if (pr.dist < 1e-5 && pr.t > 1e-6 && pr.t < 1 - 1e-6) hits.push({ t: pr.t, p: { x: n.x, y: n.y } });
  }
  hits.sort((p, q) => p.t - q.t);

  const chain = [aId];
  for (const h of hits) {
    const id = resolvePoint(plan, h.p);
    if (id !== chain[chain.length - 1]) chain.push(id);
  }
  if (bId !== chain[chain.length - 1]) chain.push(bId);

  const created: string[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    if (wallBetween(plan, chain[i], chain[i + 1])) continue;
    const id = uid('w');
    plan.walls[id] = { id, a: chain[i], b: chain[i + 1], thickness: props.thickness, height: props.height };
    created.push(id);
  }
  return created;
}

export function removeWall(plan: Plan, wallId: string): void {
  const w = plan.walls[wallId];
  if (!w) return;
  delete plan.walls[wallId];
  for (const op of Object.values(plan.openings)) if (op.wallId === wallId) delete plan.openings[op.id];
  for (const n of [w.a, w.b]) if (wallsAtNode(plan, n).length === 0) delete plan.nodes[n];
}

export function moveNode(plan: Plan, nodeId: string, p: Vec2): void {
  const n = plan.nodes[nodeId];
  if (n) {
    n.x = p.x;
    n.y = p.y;
  }
  keepOpeningsInside(plan, nodeId);
}

/** Junta o nó `src` em `dst`, removendo paredes degeneradas ou duplicadas. */
export function mergeNodes(plan: Plan, src: string, dst: string): void {
  if (src === dst || !plan.nodes[src] || !plan.nodes[dst]) return;
  for (const w of Object.values(plan.walls)) {
    if (w.a === src) w.a = dst;
    if (w.b === src) w.b = dst;
  }
  delete plan.nodes[src];
  const seen = new Set<string>();
  for (const w of Object.values(plan.walls)) {
    const k = w.a < w.b ? `${w.a}|${w.b}` : `${w.b}|${w.a}`;
    if (w.a === w.b || seen.has(k)) removeWall(plan, w.id);
    else seen.add(k);
  }
}

/** Depois de mexer em um nó, mantém portas/janelas das paredes vizinhas dentro dos limites. */
function keepOpeningsInside(plan: Plan, nodeId: string) {
  for (const w of wallsAtNode(plan, nodeId)) {
    const L = dist(plan.nodes[w.a], plan.nodes[w.b]);
    for (const op of Object.values(plan.openings)) {
      if (op.wallId === w.id) op.offset = clampOpeningOffset(L, op.width, op.offset);
    }
  }
}

export function setWallLength(plan: Plan, wallId: string, length: number): void {
  const w = plan.walls[wallId];
  if (!w || length <= 0.05) return;
  const A = plan.nodes[w.a];
  const B = plan.nodes[w.b];
  const d = normalize(sub(B, A));
  moveNode(plan, w.b, add(A, mul(d, length)));
}

export function addOpening(
  plan: Plan,
  wallId: string,
  kind: OpeningKind,
  offset: number,
  overrides: Partial<Opening> = {},
): string | null {
  const w = plan.walls[wallId];
  if (!w) return null;
  const L = dist(plan.nodes[w.a], plan.nodes[w.b]);
  const base = { ...OPENING_DEFAULTS[kind], ...overrides };
  if (L < base.width + 0.2) return null;
  const id = uid(kind === 'door' ? 'd' : 'j');
  plan.openings[id] = {
    id,
    wallId,
    kind,
    flip: false,
    side: false,
    ...base,
    offset: clampOpeningOffset(L, base.width, offset),
  };
  return id;
}

/** Insere uma abertura na parede mais próxima do ponto (usado no exemplo e em testes). */
export function addOpeningAt(plan: Plan, p: Vec2, kind: OpeningKind, overrides: Partial<Opening> = {}): string | null {
  let best: { id: string; offset: number; d: number } | null = null;
  for (const w of Object.values(plan.walls)) {
    const A = plan.nodes[w.a];
    const B = plan.nodes[w.b];
    const pr = projectOnSegment(p, A, B);
    if (!best || pr.dist < best.d) best = { id: w.id, offset: pr.tc * dist(A, B), d: pr.dist };
  }
  return best ? addOpening(plan, best.id, kind, best.offset, overrides) : null;
}

export function addFurniture(
  plan: Plan,
  catalogId: string,
  p: Vec2,
  rotation = 0,
  overrides: Partial<FurnitureItem> = {},
): string | null {
  const item = CATALOG_BY_ID[catalogId];
  if (!item) return null;
  const id = uid('f');
  plan.furniture[id] = {
    id,
    catalogId,
    x: p.x,
    y: p.y,
    rotation,
    width: item.width,
    depth: item.depth,
    height: item.height,
    elevation: item.elevation ?? 0,
    ...overrides,
  };
  return id;
}

export function duplicateFurniture(plan: Plan, id: string): string | null {
  const f = plan.furniture[id];
  if (!f) return null;
  const nid = uid('f');
  plan.furniture[nid] = { ...f, id: nid, x: f.x + 0.3, y: f.y + 0.3 };
  return nid;
}

/** Cria ou atualiza o rótulo (nome/cor) do cômodo cujo centro é `center`. */
export function setRoomLabel(
  plan: Plan,
  labelId: string | undefined,
  center: Vec2,
  patch: { name?: string; floorColor?: string },
  defaults: { name: string; floorColor: string },
): string {
  if (labelId && plan.rooms[labelId]) {
    Object.assign(plan.rooms[labelId], patch);
    return labelId;
  }
  const id = uid('r');
  plan.rooms[id] = { id, x: center.x, y: center.y, ...defaults, ...patch };
  return id;
}

export function deleteSelection(plan: Plan, sel: Selection): void {
  if (!sel) return;
  switch (sel.kind) {
    case 'wall':
      removeWall(plan, sel.id);
      break;
    case 'node':
      for (const w of wallsAtNode(plan, sel.id)) removeWall(plan, w.id);
      delete plan.nodes[sel.id];
      break;
    case 'opening':
      delete plan.openings[sel.id];
      break;
    case 'furniture':
      delete plan.furniture[sel.id];
      break;
    case 'room':
      delete plan.rooms[sel.id];
      break;
  }
}

export function planBounds(plan: Plan): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const pts: Vec2[] = [...Object.values(plan.nodes), ...Object.values(plan.furniture)];
  if (pts.length === 0) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}
