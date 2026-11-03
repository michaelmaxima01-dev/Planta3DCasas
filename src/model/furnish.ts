/**
 * Tipos de cômodo e mobília automática: cada tipo tem uma lista de móveis com regra de posição
 * (encostado na parede, no centro, ao lado de outro, em frente, ao redor da mesa…).
 */
import { CATALOG_BY_ID } from '../catalog/catalog';
import type { Room } from '../geometry/rooms';
import { type Vec2, add, centroid, dist, mul, normalize, perp, pointInPolygon, sub } from '../geometry/vec';
import { computeWallGeometry, openingCenter } from '../geometry/walls';
import { addFurniture } from './ops';
import { stairRect } from './stairs';
import type { FurnitureItem, Plan } from './types';

type Place =
  | { kind: 'wall'; prefer: 'center' | 'end' }
  | { kind: 'opposite'; ref: number }
  | { kind: 'center' }
  | { kind: 'beside'; ref: number }
  | { kind: 'front'; ref: number; gap: number; facing?: boolean }
  | { kind: 'around'; ref: number }
  | { kind: 'under'; ref: number };

interface Spec {
  id: string;
  place: Place;
}

export interface RoomType {
  key: string;
  name: string;
  color: string;
  items: Spec[];
}

const W = (id: string, prefer: 'center' | 'end' = 'end'): Spec => ({ id, place: { kind: 'wall', prefer } });

export const ROOM_TYPES: RoomType[] = [
  {
    key: 'sala', name: 'Sala de estar', color: '#d9c4a3',
    items: [W('sofa3', 'center'), { id: 'tv_rack', place: { kind: 'opposite', ref: 0 } }, { id: 'coffee_table', place: { kind: 'front', ref: 0, gap: 0.45 } }, { id: 'rug', place: { kind: 'under', ref: 2 } }, W('armchair'), W('floor_lamp'), W('plant')],
  },
  {
    key: 'cozinha', name: 'Cozinha', color: '#ece7df',
    items: [W('kitchen_counter'), W('stove'), W('fridge'), { id: 'dining_table', place: { kind: 'center' } }, { id: 'chair', place: { kind: 'around', ref: 3 } }],
  },
  {
    key: 'jantar', name: 'Sala de jantar', color: '#d9c4a3',
    items: [{ id: 'dining_table', place: { kind: 'center' } }, { id: 'chair', place: { kind: 'around', ref: 0 } }, W('sideboard', 'center'), W('plant')],
  },
  {
    key: 'suite', name: 'Quarto de casal / suíte', color: '#c8a77f',
    items: [W('double_bed', 'center'), { id: 'nightstand', place: { kind: 'beside', ref: 0 } }, W('wardrobe'), W('dresser')],
  },
  {
    key: 'quarto', name: 'Quarto de solteiro', color: '#c8a77f',
    items: [W('single_bed'), W('desk', 'center'), { id: 'office_chair', place: { kind: 'front', ref: 1, gap: 0.1, facing: true } }, W('wardrobe')],
  },
  {
    key: 'infantil', name: 'Quarto infantil', color: '#e6d3b3',
    items: [W('crib'), W('dresser'), W('wardrobe'), W('pouf')],
  },
  {
    key: 'banheiro', name: 'Banheiro', color: '#cfd8dc',
    items: [W('shower'), W('toilet'), W('bath_sink')],
  },
  {
    key: 'lavabo', name: 'Lavabo', color: '#cfd8dc',
    items: [W('toilet'), W('bath_sink')],
  },
  {
    key: 'lavanderia', name: 'Lavanderia', color: '#cfd8dc',
    items: [W('laundry_sink'), W('washing_machine'), W('dryer'), W('clothesline')],
  },
  {
    key: 'escritorio', name: 'Escritório', color: '#c8a77f',
    items: [W('desk', 'center'), { id: 'office_chair', place: { kind: 'front', ref: 0, gap: 0.1, facing: true } }, W('tall_bookcase'), W('file_cabinet')],
  },
  {
    key: 'garagem', name: 'Garagem', color: '#a7a9ac',
    items: [{ id: 'car', place: { kind: 'center' } }, W('shoe_rack')],
  },
  {
    key: 'varanda', name: 'Varanda / área externa', color: '#b9c4b0',
    items: [{ id: 'patio_set', place: { kind: 'center' } }, W('lounger'), W('plant')],
  },
  { key: 'circulacao', name: 'Circulação / hall', color: '#ece7df', items: [W('plant')] },
];

