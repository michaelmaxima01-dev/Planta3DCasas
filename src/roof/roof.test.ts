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

describe('telhado em tesouras', () => {
  it('sem laje no último andar e toda a carga do telhado chega à fundação', async () => {
    const { generateStructure } = await import('../structure/generate');
    const { analyzeStructure, wallLoadPerMeter } = await import('../structure/analyze');
    const { dist } = await import('../geometry/vec');
    const b = buildExampleBuilding();
    b.roof = { type: 'duas_aguas', slope: 35, overhang: 0.6, rotate: false, support: 'tesoura' };
    b.structure = generateStructure(b);
    const r = analyzeStructure(b);
    const top = b.levels[b.levels.length - 1];
    expect(r.slabs.filter((x) => x.levelId === top.id)).toHaveLength(0);
    expect(r.roof!.truss!.count).toBeGreaterThan(3);
    expect(r.beams.some((v) => v.loads.some((l) => l.label === 'Telhado (tesouras)'))).toBe(true);
    // conservação: lajes + paredes + vigas + pilares + telhado = carga na fundação
    let expected = r.slabs.reduce((acc, x) => acc + x.total, 0);
    for (const l of b.levels) for (const w of Object.values(l.plan.walls)) expected += wallLoadPerMeter(b.structure.settings, l.plan, w.id) * dist(l.plan.nodes[w.a], l.plan.nodes[w.b]);
    for (const v of r.beams) expected += v.loads[0].value * v.L;
    for (const p of r.pillars) expected += p.loads.find((x) => x.label === 'Peso próprio')!.value;
    const roofBeams = r.beams.reduce((acc, v) => acc + (v.loads.find((l) => l.label === 'Telhado (tesouras)')?.value ?? 0) * v.L, 0);
    expected += roofBeams;
    expect(Math.abs(r.totals.weight - expected) / expected).toBeLessThan(0.01);
    // a carga distribuída nas vigas cobre (quase) todo o peso do telhado
    const roofTotal = (r.roof!.load + b.structure.settings.roofLiveLoad) * r.roof!.geometry.projectedArea;
    expect(roofBeams / roofTotal).toBeGreaterThan(0.8);
    expect(roofBeams / roofTotal).toBeLessThan(1.2);
  });

  it('tipos de telha: mínimos e quantitativos por família', () => {
    const b = buildExampleBuilding();
    b.roof = { type: 'duas_aguas', slope: 12, overhang: 0.5, rotate: false };
    expect(analyzeRoof(b, 'fibrocimento', 0.4, 0.5)!.status).not.toBe('fail');
    expect(analyzeRoof(b, 'ceramica_colonial', 1.0, 0.5)!.status).toBe('fail');
    const sh = analyzeRoof(b, 'shingle', 0.55, 0.5)!;
    expect(sh.elements.some((e) => e.name.startsWith('Chapas OSB'))).toBe(true);
    b.roof.slope = 35;
    const ce = analyzeRoof(b, 'ceramica', 0.9, 0.5)!;
    expect(ce.woodVolume).toBeGreaterThan(0.5);
    expect(ce.elements.find((e) => e.name.startsWith('Calhas'))!.qty).toBeGreaterThan(10);
  });
});

describe('telhados e sustentações novas', () => {
  it('embutido (platibanda), borboleta, tesoura metálica e apoio nas paredes geram geometria e materiais', async () => {
    const { buildExampleBuilding } = await import('../model/building');
    const { analyzeRoof, roofGeometry, roofTimber } = await import('./roof');
    for (const [type, support] of [['embutido', 'laje'], ['borboleta', 'paredes'], ['duas_aguas', 'tesoura_metalica'], ['uma_agua', 'paredes']] as const) {
      const b = buildExampleBuilding();
      b.roof = { type, slope: type === 'embutido' ? 10 : 30, overhang: 0.5, rotate: false, support };
      const g = roofGeometry(b)!;
      expect(g.faces.length, type).toBeGreaterThan(0);
      if (type === 'embutido') {
        expect(g.gables).toHaveLength(4);
        expect(g.eave.minX).toBeCloseTo(g.walls.minX);
      }
      const r = analyzeRoof(b, 'fibrocimento', 0.4, 0.25)!;
      expect(r.elements.length, type).toBeGreaterThan(3);
      if (support !== 'laje') expect(r.eaveLoads.length, support).toBeGreaterThan(0);
      if (support === 'tesoura_metalica') expect(r.elements.some((e) => /Aço formado a frio/.test(e.name))).toBe(true);
      if (type === 'borboleta') expect(r.elements.some((e) => /Calha central/.test(e.name))).toBe(true);
      expect(roofTimber(b).purlins.length).toBeGreaterThan(0);
    }
  });

  it('forro entra no quantitativo de alvenaria', async () => {
    const { buildExampleBuilding } = await import('../model/building');
    const { analyzeStructure } = await import('../structure/analyze');
    const { buildQuantities } = await import('../structure/quantities');
    const b = buildExampleBuilding();
    b.levels[1].ceiling = { type: 'gesso' };
    const q = buildQuantities(b, analyzeStructure(b));
    const A = q.stages.find((s) => s.key === 'alvenaria')!;
    expect(A.rows.some((r) => /Forro: Gesso/.test(r.item))).toBe(true);
    expect(A.summary.find((r) => /Placas de gesso/.test(r.item))!.qty).toBeGreaterThan(50);
  });
});
