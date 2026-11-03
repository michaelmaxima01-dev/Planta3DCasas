/**
 * Lançamento automático da estrutura (concepção estrutural):
 *
 * - pilares nos cantos e encontros de paredes de cada pavimento;
 * - um pilar só DESCE para o pavimento de baixo se houver parede embaixo dele
 *   (assim nunca aparece pilar solto no meio de um cômodo);
 * - quando uma parede de cima não tem parede embaixo, cria-se uma VIGA DE TRANSIÇÃO no teto
 *   do pavimento de baixo, apoiada nos pilares das pontas; os pilares de cima nascem nela;
 * - pilares intermediários quando o vão passa do máximo, preferindo pontos sobre paredes
 *   do pavimento de baixo e fugindo de portas e janelas;
 * - vigas sobre as paredes de cada pavimento e vigas baldrame sob as paredes do térreo.
 */
import { type Vec2, add, dist, mul, normalize, segmentIntersection, sub } from '../geometry/vec';
import { computeWallGeometry, openingCenter } from '../geometry/walls';
import { uid } from '../model/ops';
import type { Building, Plan } from '../model/types';
import { collinearOverlap, cornerNodes, onSegment, type WallLine, wallLines } from './geometry';
import { BALDRAME, type Beam, type Pillar, type StructureModel } from './types';

const MERGE = 0.3; // cantos a menos de 30 cm entre pavimentos usam o mesmo eixo
const ON = 0.06;
const ceil5 = (cm: number) => Math.ceil(cm / 5) * 5;

interface Pos {
  p: Vec2;
  need: Set<number>;
  dir: Vec2;
}

function blockedIntervals(plan: Plan, a: Vec2, b: Vec2): [number, number][] {
  const geoms = computeWallGeometry(plan);
  const d = normalize(sub(b, a));
  const out: [number, number][] = [];
  for (const op of Object.values(plan.openings)) {
    const g = geoms[op.wallId];
    if (!g) continue;
    const c = openingCenter(g, op);
    if (onSegment(c, a, b).dist > ON) continue;
    const t = (c.x - a.x) * d.x + (c.y - a.y) * d.y;
    out.push([t - op.width / 2 - 0.1, t + op.width / 2 + 0.1]);
  }
  return out;
}

const isFree = (t: number, lo: number, hi: number, blocked: [number, number][]) =>
  t > lo + 0.3 && t < hi - 0.3 && !blocked.some(([x, y]) => t > x && t < y);

function freeSpot(target: number, lo: number, hi: number, blocked: [number, number][], preferred: number[]): number {
  // 1º: pontos preferidos (sobre paredes de baixo) livres e razoavelmente perto do ideal
  const pref = preferred.filter((t) => isFree(t, lo, hi, blocked) && Math.abs(t - target) < (hi - lo) / 3).sort((x, y) => Math.abs(x - target) - Math.abs(y - target));
  if (pref.length) return pref[0];
  if (isFree(target, lo, hi, blocked)) return target;
  for (let k = 1; k < 80; k++) for (const s of [target + k * 0.05, target - k * 0.05]) if (isFree(s, lo, hi, blocked)) return s;
  return target;
}

/** Há parede (ou canto) do pavimento nesse ponto? */
function wallAt(plan: Plan, p: Vec2): boolean {
  for (const w of Object.values(plan.walls)) {
    const A = plan.nodes[w.a];
    const B = plan.nodes[w.b];
    if (!A || !B) continue;
    const o = onSegment(p, A, B);
    if (o.dist < ON && o.t > -0.02 && o.t < 1.02) return true;
  }
  return false;
}

/** Linhas de parede do pavimento de cima que NÃO têm parede embaixo (precisam de viga de transição). */
function transferLines(upper: Plan, lower: Plan): WallLine[] {
  const lowerLines = wallLines(lower);
  return wallLines(upper).filter((line) => {
    const L = dist(line.a, line.b);
    const covered = lowerLines.reduce((s, l) => s + collinearOverlap(line.a, line.b, l.a, l.b), 0);
    return covered < 0.8 * L;
  });
}