const rectOf = (f: Pick<FurnitureItem, 'x' | 'y' | 'width' | 'depth' | 'rotation'>) => stairRect(f as FurnitureItem);

/** Sobreposição de dois retângulos girados (teorema do eixo separador). */
function overlaps(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const axis = { x: -(q.y - p.y), y: q.x - p.x };
      const proj = (pts: Vec2[]) => pts.map((v) => v.x * axis.x + v.y * axis.y);
      const pa = proj(a);
      const pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
    }
  }
  return true;
}

function distToPolygon(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const ab = sub(poly[(i + 1) % poly.length], a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
    best = Math.min(best, dist(p, add(a, mul(ab, t))));
  }
  return best;
}

/**
 * Mobilia um cômodo com os itens do tipo escolhido. Não sobrepõe móveis existentes,
 * não bloqueia portas e mantém tudo dentro do cômodo. Retorna quantos itens foram colocados.
 */
export function furnishRoom(plan: Plan, room: Room, typeKey: string): { placed: number; skipped: string[] } {
  const type = ROOM_TYPES.find((t) => t.key === typeKey);
  if (!type) return { placed: 0, skipped: [] };
  const inner = room.inner;
  const geoms = computeWallGeometry(plan);
  const doors = Object.values(plan.openings)
    .filter((o) => (o.kind === 'door' || o.sill < 0.3) && geoms[o.wallId])
    .map((o) => ({ c: openingCenter(geoms[o.wallId], o), w: o.width }));
  const occupied = (skip?: string) =>
    Object.values(plan.furniture)
      .filter((f) => f.id !== skip && (CATALOG_BY_ID[f.catalogId]?.elevation ?? 0) < 1.2 && f.catalogId !== 'rug')
      .map(rectOf);
  const fits = (f: Pick<FurnitureItem, 'x' | 'y' | 'width' | 'depth' | 'rotation'>, ignoreOverlap = false, skip?: string) => {
    const r = rectOf(f);
    if (!r.every((q) => pointInPolygon(q, inner) || distToPolygon(q, inner) < 0.02)) return false;
    if (doors.some((d) => distToPolygon(d.c, r) < d.w / 2 + 0.55)) return false;
    if (!ignoreOverlap && occupied(skip).some((o) => overlaps(o, r))) return false;
    return true;
  };
  const placed: (FurnitureItem | null)[] = [];
  const skipped: string[] = [];
  const put = (id: string, pos: Vec2, rotation: number) => {
    const fid = addFurniture(plan, id, pos, rotation);
    return fid ? plan.furniture[fid] : null;
  };
  const edges = inner.map((a, i) => ({ a, b: inner[(i + 1) % inner.length] })).sort((p, q) => dist(q.a, q.b) - dist(p.a, p.b));

  const wallSpot = (item: { width: number; depth: number }, prefer: 'center' | 'end', onlyNormal?: Vec2) => {
    let best: { pos: Vec2; rot: number; score: number } | null = null;
    edges.forEach((e, ei) => {
      const L = dist(e.a, e.b);
      if (L < item.width + 0.05) return;
      const d = normalize(sub(e.b, e.a));
      const n = perp(d); // para dentro (polígono no sentido positivo)
      if (onlyNormal && n.x * onlyNormal.x + n.y * onlyNormal.y > -0.9) return;
      for (let t = item.width / 2 + 0.02; t <= L - item.width / 2 - 0.02 + 1e-6; t += 0.1) {
        const pos = add(add(e.a, mul(d, t)), mul(n, item.depth / 2 + 0.01));
        const rot = Math.atan2(-n.x, n.y);
        if (!fits({ x: pos.x, y: pos.y, width: item.width, depth: item.depth, rotation: rot })) continue;
        const score = (prefer === 'center' ? Math.abs(t - L / 2) : Math.min(t, L - t)) + ei * 0.5;
        if (!best || score < best.score) best = { pos, rot, score };
      }
    });
    return best as { pos: Vec2; rot: number } | null;
  };

  for (const spec of type.items) {
    const item = CATALOG_BY_ID[spec.id];
    if (!item) continue;
    const pl = spec.place;
    const ref = 'ref' in pl ? placed[pl.ref] : null;
    if ('ref' in pl && !ref) {
      placed.push(null);
      skipped.push(item.name);
      continue;
    }
    let result: FurnitureItem | null = null;
    const local = (r: FurnitureItem, u: number, v: number) => ({ x: r.x + u * Math.cos(r.rotation) - v * Math.sin(r.rotation), y: r.y + u * Math.sin(r.rotation) + v * Math.cos(r.rotation) });
    if (pl.kind === 'wall' || pl.kind === 'opposite') {
      const front = ref ? { x: -Math.sin(ref.rotation), y: Math.cos(ref.rotation) } : undefined;
      const spot = wallSpot(item, pl.kind === 'wall' ? pl.prefer : 'center', pl.kind === 'opposite' ? front : undefined) ?? (pl.kind === 'opposite' ? wallSpot(item, 'center') : null);
      if (spot) result = put(spec.id, spot.pos, spot.rot);
    } else if (pl.kind === 'center') {
      const c = centroid(inner);
      const e0 = edges[0];
      const rot = Math.atan2(e0.b.y - e0.a.y, e0.b.x - e0.a.x);
      if (fits({ x: c.x, y: c.y, width: item.width, depth: item.depth, rotation: rot })) result = put(spec.id, c, rot);
    } else if (pl.kind === 'under' && ref) {
      if (fits({ x: ref.x, y: ref.y, width: item.width, depth: item.depth, rotation: ref.rotation }, true)) result = put(spec.id, ref, ref.rotation);
    } else if (pl.kind === 'front' && ref) {
      const pos = local(ref, 0, ref.depth / 2 + pl.gap + item.depth / 2);
      const rot = ref.rotation + (pl.facing ? Math.PI : 0);
      if (fits({ ...pos, width: item.width, depth: item.depth, rotation: rot }, false, ref.id)) result = put(spec.id, pos, rot);
    } else if (pl.kind === 'beside' && ref) {
      let count = 0;
      for (const s of [-1, 1]) {
        const pos = local(ref, s * (ref.width / 2 + item.width / 2 + 0.03), -ref.depth / 2 + item.depth / 2);
        if (fits({ ...pos, width: item.width, depth: item.depth, rotation: ref.rotation })) {
          result = put(spec.id, pos, ref.rotation);
          count++;
        }
      }
      if (!count) result = null;
    } else if (pl.kind === 'around' && ref) {
      const xs = ref.width >= 1.2 ? [-ref.width / 4, ref.width / 4] : [0];
      let count = 0;
      for (const side of [-1, 1]) {
        for (const u of xs) {
          const pos = local(ref, u, side * (ref.depth / 2 + item.depth / 2 - 0.08));
          const rot = ref.rotation + (side < 0 ? 0 : Math.PI);
          if (fits({ ...pos, width: item.width, depth: item.depth, rotation: rot }, false, ref.id)) {
            result = put(spec.id, pos, rot);
            count++;
          }
        }
      }
      if (!count) result = null;
    }
    placed.push(result);
    if (!result) skipped.push(item.name);
  }
  return { placed: placed.filter(Boolean).length, skipped };
}
