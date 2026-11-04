import { describe, expect, it } from 'vitest';
import { analyzeStructure, autoSize } from '../structure/analyze';
import { generateStructure } from '../structure/generate';
import { buildQuantities } from '../structure/quantities';
import { buildExampleBuilding } from './building';
import { budgetCsv, buildBudget, defaultProfile, itemKey } from './budget';
import { builtArea } from './site';

describe('orçamento', () => {
  const b = buildExampleBuilding();
  b.structure = generateStructure(b);
  autoSize(b);
  const q = buildQuantities(b, analyzeStructure(b));
  const area = builtArea(b);

  it('soma materiais, mão de obra, imprevistos e dá custo por m² plausível', () => {
    const bud = buildBudget(q, defaultProfile(), area);
    expect(bud.stages.length).toBeGreaterThanOrEqual(4);
    for (const st of bud.stages) expect(st.total).toBeCloseTo(st.materials + st.labor);
    expect(bud.total).toBeCloseTo(bud.subtotal * 1.05);
    // só estrutura + alvenaria + telhado (sem acabamentos): ordem de R$ 300 a 2.500 por m²
    expect(bud.perM2).toBeGreaterThan(300);
    expect(bud.perM2).toBeLessThan(2500);
  });

  it('respeita preço do perfil, mão de obra por m² e outros custos', () => {
    const p = defaultProfile();
    p.prices[itemKey('Cimento Portland (sacos de 50 kg)')] = 0;
    p.labor.fundacao = { mode: 'm2', value: 100 };
    p.extras = [{ name: 'Projetos', value: 5000 }];
    p.contingency = 0;
    p.bdi = 10;
    const bud = buildBudget(q, p, area);
    expect(bud.stages.find((s) => s.key === 'fundacao')!.labor).toBeCloseTo(100 * area);
    expect(bud.stages.flatMap((s) => s.lines).filter((l) => l.key.startsWith('Cimento')).every((l) => l.total === 0)).toBe(true);
    expect(bud.total).toBeCloseTo(bud.subtotal * 1.1);
    const csv = budgetCsv(bud, p.name, 'Teste');
    expect(csv).toContain('TOTAL GERAL');
    expect(csv).toContain('Projetos');
  });
});
