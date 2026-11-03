import { type Vec2, cross, dist, dot, normalize, sub } from '../geometry/vec';
import type { Plan } from '../model/types';

/** Comprimento da sobreposição de [a2,b2] sobre a reta de [a1,b1], se forem colineares (tolerância em m). */
export function collinearOverlap(a1: Vec2, b1: Vec2, a2: Vec2, b2: Vec2, tol = 0.06): number {
  const L = dist(a1, b1);
  if (L < 1e-6) return 0;
  const d = normalize(sub(b1, a1));
  const off = (p: Vec2) => Math.abs(cross(d, sub(p, a1)));
  if (off(a2) > tol || off(b2) > tol) return 0;
  const t1 = dot(sub(a2, a1), d);
  const t2 = dot(sub(b2, a1), d);
  return Math.max(0, Math.min(L, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)));
}

/** Distância de p ao segmento ab e parâmetro t (0..1). */
export function onSegment(p: Vec2, a: Vec2, b: Vec2) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < 1e-12 ? 0 : dot(sub(p, a), ab) / l2;
  const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return { t, dist: dist(p, q) };
}

export interface WallLine {
  a: Vec2;
  b: Vec2;
  wallIds: string[];
}

/**
 * Junta paredes colineares ligadas por nós "de passagem" (grau 2, sem mudança de direção)
 * em linhas retas contínuas — é ao longo delas que correm as vigas.
 */
export function wallLines(plan: Plan, breakAt: (nodeId: string) => boolean = () => false): WallLine[] {
  const walls = Object.values(plan.walls).filter((w) => plan.nodes[w.a] && plan.nodes[w.b] && w.a !== w.b);
  const byNode = new Map<string, string[]>();
  for (const w of walls) {
    byNode.set(w.a, [...(byNode.get(w.a) ?? []), w.id]);
    byNode.set(w.b, [...(byNode.get(w.b) ?? []), w.id]);
  }
  const parent = new Map(walls.map((w) => [w.id, w.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const [nodeId, ids] of byNode) {
    if (ids.length !== 2 || breakAt(nodeId)) continue;
    const [w1, w2] = ids.map((id) => plan.walls[id]);
    const d1 = normalize(sub(plan.nodes[w1.b], plan.nodes[w1.a]));
    const d2 = normalize(sub(plan.nodes[w2.b], plan.nodes[w2.a]));
    if (Math.abs(cross(d1, d2)) < 0.02) parent.set(find(w1.id), find(w2.id));
  }
  const groups = new Map<string, string[]>();
  for (const w of walls) groups.set(find(w.id), [...(groups.get(find(w.id)) ?? []), w.id]);
  return [...groups.values()].map((ids) => {
    const w0 = plan.walls[ids[0]];
    const o = plan.nodes[w0.a];
    const d = normalize(sub(plan.nodes[w0.b], o));
    let lo = Infinity;
    let hi = -Infinity;
    for (const id of ids) {
      for (const n of [plan.walls[id].a, plan.walls[id].b]) {
        const t = dot(sub(plan.nodes[n], o), d);
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    }
    return { a: { x: o.x + d.x * lo, y: o.y + d.y * lo }, b: { x: o.x + d.x * hi, y: o.y + d.y * hi }, wallIds: ids };
  });
}

/** Nós onde obrigatoriamente vai pilar: pontas soltas, encontros (T, X) e mudanças de direção. */
export function cornerNodes(plan: Plan): Vec2[] {
  const deg = new Map<string, string[]>();
  for (const w of Object.values(plan.walls)) {
    deg.set(w.a, [...(deg.get(w.a) ?? []), w.id]);
    deg.set(w.b, [...(deg.get(w.b) ?? []), w.id]);
  }
  const out: Vec2[] = [];
  for (const [nodeId, ids] of deg) {
    const n = plan.nodes[nodeId];
    if (!n) continue;
    if (ids.length !== 2) {
      out.push({ x: n.x, y: n.y });
      continue;
    }
    const [w1, w2] = ids.map((id) => plan.walls[id]);
    const d1 = normalize(sub(plan.nodes[w1.b], plan.nodes[w1.a]));
    const d2 = normalize(sub(plan.nodes[w2.b], plan.nodes[w2.a]));
    if (Math.abs(cross(d1, d2)) > 0.17) out.push({ x: n.x, y: n.y });
  }
  return out;
}
