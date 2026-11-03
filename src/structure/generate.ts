/**
 * Lançamento automático da estrutura (concepção estrutural):
 * pilares nos cantos/encontros de paredes, contínuos do topo até a fundação,
 * pilares intermediários quando o vão passa do máximo (fugindo de portas e janelas),
 * vigas sobre todas as paredes de cada pavimento e vigas baldrame sob as paredes do térreo.
 */
import { type Vec2, add, dist, mul, normalize, sub } from '../geometry/vec';
import { computeWallGeometry, openingCenter } from '../geometry/walls';
import { uid } from '../model/ops';
import type { Building, Plan } from '../model/types';
import { cornerNodes, onSegment, wallLines } from './geometry';
import { BALDRAME, type Beam, type Pillar, type StructureModel } from './types';

const MERGE = 0.3; // pilares a menos de 30 cm entre pavimentos são alinhados no mesmo eixo
const ceil5 = (cm: number) => Math.ceil(cm / 5) * 5;

interface Pos {
  p: Vec2;
  /** Índice do pavimento mais alto que usa este eixo. */
  top: number;
  /** Direção da parede (para orientar a seção). */
  dir: Vec2;
}

/** Intervalos (em distância ao longo da linha) ocupados por portas e janelas. */
function blockedIntervals(plan: Plan, a: Vec2, b: Vec2): [number, number][] {
  const geoms = computeWallGeometry(plan);
  const d = normalize(sub(b, a));
  const out: [number, number][] = [];
  for (const op of Object.values(plan.openings)) {
    const g = geoms[op.wallId];
    if (!g) continue;
    const c = openingCenter(g, op);
    const s = onSegment(c, a, b);
    if (s.dist > 0.06) continue;
    const t = (c.x - a.x) * d.x + (c.y - a.y) * d.y;
    out.push([t - op.width / 2 - 0.1, t + op.width / 2 + 0.1]);
  }
  return out;
}

function freeSpot(target: number, lo: number, hi: number, blocked: [number, number][]): number {
  const isFree = (t: number) => t > lo + 0.3 && t < hi - 0.3 && !blocked.some(([x, y]) => t > x && t < y);
  if (isFree(target)) return target;
  for (let k = 1; k < 80; k++) {
    for (const s of [target + k * 0.05, target - k * 0.05]) if (isFree(s)) return s;
  }
  return target;
}

export function generateStructure(b: Building): StructureModel {
  const positions: Pos[] = [];
  const nLevels = b.levels.length;

  const addPos = (p: Vec2, level: number, dir: Vec2) => {
    const near = positions.find((q) => dist(q.p, p) < MERGE);
    if (near) {
      near.top = Math.max(near.top, level);
      return near;
    }
    const pos = { p: { x: p.x, y: p.y }, top: level, dir };
    positions.push(pos);
    return pos;
  };

  const dirAt = (plan: Plan, p: Vec2): Vec2 => {
    let best: { d: Vec2; L: number } | null = null;
    for (const w of Object.values(plan.walls)) {
      const A = plan.nodes[w.a];
      const B = plan.nodes[w.b];
      if (onSegment(p, A, B).dist > 0.06) continue;
      const L = dist(A, B);
      if (!best || L > best.L) best = { d: normalize(sub(B, A)), L };
    }
    return best?.d ?? { x: 1, y: 0 };
  };

  // 1) eixos obrigatórios: de baixo para cima (os de cima se alinham aos de baixo)
  b.levels.forEach((l, i) => {
    for (const p of cornerNodes(l.plan)) addPos(p, i, dirAt(l.plan, p));
  });

  // 2) vãos longos: de cima para baixo, pilar intermediário em ponto livre de esquadrias
  const maxSpan = b.structure.settings.maxSpan;
  for (let i = nLevels - 1; i >= 0; i--) {
    const plan = b.levels[i].plan;
    for (const line of wallLines(plan)) {
      const L = dist(line.a, line.b);
      const d = normalize(sub(line.b, line.a));
      const blocked = blockedIntervals(plan, line.a, line.b);
      let changed = true;
      while (changed) {
        changed = false;
        const ts = positions
          .filter((q) => q.top >= i && onSegment(q.p, line.a, line.b).dist < 0.06)
          .map((q) => (q.p.x - line.a.x) * d.x + (q.p.y - line.a.y) * d.y)
          .filter((t) => t > -0.05 && t < L + 0.05)
          .sort((x, y) => x - y);
        for (let k = 0; k + 1 < ts.length; k++) {
          const span = ts[k + 1] - ts[k];
          if (span <= maxSpan + 1e-6) continue;
          const n = Math.ceil(span / maxSpan);
          const t = freeSpot(ts[k] + span / n, ts[k], ts[k + 1], blocked);
          addPos(add(line.a, mul(d, t)), i, d);
          changed = true;
          break;
        }
      }
    }
  }

  // 3) pilares: cada eixo desce do pavimento mais alto até o térreo
  const pillars: Record<string, Pillar> = {};
  const byLevel: Pillar[][] = b.levels.map(() => []);
  for (const pos of positions) {
    for (let i = 0; i <= pos.top; i++) {
      const id = uid('p');
      const p: Pillar = { id, levelId: b.levels[i].id, x: pos.p.x, y: pos.p.y, b: 14, h: 30, rotation: Math.atan2(pos.dir.y, pos.dir.x) };
      pillars[id] = p;
      byLevel[i].push(p);
    }
  }

  // 4) vigas ao longo das paredes de cada pavimento + baldrames sob o térreo
  const beams: Record<string, Beam> = {};
  const beamsAlong = (plan: Plan, levelPillars: Pillar[], levelId: string, ratio: number, minH: number) => {
    for (const line of wallLines(plan)) {
      const d = normalize(sub(line.b, line.a));
      const on = levelPillars
        .filter((p) => onSegment(p, line.a, line.b).dist < 0.06)
        .map((p) => ({ p, t: (p.x - line.a.x) * d.x + (p.y - line.a.y) * d.y }))
        .filter((x) => x.t > -0.05 && x.t < dist(line.a, line.b) + 0.05)
        .sort((x, y) => x.t - y.t);
      for (let k = 0; k + 1 < on.length; k++) {
        const L = on[k + 1].t - on[k].t;
        if (L < 0.2) continue;
        const id = uid('v');
        beams[id] = { id, levelId, a: on[k].p.id, b: on[k + 1].p.id, bw: 14, h: Math.max(minH, ceil5((L * 100) / ratio)) };
      }
    }
  };
  b.levels.forEach((l, i) => beamsAlong(l.plan, byLevel[i], l.id, 10, 30));
  if (nLevels > 0) beamsAlong(b.levels[0].plan, byLevel[0], BALDRAME, 12, 30);

  return { settings: b.structure.settings, pillars, beams };
}
