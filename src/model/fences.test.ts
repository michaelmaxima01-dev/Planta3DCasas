import { describe, expect, it } from 'vitest';
import { CATALOG_BY_ID } from '../catalog/catalog';
import { dist } from '../geometry/vec';
import { analyzeStructure } from '../structure/analyze';
import { buildQuantities } from '../structure/quantities';
import { buildExampleBuilding } from './building';
import { addFenceSegment, fenceEnds, insertGate, isFence, isGate } from './fences';
import { createEmptyPlan, planBounds } from './ops';
import { RECUO_FRONTAL, fitSite, siteCorners, siteStats, wallSite } from './site';

describe('muros e cercas', () => {
  it('cria o trecho com comprimento e direção do desenho', () => {
    const p = createEmptyPlan();
    const id = addFenceSegment(p, 'muro_bloco', { x: 0, y: 0 }, { x: 0, y: 6 })!;
    const f = p.furniture[id];
    expect(f.width).toBeCloseTo(6);
    const [a, b] = fenceEnds(f);
    expect(dist(a, { x: 0, y: 0 })).toBeCloseTo(0);
    expect(dist(b, { x: 0, y: 6 })).toBeCloseTo(0);
  });

  it('portão sobre o muro corta o trecho e mantém o comprimento total', () => {
    const p = createEmptyPlan();
    addFenceSegment(p, 'mureta_gradil', { x: 0, y: 0 }, { x: 10, y: 0 });
    const gid = insertGate(p, 'portao_correr_muro', { x: 3, y: 0.2 })!;
    const items = Object.values(p.furniture);
    const fences = items.filter(isFence);
    expect(fences).toHaveLength(2);
    expect(isGate(p.furniture[gid])).toBe(true);
    const total = items.reduce((a, f) => a + f.width, 0);
    expect(total).toBeCloseTo(10);
    expect(p.furniture[gid].x).toBeCloseTo(3);
    expect(p.furniture[gid].y).toBeCloseTo(0);
  });

  it('portão perto da ponta fica inteiro dentro do muro', () => {
    const p = createEmptyPlan();
    addFenceSegment(p, 'muro_bloco', { x: 0, y: 0 }, { x: 5, y: 0 });
    const gid = insertGate(p, 'portao_social', { x: 0.1, y: 0 })!;
    expect(p.furniture[gid].x).toBeCloseTo(0.5);
    expect(Object.values(p.furniture).filter(isFence)).toHaveLength(1);
  });
});

describe('terreno', () => {
  it('ajusta o lote à casa com recuo frontal e mura com portões', () => {
    const b = buildExampleBuilding();
    b.site = fitSite(b);
    const bb = planBounds(b.levels[0].plan)!;
    const cs = siteCorners(b.site);
    const minX = Math.min(...cs.map((q) => q.x));
    const maxX = Math.max(...cs.map((q) => q.x));
    const maxY = Math.max(...cs.map((q) => q.y));
    expect(minX).toBeLessThanOrEqual(bb.minX);
    expect(maxX).toBeGreaterThanOrEqual(bb.maxX);
    expect(maxY - bb.maxY).toBeCloseTo(RECUO_FRONTAL, 1);

    const n = wallSite(b);
    expect(n).toBeGreaterThanOrEqual(5);
    const items = Object.values(b.levels[0].plan.furniture);
    expect(items.filter(isGate)).toHaveLength(2);
    const perimeter = 2 * (b.site.w + b.site.d);
    expect(items.filter((f) => isFence(f) || isGate(f)).reduce((a, f) => a + f.width, 0)).toBeCloseTo(perimeter, 1);

    const st = siteStats(b)!;
    expect(st.lot).toBeCloseTo(b.site.w * b.site.d);
    expect(st.occupancy).toBeGreaterThan(0.1);
    expect(st.occupancy).toBeLessThan(1);
    expect(st.far).toBeGreaterThan(st.occupancy);
  });

  it('quantitativo ganha a etapa "Muros e cercas" com blocos, gradil e portões', () => {
    const b = buildExampleBuilding();
    b.site = fitSite(b);
    wallSite(b);
    const q = buildQuantities(b, analyzeStructure(b));
    const m = q.stages.find((s) => s.key === 'muros')!;
    expect(m).toBeTruthy();
    const get = (re: RegExp) => m.summary.find((x) => re.test(x.item))?.qty ?? 0;
    expect(get(/Blocos de concreto/)).toBeGreaterThan(100);
    expect(get(/Gradil/)).toBeGreaterThan(5);
    expect(get(/Portões/)).toBe(2);
    expect(get(/Cimento/)).toBeGreaterThan(0);
    expect(CATALOG_BY_ID.muro_bloco.fence).toBe(true);
  });
});
