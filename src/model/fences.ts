/**
 * Muros, cercas e portões. Cada trecho é um item do catálogo marcado como `fence`, com largura igual
 * ao comprimento do trecho e rotação igual à direção — assim selecionar, arrastar, esticar pelas alças,
 * 3D e exportação funcionam como nos demais objetos.
 */
import { CATALOG_BY_ID } from '../catalog/catalog';
import { type Vec2, dist } from '../geometry/vec';
import { addFurniture } from './ops';
import type { FurnitureItem, Plan } from './types';

export const isFence = (f: Pick<FurnitureItem, 'catalogId'>) => !!CATALOG_BY_ID[f.catalogId]?.fence;
export const isGate = (f: Pick<FurnitureItem, 'catalogId'>) => !!CATALOG_BY_ID[f.catalogId]?.gate;

/** Pontas do trecho (eixo). */
export function fenceEnds(f: Pick<FurnitureItem, 'x' | 'y' | 'rotation' | 'width'>): [Vec2, Vec2] {
  const c = Math.cos(f.rotation) * (f.width / 2);
  const s = Math.sin(f.rotation) * (f.width / 2);
  return [
    { x: f.x - c, y: f.y - s },
    { x: f.x + c, y: f.y + s },
  ];
}

/** Pontas de todos os muros/cercas/portões do andar (para encaixe ao desenhar). */
export function fencePoints(plan: Plan): Vec2[] {
  return Object.values(plan.furniture)
    .filter((f) => isFence(f) || isGate(f))
    .flatMap(fenceEnds);
}

/** Cria um trecho de muro/cerca do tipo indicado entre a e b. */
export function addFenceSegment(plan: Plan, type: string, a: Vec2, b: Vec2, height?: number): string | null {
  const L = dist(a, b);
  if (L < 0.05 || !CATALOG_BY_ID[type]) return null;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const rot = Math.atan2(b.y - a.y, b.x - a.x);
  return addFurniture(plan, type, mid, rot, { width: L, ...(height ? { height } : {}) });
}

/** Trecho de muro mais próximo do ponto (até `tol` metros do eixo). */
export function fenceAt(plan: Plan, p: Vec2, tol = 0.6): { f: FurnitureItem; t: number } | null {
  let best: { f: FurnitureItem; t: number; d: number } | null = null;
  for (const f of Object.values(plan.furniture)) {
    if (!isFence(f)) continue;
    const ux = Math.cos(f.rotation);
    const uy = Math.sin(f.rotation);
    const t = (p.x - f.x) * ux + (p.y - f.y) * uy;
    const n = Math.abs(-(p.x - f.x) * uy + (p.y - f.y) * ux);
    if (Math.abs(t) > f.width / 2 + 0.05 || n > tol) continue;
    if (!best || n < best.d) best = { f, t, d: n };
  }
  return best ? { f: best.f, t: best.t } : null;
}

/**
 * Coloca um portão sobre o muro mais próximo: alinha o portão ao trecho e corta o muro
 * nos dois lados do vão. Sem muro por perto, coloca o portão solto. Retorna o id do portão.
 */
export function insertGate(plan: Plan, gateType: string, p: Vec2, rotation = 0, width?: number): string | null {
  const item = CATALOG_BY_ID[gateType];
  if (!item) return null;
  const gw = width ?? item.width;
  const hit = fenceAt(plan, p);
  if (!hit) return addFurniture(plan, gateType, p, rotation, { width: gw });
  const f = hit.f;
  const [a, b] = fenceEnds(f);
  const L = f.width;
  const ux = Math.cos(f.rotation);
  const uy = Math.sin(f.rotation);
  // posição do vão ao longo do trecho (0..L a partir de a), mantendo o portão dentro do trecho
  const s = Math.max(gw / 2, Math.min(L - gw / 2, hit.t + L / 2));
  const at = (d: number) => ({ x: a.x + ux * d, y: a.y + uy * d });
  const { catalogId, height } = f;
  delete plan.furniture[f.id];
  if (s - gw / 2 > 0.05) addFenceSegment(plan, catalogId, a, at(s - gw / 2), height);
  if (L - (s + gw / 2) > 0.05) addFenceSegment(plan, catalogId, at(s + gw / 2), b, height);
  return addFurniture(plan, gateType, at(s), f.rotation, { width: Math.min(gw, L) });
}
