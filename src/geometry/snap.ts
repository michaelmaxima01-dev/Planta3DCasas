import type { Plan } from '../model/types';
import type { WallGeom } from './walls';
import { type Vec2, add, angleOf, dist, fromAngle, len, mul, normalize, projectOnSegment, sub } from './vec';

export interface SnapResult {
  point: Vec2;
  /** Encaixou em um nó existente. */
  nodeId?: string;
  /** Encaixou no meio de uma parede existente. */
  wallId?: string;
  /** Linhas-guia de alinhamento para desenhar (pares de pontos). */
  guides: [Vec2, Vec2][];
  angleSnapped?: boolean;
}

export interface SnapOptions {
  /** Escala atual da vista (pixels por metro), usada para a tolerância em pixels. */
  pxPerMeter: number;
  /** Ponto inicial do segmento sendo desenhado (ativa o encaixe de ângulo). */
  anchor?: Vec2 | null;
  /** Nós ignorados (ex.: o próprio nó sendo arrastado). */
  exclude?: Set<string>;
  grid?: number;
  disabled?: boolean;
}

const ANGLE_STEP = Math.PI / 4;
/** Arredonda para a grade sem deixar resíduo de ponto flutuante (ex.: 1.6500000000000001). */
export const roundTo = (v: number, step: number) => Math.round(Math.round(v / step) * step * 1e6) / 1e6;
const ANGLE_TOL = (7 * Math.PI) / 180;

/**
 * Prioridade: nó existente > meio de parede > ângulo de 45° a partir da âncora >
 * alinhamento horizontal/vertical com outros nós > grade.
 */
export function snapPoint(plan: Plan, raw: Vec2, o: SnapOptions): SnapResult {
  if (o.disabled) return { point: raw, guides: [] };
  const grid = o.grid ?? 0.05;
  const tolNode = 12 / o.pxPerMeter;
  const tolWall = 8 / o.pxPerMeter;
  const exclude = o.exclude ?? new Set<string>();
  const nodes = Object.values(plan.nodes).filter((n) => !exclude.has(n.id));

  let bestNode: (typeof nodes)[number] | null = null;
  let bestD = tolNode;
  for (const n of nodes) {
    const d = dist(raw, n);
    if (d < bestD) {
      bestD = d;
      bestNode = n;
    }
  }
  if (bestNode) return { point: { x: bestNode.x, y: bestNode.y }, nodeId: bestNode.id, guides: [] };

  let wallHit: { id: string; point: Vec2 } | null = null;
  let bestW = tolWall;
  for (const w of Object.values(plan.walls)) {
    if (exclude.has(w.a) || exclude.has(w.b)) continue;
    const A = plan.nodes[w.a];
    const B = plan.nodes[w.b];
    if (!A || !B) continue;
    const pr = projectOnSegment(raw, A, B);
    if (pr.t > 0.001 && pr.t < 0.999 && pr.dist < bestW) {
      bestW = pr.dist;
      wallHit = { id: w.id, point: pr.point };
    }
  }
  if (wallHit) return { point: wallHit.point, wallId: wallHit.id, guides: [] };

  let p = { ...raw };
  const guides: [Vec2, Vec2][] = [];

  if (o.anchor) {
    const dv = sub(p, o.anchor);
    const L = len(dv);
    if (L > 1e-6) {
      const ang = angleOf(dv);
      const snapped = Math.round(ang / ANGLE_STEP) * ANGLE_STEP;
      if (Math.abs(ang - snapped) < ANGLE_TOL) {
        const Lr = Math.max(grid, roundTo(L, grid));
        p = add(o.anchor, mul(fromAngle(snapped), Lr));
        return { point: p, guides, angleSnapped: true };
      }
    }
  }

  let ax: { v: number; from: Vec2 } | null = null;
  let ay: { v: number; from: Vec2 } | null = null;
  let dx = tolNode;
  let dy = tolNode;
  for (const n of nodes) {
    if (Math.abs(p.x - n.x) < dx) {
      dx = Math.abs(p.x - n.x);
      ax = { v: n.x, from: n };
    }
    if (Math.abs(p.y - n.y) < dy) {
      dy = Math.abs(p.y - n.y);
      ay = { v: n.y, from: n };
    }
  }
  p = {
    x: ax ? ax.v : roundTo(p.x, grid),
    y: ay ? ay.v : roundTo(p.y, grid),
  };
  if (ax) guides.push([{ x: ax.from.x, y: ax.from.y }, p]);
  if (ay) guides.push([{ x: ay.from.x, y: ay.from.y }, p]);
  return { point: p, guides };
}

/**
 * Encosta um móvel na parede mais próxima: gira para ficar de costas para a parede
 * e posiciona rente à face dela. Retorna null se nenhuma parede estiver perto.
 */
export function snapFurnitureToWall(
  walls: WallGeom[],
  p: Vec2,
  depth: number,
  tolerance = 0.3,
): { pos: Vec2; rotation: number } | null {
  let best: { pos: Vec2; rotation: number; score: number } | null = null;
  for (const g of walls) {
    const pr = projectOnSegment(p, g.a, g.b);
    if (pr.t < 0 || pr.t > 1 || pr.dist < 1e-6) continue;
    const m = normalize(sub(p, pr.point));
    const ideal = g.thickness / 2 + depth / 2;
    const gap = Math.abs(pr.dist - ideal);
    if (gap > tolerance) continue;
    if (!best || gap < best.score) {
      best = {
        pos: add(pr.point, mul(m, ideal + 0.005)),
        rotation: Math.atan2(-m.x, m.y),
        score: gap,
      };
    }
  }
  return best ? { pos: best.pos, rotation: best.rotation } : null;
}
