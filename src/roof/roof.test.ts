import { describe, expect, it } from 'vitest';
import { buildExampleBuilding, addLevelOnTop } from '../model/building';
import { floorHoles, stairDims } from '../model/stairs';
import { analyzeRoof, roofGeometry, roofTimber } from './roof';

describe('telhado', () => {
  it('duas águas: áreas, altura da cumeeira e oitões', () => {
    const b = buildExampleBuilding();
    b.roof = { type: 'duas_aguas', slope: 35, overhang: 0.6, rotate: false };
    const g = roofGeometry(b)!;
    expect(g.projectedArea).toBeCloseTo((10.2 + 1.2) * (8.2 + 1.2), 6);
    expect(g.realArea).toBeCloseTo(g.projectedArea / Math.cos(Math.atan(0.35)), 6);
    expect(g.ridgeHeight).toBeCloseTo((0.35 * 9.4) / 2, 6);
    expect(g.faces).toHaveLength(2);
    expect(g.gables).toHaveLength(2);
    expect(g.base).toBeCloseTo(2.95 * 2, 6);
  });

  it('quatro águas tem 4 planos e espigões', () => {
    const b = buildExampleBuilding();
    b.roof = { type: 'quatro_aguas', slope: 30, overhang: 0.5, rotate: false };
    const g = roofGeometry(b)!;
    expect(g.faces).toHaveLength(4);
    expect(g.ridges.length).toBe(5);
  });

  it('verifica inclinação mínima e dá quantitativos e madeiramento', () => {
    const b = buildExampleBuilding();
    b.roof = { type: 'duas_aguas', slope: 20, overhang: 0.6, rotate: false };
    const r = analyzeRoof(b, 'ceramica', 0.9, 0.5)!;
    expect(r.status).toBe('fail');
    expect(r.elements.some((e) => e.name.startsWith('Telhas'))).toBe(true);
    expect(roofTimber(b).purlins.length).toBeGreaterThan(4);
    b.roof.slope = 35;
    expect(analyzeRoof(b, 'ceramica', 0.9, 0.5)!.status).toBe('ok');
  });
});

describe('novo andar', () => {
  it('cria escada no andar de baixo e o vão aparece no piso do andar novo', () => {
    const b = buildExampleBuilding();
    b.levels = [b.levels[0]];
    for (const f of Object.values(b.levels[0].plan.furniture)) if (f.catalogId === 'stair') delete b.levels[0].plan.furniture[f.id];
    const { id, message } = addLevelOnTop(b, 'outer', { stair: true });
    expect(message).toContain('Escada criada');
    expect(b.levels).toHaveLength(2);
    expect(b.levels[1].id).toBe(id);
    const up = b.levels[1].plan;
    const perimeter = Object.values(up.walls).reduce((acc, w) => acc + Math.hypot(up.nodes[w.a].x - up.nodes[w.b].x, up.nodes[w.a].y - up.nodes[w.b].y), 0);
    expect(perimeter).toBeCloseTo(2 * (10 + 8), 6);
    const holes = floorHoles(b, 1);
    expect(holes).toHaveLength(1);
    expect(holes[0].depth).toBeCloseTo(stairDims(2.95).depth, 6);
  });
});
