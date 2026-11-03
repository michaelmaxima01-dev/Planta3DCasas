import type { Opening, Plan } from '../model/types';
import {
  type Vec2,
  add,
  dedupe,
  dist,
  dot,
  lerp,
  lineIntersection,
  mul,
  normalize,
  perp,
  signedArea,
  sub,
} from './vec';

export interface WallGeom {
  id: string;
  a: Vec2;
  b: Vec2;
  /** Direção unitária de a para b. */
  dir: Vec2;
  /** perp(dir). */
  normal: Vec2;
  length: number;
  thickness: number;
  height: number;
  /** Contorno da parede na planta, já com as junções resolvidas. */
  polygon: Vec2[];
}

interface EndRef {
  wallId: string;
  end: 'a' | 'b';
  /** Direção saindo do nó ao longo da parede. */
  dir: Vec2;
  half: number;
  angle: number;
}

/**
 * Calcula o contorno de todas as paredes resolvendo as junções (L, T, X e em ângulo).
 *
 * Em cada nó, as paredes que chegam são ordenadas pelo ângulo. Entre cada par vizinho,
 * o canto é a interseção da face "esquerda" de uma com a face "direita" da próxima (miter).
 * Ângulos muito agudos ou paredes alinhadas caem no ponto de deslocamento simples.
 */
export function computeWallGeometry(plan: Plan): Record<string, WallGeom> {
  const ends = new Map<string, EndRef[]>();
  const base: Record<string, Omit<WallGeom, 'polygon'>> = {};

  for (const w of Object.values(plan.walls)) {
    const A = plan.nodes[w.a];
    const B = plan.nodes[w.b];
    if (!A || !B) continue;
    const length = dist(A, B);
    if (length < 1e-6) continue;
    const dir = normalize(sub(B, A));
    base[w.id] = {
      id: w.id,
      a: { x: A.x, y: A.y },
      b: { x: B.x, y: B.y },
      dir,
      normal: perp(dir),
      length,
      thickness: w.thickness,
      height: w.height,
    };
    const back = mul(dir, -1);
    pushTo(ends, w.a, { wallId: w.id, end: 'a', dir, half: w.thickness / 2, angle: Math.atan2(dir.y, dir.x) });
    pushTo(ends, w.b, { wallId: w.id, end: 'b', dir: back, half: w.thickness / 2, angle: Math.atan2(back.y, back.x) });
  }

  const plus = new Map<string, Vec2>();
  const minus = new Map<string, Vec2>();
  const key = (r: EndRef) => `${r.wallId}:${r.end}`;

  for (const [nodeId, list] of ends) {
    const N = plan.nodes[nodeId];
    list.sort((p, q) => p.angle - q.angle);
    const k = list.length;
    if (k === 1) {
      const r = list[0];
      const n = perp(r.dir);
      plus.set(key(r), add(N, mul(n, r.half)));
      minus.set(key(r), sub(N, mul(n, r.half)));
      continue;
    }
    for (let i = 0; i < k; i++) {
      const cur = list[i];
      const next = list[(i + 1) % k];
      const pc = add(N, mul(perp(cur.dir), cur.half));
      const pn = sub(N, mul(perp(next.dir), next.half));
      let c = lineIntersection(pc, cur.dir, pn, next.dir);
      const limit = 6 * Math.max(cur.half, next.half);
      if (c && dist(c, N) > limit) c = null;
      plus.set(key(cur), c ?? pc);
      minus.set(key(next), c ?? pn);
    }
  }

  const out: Record<string, WallGeom> = {};
  for (const g of Object.values(base)) {
    const pa = plus.get(`${g.id}:a`)!;
    const ma = minus.get(`${g.id}:a`)!;
    const pb = plus.get(`${g.id}:b`)!;
    const mb = minus.get(`${g.id}:b`)!;
    out[g.id] = { ...g, polygon: dedupe([pa, mb, g.b, pb, ma, g.a]) };
  }
  return out;
}