export function generateStructure(b: Building): StructureModel {
  const positions: Pos[] = [];
  const n = b.levels.length;

  const addNeed = (p: Vec2, level: number, dir: Vec2) => {
    const near = positions.find((q) => dist(q.p, p) < MERGE);
    if (near) {
      near.need.add(level);
      return;
    }
    positions.push({ p: { x: p.x, y: p.y }, need: new Set([level]), dir });
  };

  const dirAt = (plan: Plan, p: Vec2): Vec2 => {
    let best: { d: Vec2; L: number } | null = null;
    for (const w of Object.values(plan.walls)) {
      const A = plan.nodes[w.a];
      const B = plan.nodes[w.b];
      if (onSegment(p, A, B).dist > ON) continue;
      const L = dist(A, B);
      if (!best || L > best.L) best = { d: normalize(sub(B, A)), L };
    }
    return best?.d ?? { x: 1, y: 0 };
  };

  // um eixo existe no pavimento i se for necessário ali, ou se existir em cima e houver parede embaixo
  const existsMemo = new Map<string, boolean>();
  const existsAt = (pos: Pos, i: number): boolean => {
    if (i >= n) return false;
    const key = `${positions.indexOf(pos)}:${i}`;
    if (existsMemo.has(key)) return existsMemo.get(key)!;
    const v = pos.need.has(i) || (existsAt(pos, i + 1) && wallAt(b.levels[i].plan, pos.p));
    existsMemo.set(key, v);
    return v;
  };

  // 1) cantos e encontros de cada pavimento (de baixo para cima: os de cima se alinham aos de baixo)
  b.levels.forEach((l, i) => {
    for (const p of cornerNodes(l.plan)) addNeed(p, i, dirAt(l.plan, p));
  });

  // 2) vãos longos, de cima para baixo
  const maxSpan = b.structure.settings.maxSpan;
  for (let i = n - 1; i >= 0; i--) {
    const plan = b.levels[i].plan;
    const lower = i > 0 ? b.levels[i - 1].plan : null;
    const transfer = i < n - 1 ? transferLines(b.levels[i + 1].plan, plan) : [];
    const lines = [...wallLines(plan).map((l) => ({ l, transfer: false })), ...transfer.map((l) => ({ l, transfer: true }))];
    for (const { l: line, transfer: isTransfer } of lines) {
      const L = dist(line.a, line.b);
      const d = normalize(sub(line.b, line.a));
      const blocked = blockedIntervals(plan, line.a, line.b);
      // viga de transição: só ganha pilar intermediário onde cruza parede DESTE pavimento;
      // linha de parede: prefere pontos sobre paredes do pavimento de baixo
      const ref = isTransfer ? plan : lower;
      const preferred: number[] = [];
      if (ref) {
        for (const w of Object.values(ref.walls)) {
          const si = segmentIntersection(line.a, line.b, ref.nodes[w.a], ref.nodes[w.b]);
          if (si) preferred.push(si.t * L);
        }
      }
      for (let guard = 0; guard < 50; guard++) {
        existsMemo.clear();
        const ts = positions
          .filter((q) => existsAt(q, i) && onSegment(q.p, line.a, line.b).dist < ON)
          .map((q) => (q.p.x - line.a.x) * d.x + (q.p.y - line.a.y) * d.y)
          .filter((t) => t > -0.05 && t < L + 0.05)
          .sort((x, y) => x - y);
        let added = false;
        for (let k = 0; k + 1 < ts.length; k++) {
          const span = ts[k + 1] - ts[k];
          if (span <= maxSpan + 1e-6) continue;
          const target = ts[k] + span / Math.ceil(span / maxSpan);
          let t: number;
          if (isTransfer) {
            const ok = preferred.filter((x) => x > ts[k] + 0.3 && x < ts[k + 1] - 0.3).sort((x, y) => Math.abs(x - target) - Math.abs(y - target));
            if (!ok.length) continue; // vão maior fica para a viga de transição (dimensionada depois)
            t = ok[0];
          } else t = freeSpot(target, ts[k], ts[k + 1], blocked, preferred);
          addNeed(add(line.a, mul(d, t)), i, d);
          added = true;
          break;
        }
        if (!added) break;
      }
    }
  }

  // 3) pilares por pavimento
  existsMemo.clear();
  const pillars: Record<string, Pillar> = {};
  const byLevel: Pillar[][] = b.levels.map(() => []);
  for (const pos of positions) {
    for (let i = 0; i < n; i++) {
      if (!existsAt(pos, i)) continue;
      const id = uid('p');
      const p: Pillar = { id, levelId: b.levels[i].id, x: pos.p.x, y: pos.p.y, b: 14, h: 30, rotation: Math.atan2(pos.dir.y, pos.dir.x) };
      pillars[id] = p;
      byLevel[i].push(p);
    }
  }

  // 4) vigas: sobre as paredes, de transição (sob paredes de cima sem parede embaixo) e baldrames
  const beams: Record<string, Beam> = {};
  const beamsAlong = (lines: WallLine[], levelPillars: Pillar[], levelId: string, ratio: number) => {
    for (const line of lines) {
      const d = normalize(sub(line.b, line.a));
      const L = dist(line.a, line.b);
      const on = levelPillars
        .filter((p) => onSegment(p, line.a, line.b).dist < ON)
        .map((p) => ({ p, t: (p.x - line.a.x) * d.x + (p.y - line.a.y) * d.y }))
        .filter((x) => x.t > -0.05 && x.t < L + 0.05)
        .sort((x, y) => x.t - y.t);
      for (let k = 0; k + 1 < on.length; k++) {
        const span = on[k + 1].t - on[k].t;
        if (span < 0.2) continue;
        const exists = Object.values(beams).some(
          (v) => v.levelId === levelId && ((v.a === on[k].p.id && v.b === on[k + 1].p.id) || (v.a === on[k + 1].p.id && v.b === on[k].p.id)),
        );
        if (exists) continue;
        const id = uid('v');
        beams[id] = { id, levelId, a: on[k].p.id, b: on[k + 1].p.id, bw: 14, h: Math.max(30, ceil5((span * 100) / ratio)) };
      }
    }
  };
  b.levels.forEach((l, i) => {
    beamsAlong(wallLines(l.plan), byLevel[i], l.id, 10);
    if (i < n - 1) beamsAlong(transferLines(b.levels[i + 1].plan, l.plan), byLevel[i], l.id, 10);
  });
  if (n > 0) beamsAlong(wallLines(b.levels[0].plan), byLevel[0], BALDRAME, 12);

  return { settings: b.structure.settings, pillars, beams };
}
