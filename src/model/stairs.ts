/**
 * Escadas entre pavimentos: dimensionamento (fórmula de Blondel), posicionamento automático
 * e vão (abertura) na laje do pavimento de cima.
 */
import { CATALOG_BY_ID } from '../catalog/catalog';
import { detectRooms } from '../geometry/rooms';
import { type Vec2, add, dist, mul, normalize, perp, pointInPolygon, sub } from '../geometry/vec';
import { computeWallGeometry, openingCenter } from '../geometry/walls';
import { addFurniture } from './ops';
import type { Building, FurnitureItem, Plan } from './types';

export const STAIR_ID = 'stair';
export const STAIR_WIDTH = 0.9;

/** Degraus pela fórmula de Blondel: 2·espelho + piso ≈ 64 cm, espelho ≤ 18,5 cm, piso 25 a 30 cm. */
export function stairDims(height: number) {
  const steps = Math.max(2, Math.ceil(height / 0.185));
  const rise = height / steps;
  const tread = Math.max(0.25, Math.min(0.3, 0.64 - 2 * rise));
  return { steps, rise, tread, depth: Math.round(steps * tread * 100) / 100 };
}

export const isStair = (f: FurnitureItem) => f.catalogId === STAIR_ID;

/** Contorno da escada na planta (retângulo girado). */
export function stairRect(f: FurnitureItem): Vec2[] {
  const c = Math.cos(f.rotation);
  const s = Math.sin(f.rotation);
  return [
    [-f.width / 2, -f.depth / 2],
    [f.width / 2, -f.depth / 2],
    [f.width / 2, f.depth / 2],
    [-f.width / 2, f.depth / 2],
  ].map(([u, v]) => ({ x: f.x + u * c - v * s, y: f.y + u * s + v * c }));
}

/** Lado de chegada da escada no pavimento de cima (fim do lance, lado -z local). */
export function stairArrivalEdge(f: FurnitureItem): [Vec2, Vec2] {
  const r = stairRect(f);
  return [r[0], r[1]];
}

/** Vãos no piso do pavimento `index` (escadas do pavimento de baixo). */
export function floorHoles(b: Building, index: number): FurnitureItem[] {
  if (index <= 0) return [];
  return Object.values(b.levels[index - 1].plan.furniture).filter(isStair);
}

/** Móveis que ficariam embaixo da escada (ignora tapetes e luminárias de teto). */
function conflicts(plan: Plan, rect: Vec2[]): string[] {
  const names: string[] = [];
  for (const f of Object.values(plan.furniture)) {
    const item = CATALOG_BY_ID[f.catalogId];
    if (!item || (item.elevation ?? 0) > 1.5 || f.catalogId === 'rug') continue;
    const fr = Math.min(f.width, f.depth) / 2;
    if (pointInPolygon(f, rect) || distToPolygon(f, rect) < fr * 0.8) names.push(isStair(f) ? 'outra escada' : item.name);
  }
  return names;
}

function distToPolygon(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ab = sub(b, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
    best = Math.min(best, dist(p, add(a, mul(ab, t))));
  }
  return best;
}

/**
 * Coloca a escada encostada numa parede do maior cômodo seco, nunca na frente de portas,
 * escolhendo a posição com menos móveis no caminho. Retorna o id e uma mensagem para o usuário.
 */
export function placeStairAuto(plan: Plan, height: number): { id: string | null; message: string } {
  const dims = stairDims(height);
  const { depth } = dims;
  const geoms = computeWallGeometry(plan);
  const doors = Object.values(plan.openings)
    .filter((o) => o.kind === 'door' && geoms[o.wallId])
    .map((o) => ({ c: openingCenter(geoms[o.wallId], o), w: o.width }));
  const rooms = detectRooms(plan)
    .filter((r) => !/banh|lavabo|wc|servi/i.test(r.name))
    .sort((a, b) => b.area - a.area);

  let best: { f: FurnitureItem; room: string; clash: string[]; score: number } | null = null;
  rooms.forEach((room, ri) => {
    const pts = room.inner;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const L = dist(a, b);
      if (L < depth + 0.3) continue;
      const d = normalize(sub(b, a));
      const n = perp(d); // para dentro do cômodo
      for (let t = 0.15 + depth / 2; t <= L - 0.15 - depth / 2 + 1e-6; t += 0.25) {
        const center = add(add(a, mul(d, t)), mul(n, STAIR_WIDTH / 2 + 0.01));
        const f: FurnitureItem = { id: '', catalogId: STAIR_ID, x: center.x, y: center.y, rotation: Math.atan2(d.y, d.x) + Math.PI / 2, width: STAIR_WIDTH, depth, height, elevation: 0 };
        const rect = stairRect(f);
        if (!rect.every((p) => pointInPolygon(p, room.polygon))) continue;
        if (doors.some((o) => distToPolygon(o.c, rect) < o.w / 2 + 0.5)) continue;
        const clash = conflicts(plan, rect);
        const score = clash.length * 10 + ri * 3 + Math.abs(t - L / 2) * 0.01;
        if (!best || score < best.score) best = { f, room: room.name, clash, score };
      }
    }
  });
  const desc = `${dims.steps} degraus de ${(dims.rise * 100).toFixed(1).replace('.', ',')} cm, ${depth.toFixed(2).replace('.', ',')} m de comprimento`;
  if (best) {
    const b2 = best as { f: FurnitureItem; room: string; clash: string[] };
    const id = addFurniture(plan, STAIR_ID, b2.f, b2.f.rotation, { width: STAIR_WIDTH, depth, height });
    const extra = b2.clash.length ? ` Atenção: mova ${[...new Set(b2.clash)].join(', ')}, que ficou no caminho.` : '';
    return { id, message: `Escada criada em "${b2.room}" (${desc}).${extra}` };
  }
  const big = rooms[0];
  if (big) {
    const id = addFurniture(plan, STAIR_ID, big.center, 0, { width: STAIR_WIDTH, depth, height });
    return { id, message: `Nenhuma parede comporta a escada (${desc}): ela foi colocada no centro de "${big.name}". Arraste para o lugar certo.` };
  }
  return { id: null, message: 'Não há cômodo fechado no andar de baixo para colocar a escada.' };
}

/** Mantém a altura das escadas igual à altura piso a piso do pavimento. */
export function syncStairHeights(b: Building) {
  for (const l of b.levels) {
    for (const f of Object.values(l.plan.furniture)) {
      if (isStair(f) && Math.abs(f.height - l.height) > 1e-6) {
        f.height = l.height;
        f.depth = Math.max(f.depth, stairDims(l.height).depth * 0.8);
      }
    }
  }
}