function pushTo<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

/** Prisma vertical: contorno na planta extrudado de `bottom` até `top` (metros). */
export interface Prism {
  polygon: Vec2[];
  bottom: number;
  top: number;
}

/** Recorta um polígono mantendo a parte onde f(p) >= 0 (Sutherland–Hodgman). */
export function clipHalfPlane(poly: Vec2[], f: (p: Vec2) => number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) out.push(lerp(a, b, fa / (fa - fb)));
  }
  return out;
}

/**
 * Divide a parede em prismas para abrir vãos de portas/janelas sem operação booleana:
 * trechos cheios entre aberturas e, em cada abertura, o pedaço abaixo do peitoril e acima da verga.
 */
export function wallPrisms(g: WallGeom, openings: Opening[]): Prism[] {
  const u = (p: Vec2) => dot(sub(p, g.a), g.dir);
  const slab = (lo: number, hi: number) => {
    let r = g.polygon;
    if (lo > -Infinity) r = clipHalfPlane(r, (p) => u(p) - lo);
    if (hi < Infinity) r = clipHalfPlane(r, (p) => hi - u(p));
    r = dedupe(r);
    return r.length >= 3 && Math.abs(signedArea(r)) > 1e-8 ? r : null;
  };

  const H = g.height;
  const prisms: Prism[] = [];
  const push = (poly: Vec2[] | null, bottom: number, top: number) => {
    if (poly && top - bottom > 1e-4) prisms.push({ polygon: poly, bottom, top });
  };

  const sorted = [...openings].sort((p, q) => p.offset - q.offset);
  let cursor = -Infinity;
  for (const op of sorted) {
    const lo = Math.max(op.offset - op.width / 2, cursor === -Infinity ? -Infinity : cursor);
    const hi = op.offset + op.width / 2;
    if (hi <= lo) continue;
    if (lo > cursor) push(slab(cursor, lo), 0, H);
    const opening = slab(lo, hi);
    const head = Math.min(H, op.sill + op.height);
    push(opening, 0, Math.max(0, op.sill));
    push(opening, head, H);
    cursor = hi;
  }
  push(slab(cursor, Infinity), 0, H);
  return prisms;
}

/** Centro de uma abertura na planta. */
export function openingCenter(g: WallGeom, op: Opening): Vec2 {
  return add(g.a, mul(g.dir, op.offset));
}

/** Limita o deslocamento para a abertura caber na parede, longe das pontas. */
export function clampOpeningOffset(length: number, width: number, offset: number, margin = 0.1): number {
  const lo = width / 2 + margin;
  const hi = length - width / 2 - margin;
  if (lo > hi) return length / 2;
  return Math.min(hi, Math.max(lo, offset));
}

/** Partes cheias da parede vistas em planta (o vão de portas e janelas fica aberto). */
export function wallPlanPieces(g: WallGeom, openings: Opening[]): Vec2[][] {
  const u = (p: Vec2) => dot(sub(p, g.a), g.dir);
  const slab = (lo: number, hi: number) => {
    let r = g.polygon;
    if (lo > -Infinity) r = clipHalfPlane(r, (p) => u(p) - lo);
    if (hi < Infinity) r = clipHalfPlane(r, (p) => hi - u(p));
    r = dedupe(r);
    return r.length >= 3 && Math.abs(signedArea(r)) > 1e-8 ? r : null;
  };
  const out: Vec2[][] = [];
  let cursor = -Infinity;
  for (const op of [...openings].sort((p, q) => p.offset - q.offset)) {
    const lo = Math.max(op.offset - op.width / 2, cursor);
    const hi = op.offset + op.width / 2;
    if (hi <= lo) continue;
    const piece = lo > cursor ? slab(cursor, lo) : null;
    if (piece) out.push(piece);
    cursor = hi;
  }
  const last = slab(cursor, Infinity);
  if (last) out.push(last);
  return out;
}
