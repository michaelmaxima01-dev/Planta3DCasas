import type { Plan } from '../model/types';
import {
  type Vec2,
  add,
  angleOf,
  centroid,
  lineIntersection,
  mul,
  normalize,
  perimeter,
  perp,
  pointInPolygon,
  signedArea,
  sub,
} from './vec';

export const DEFAULT_FLOOR = '#d9c4a3';

export interface Room {
  /** id do rótulo, ou "face:..." quando o cômodo ainda não tem nome salvo. */
  id: string;
  labelId?: string;
  name: string;
  floorColor: string;
  /** Contorno pela linha central das paredes. */
  polygon: Vec2[];
  /** Contorno interno (descontando meia espessura de cada parede). */
  inner: Vec2[];
  /** Área útil (interna) em m². */
  area: number;
  perimeter: number;
  center: Vec2;
}

interface Adj {
  to: string;
  wallId: string;
  angle: number;
}

/**
 * Encontra as faces internas do grafo planar de paredes.
 * Em cada nó, segue sempre a aresta mais à esquerda: as faces internas saem com área positiva
 * e a face externa de cada grupo de paredes sai negativa (descartada).
 */
export function findFaces(plan: Plan): string[][] {
  const adj = new Map<string, Adj[]>();
  for (const w of Object.values(plan.walls)) {
    const A = plan.nodes[w.a];
    const B = plan.nodes[w.b];
    if (!A || !B || w.a === w.b) continue;
    push(adj, w.a, { to: w.b, wallId: w.id, angle: angleOf(sub(B, A)) });
    push(adj, w.b, { to: w.a, wallId: w.id, angle: angleOf(sub(A, B)) });
  }
  for (const list of adj.values()) list.sort((p, q) => p.angle - q.angle);

  const visited = new Set<string>();
  const hk = (from: string, e: Adj) => `${from}|${e.to}|${e.wallId}`;
  const faces: string[][] = [];

  for (const [start, list] of adj) {
    for (const first of list) {
      if (visited.has(hk(start, first))) continue;
      const nodes: string[] = [];
      let from = start;
      let cur = first;
      for (let guard = 0; guard < 100000; guard++) {
        const k = hk(from, cur);
        if (visited.has(k)) break;
        visited.add(k);
        nodes.push(from);
        const there = adj.get(cur.to)!;
        const idx = there.findIndex((x) => x.to === from && x.wallId === cur.wallId);
        const nxt = there[(idx - 1 + there.length) % there.length];
        from = cur.to;
        cur = nxt;
      }
      const clean = removeSpikes(nodes);
      if (clean.length < 3) continue;
      const area = signedArea(clean.map((id) => plan.nodes[id]));
      if (area > 1e-4) faces.push(clean);
    }
  }
  return faces;
}

/** Remove "espinhos" causados por paredes soltas dentro do cômodo (sequências A, B, A). */
function removeSpikes(nodes: string[]): string[] {
  let cur = nodes;
  let changed = true;
  while (changed && cur.length >= 3) {
    changed = false;
    const n = cur.length;
    for (let i = 0; i < n; i++) {
      if (cur[(i - 1 + n) % n] === cur[(i + 1) % n]) {
        const j = (i + 1) % n;
        cur = cur.filter((_, k) => k !== i && k !== j);
        changed = true;
        break;
      }
    }
  }
  return cur;
}

/** Desloca cada aresta para dentro (polígono com área positiva) pela distância indicada. */
export function insetPolygon(pts: Vec2[], dists: number[]): Vec2[] {
  const n = pts.length;
  const lines = pts.map((p, i) => {
    const d = normalize(sub(pts[(i + 1) % n], p));
    return { p: add(p, mul(perp(d), dists[i])), d };
  });
  return pts.map((p, i) => {
    const prev = lines[(i - 1 + n) % n];
    const line = lines[i];
    return lineIntersection(prev.p, prev.d, line.p, line.d) ?? add(p, mul(perp(line.d), dists[i]));
  });
}

export function detectRooms(plan: Plan): Room[] {
  const thick = new Map<string, number>();
  for (const w of Object.values(plan.walls)) {
    const k = pairKey(w.a, w.b);
    thick.set(k, Math.max(thick.get(k) ?? 0, w.thickness));
  }
  const labels = Object.values(plan.rooms);
  const used = new Set<string>();

  return findFaces(plan).map((ids) => {
    const polygon = ids.map((id) => ({ x: plan.nodes[id].x, y: plan.nodes[id].y }));
    const dists = ids.map((id, i) => (thick.get(pairKey(id, ids[(i + 1) % ids.length])) ?? 0) / 2);
    const inner = insetPolygon(polygon, dists);
    const innerArea = signedArea(inner);
    const useInner = innerArea > 0;
    const label = labels.find((l) => !used.has(l.id) && pointInPolygon(l, polygon));
    if (label) used.add(label.id);
    const shape = useInner ? inner : polygon;
    let center = centroid(shape);
    if (!pointInPolygon(center, shape) && label) center = { x: label.x, y: label.y };
    return {
      id: label?.id ?? `face:${[...ids].sort().join(',')}`,
      labelId: label?.id,
      name: label?.name ?? 'Cômodo',
      floorColor: label?.floorColor ?? DEFAULT_FLOOR,
      polygon,
      inner: shape,
      area: Math.abs(signedArea(shape)),
      perimeter: perimeter(shape),
      center,
    };
  });
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}
