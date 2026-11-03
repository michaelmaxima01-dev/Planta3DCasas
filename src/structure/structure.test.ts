import { describe, expect, it } from 'vitest';
import { dist } from '../geometry/vec';
import { buildExampleBuilding, createBuilding } from '../model/building';
import { addWall, createEmptyPlan } from '../model/ops';
import { analyzeStructure, autoSize, wallLoadPerMeter } from './analyze';
import { generateStructure } from './generate';
import { BALDRAME } from './types';

function sobrado() {
  const b = buildExampleBuilding();
  b.structure = generateStructure(b);
  return b;
}

describe('lançamento automático', () => {
  const b = sobrado();
  const [ground, upper] = b.levels;
  const pillars = Object.values(b.structure.pillars);

  it('coloca pilares contínuos do topo até o térreo', () => {
    const up = pillars.filter((p) => p.levelId === upper.id);
    const down = pillars.filter((p) => p.levelId === ground.id);
    expect(up.length).toBeGreaterThan(8);
    for (const p of up) expect(down.some((q) => dist(p, q) < 0.05)).toBe(true);
  });

  it('respeita o vão máximo entre pilares', () => {
    for (const v of Object.values(b.structure.beams)) {
      const L = dist(b.structure.pillars[v.a], b.structure.pillars[v.b]);
      expect(L).toBeLessThanOrEqual(b.structure.settings.maxSpan + 1e-6);
    }
  });

  it('não coloca pilar no vão de porta ou janela', () => {
    // porta de entrada do térreo em x = 1,2 (0,9 m de largura) na parede y = 8
    expect(pillars.some((p) => p.levelId === ground.id && Math.abs(p.y - 8) < 0.05 && Math.abs(p.x - 1.2) < 0.45)).toBe(false);
  });

  it('cria baldrames sob as paredes do térreo', () => {
    expect(Object.values(b.structure.beams).filter((v) => v.levelId === BALDRAME).length).toBeGreaterThan(8);
  });
});

describe('tramitação de cargas', () => {
  it('toda a carga chega à fundação (conservação)', () => {
    const b = sobrado();
    const r = analyzeStructure(b);
    const s = b.structure.settings;
    let expected = r.slabs.reduce((acc, x) => acc + x.total, 0);
    // paredes do pavimento de cima que estão sobre a laje já entram como carga da laje
    const onSlab = r.slabs.reduce((acc, x) => acc + x.loads.filter((l) => l.label.includes('sobre a laje')).reduce((q, l) => q + l.value * x.area, 0), 0);
    expected -= onSlab;
    for (const l of b.levels) for (const w of Object.values(l.plan.walls)) expected += wallLoadPerMeter(s, l.plan, w.id) * dist(l.plan.nodes[w.a], l.plan.nodes[w.b]);
    for (const v of r.beams) expected += v.loads[0].value * v.L;
    for (const p of r.pillars) expected += p.loads.find((x) => x.label === 'Peso próprio')!.value;
    expect(r.totals.weight).toBeGreaterThan(0);
    expect(Math.abs(r.totals.weight - expected) / expected).toBeLessThan(0.01);
  });

  it('dá ordem de grandeza realista para um sobrado (6 a 14 kN/m² por pavimento)', () => {
    const r = analyzeStructure(sobrado());
    expect(r.totals.perArea).toBeGreaterThan(6);
    expect(r.totals.perArea).toBeLessThan(14);
  });

  it('acusa parede do andar de cima apoiada na laje', () => {
    const r = analyzeStructure(sobrado());
    expect(r.slabs.some((x) => x.loads.some((l) => l.label.includes('sobre a laje')))).toBe(true);
  });

  it('dimensiona automaticamente até não haver falhas de seção', () => {
    const b = sobrado();
    autoSize(b);
    const r = analyzeStructure(b);
    expect(r.pillars.filter((p) => p.status === 'fail')).toHaveLength(0);
    expect(r.beams.filter((v) => v.status === 'fail')).toHaveLength(0);
    // pilares do térreo carregam mais que os de cima
    const p1 = r.pillars.filter((p) => p.code === 'P1');
    expect(p1).toHaveLength(2);
    const [top, bottom] = [p1.find((p) => p.levelId === b.levels[1].id)!, p1.find((p) => p.levelId === b.levels[0].id)!];
    expect(bottom.N).toBeGreaterThan(top.N);
  });

  it('dimensiona sapata pela tensão admissível e acusa solo fraco', () => {
    const b = sobrado();
    const fortes = analyzeStructure(b).footings;
    expect(fortes.every((f) => f.N * 1.1 <= f.B * f.L * b.structure.settings.soilStress + 1e-6)).toBe(true);
    b.structure.settings.soilStress = 50;
    const fracos = analyzeStructure(b);
    expect(Math.max(...fracos.footings.map((f) => f.B))).toBeGreaterThan(Math.max(...fortes.map((f) => f.B)));
  });

  it('acusa pilar sem caminho até a fundação', () => {
    const b = createBuilding();
    addWall(b.levels[0].plan, { x: 0, y: 0 }, { x: 4, y: 0 }, { thickness: 0.15, height: 2.8 });
    b.levels.push({ id: 'up', name: '1º andar', elevation: 2.95, height: 2.95, plan: createEmptyPlan() });
    b.structure.pillars.solto = { id: 'solto', levelId: 'up', x: 2, y: 3, b: 14, h: 30, rotation: 0 };
    const r = analyzeStructure(b);
    expect(r.issues.some((i) => i.status === 'fail' && i.text.includes('sem caminho'))).toBe(true);
  });
});
