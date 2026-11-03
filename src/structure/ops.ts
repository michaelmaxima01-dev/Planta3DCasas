import { type Vec2, dist, normalize, sub } from '../geometry/vec';
import { uid } from '../model/ops';
import type { Building, Plan } from '../model/types';
import { onSegment } from './geometry';
import { analyzeStructure, type StructureResult } from './analyze';

const cache = new WeakMap<Building, StructureResult>();
/** Análise com cache por versão do edifício (várias telas usam o mesmo resultado). */
export function cachedAnalysis(b: Building): StructureResult {
  let r = cache.get(b);
  if (!r) {
    r = analyzeStructure(b);
    cache.set(b, r);
  }
  return r;
}

export function wallDirAt(plan: Plan, p: Vec2): number {
  let best: { a: number; L: number } | null = null;
  for (const w of Object.values(plan.walls)) {
    const A = plan.nodes[w.a];
    const B = plan.nodes[w.b];
    if (!A || !B || onSegment(p, A, B).dist > 0.1) continue;
    const L = dist(A, B);
    const d = normalize(sub(B, A));
    if (!best || L > best.L) best = { a: Math.atan2(d.y, d.x), L };
  }
  return best?.a ?? 0;
}

/** Adiciona um pilar no pavimento e em todos os de baixo (o pilar desce até a fundação). */
export function addPillarAxis(b: Building, levelId: string, p: Vec2): string | null {
  const idx = b.levels.findIndex((l) => l.id === levelId);
  if (idx < 0) return null;
  let created: string | null = null;
  for (let i = idx; i >= 0; i--) {
    const l = b.levels[i];
    if (Object.values(b.structure.pillars).some((q) => q.levelId === l.id && dist(q, p) < 0.05)) continue;
    const id = uid('p');
    b.structure.pillars[id] = { id, levelId: l.id, x: p.x, y: p.y, b: 14, h: 30, rotation: wallDirAt(l.plan, p) };
    if (i === idx) created = id;
  }
  return created;
}

/** Move o eixo do pilar em todos os pavimentos (mantém a continuidade). */
export function movePillarAxis(b: Building, pillarId: string, from: Vec2, to: Vec2) {
  for (const q of Object.values(b.structure.pillars)) {
    if (q.id === pillarId || dist(q, from) < 0.05) {
      q.x = to.x;
      q.y = to.y;
    }
  }
}

export function removePillar(b: Building, pillarId: string) {
  delete b.structure.pillars[pillarId];
  for (const v of Object.values(b.structure.beams)) if (v.a === pillarId || v.b === pillarId) delete b.structure.beams[v.id];
}

export function addBeam(b: Building, levelId: string, a: string, c: string): string | null {
  if (a === c) return null;
  const exists = Object.values(b.structure.beams).some((v) => v.levelId === levelId && ((v.a === a && v.b === c) || (v.a === c && v.b === a)));
  if (exists) return null;
  const L = dist(b.structure.pillars[a], b.structure.pillars[c]);
  const id = uid('v');
  b.structure.beams[id] = { id, levelId, a, b: c, bw: 14, h: Math.max(30, Math.ceil((L * 100) / 10 / 5) * 5) };
  return id;
}
