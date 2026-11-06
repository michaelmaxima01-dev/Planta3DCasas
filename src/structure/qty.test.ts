import { describe, expect, it } from 'vitest';
import { buildExampleBuilding } from '../model/building';
import { analyzeStructure, autoSize } from './analyze';
import { generateStructure } from './generate';
import { buildQuantities, fmtQty } from './quantities';

describe('quantitativo de materiais', () => {
  it('calcula concreto, cimento, areia, brita e aço com ordem de grandeza realista', () => {
    const b = buildExampleBuilding();
    b.structure = generateStructure(b);
    autoSize(b);
    const r = analyzeStructure(b);
    const q = buildQuantities(b, r);
    const get = (s: string) => q.summary.find((x) => x.item.startsWith(s))!.qty;
    if (process.env.SHOW) for (const x of [...q.rows, ...q.summary]) console.log(x.group, '|', x.item, '|', fmtQty(x));
    // sobrado de 160 m²: concreto da ordem de 0,15 a 0,35 m³/m², aço de 60 a 120 kg/m³ de concreto
    const area = 80 * 2;
    expect(get('Concreto estrutural') / area).toBeGreaterThan(0.1);
    expect(get('Concreto estrutural') / area).toBeLessThan(0.4);
    const rate = get('Aço') / get('Concreto estrutural');
    expect(rate).toBeGreaterThan(40);
    expect(rate).toBeLessThan(140);
    expect(get('Cimento')).toBeGreaterThan(100);
    expect(get('Areia')).toBeGreaterThan(10);
    expect(get('Brita')).toBeGreaterThan(5);
  });
});

describe('quantitativo por etapa', () => {
  it('separa fundação, estrutura, alvenaria e telhado e a soma bate com o total', () => {
    const b = buildExampleBuilding();
    b.structure = generateStructure(b);
    autoSize(b);
    const q = buildQuantities(b, analyzeStructure(b));
    expect(q.stages.map((s) => s.name)).toEqual(['Fundação', 'Estrutura', 'Alvenaria', 'Telhado', 'Acabamentos']);
    const get = (rows: { item: string; qty: number }[], p: string) => rows.find((x) => x.item.startsWith(p))?.qty ?? 0;
    const [F, E, A, T] = q.stages;
    if (process.env.SHOW) for (const st of q.stages) for (const x of st.summary) console.log(st.name, '|', x.item, '|', fmtQty(x));
    expect(get(F.summary, 'Cimento')).toBeGreaterThan(10);
    expect(get(F.summary, 'Aço')).toBeGreaterThan(100);
    expect(get(F.summary, 'Escavação')).toBeGreaterThan(10);
    expect(get(T.summary, 'Madeira serrada')).toBeGreaterThan(0.5);
    expect(get(T.summary, 'Telhas')).toBeGreaterThan(500);
    const cementStages = get(F.summary, 'Cimento') + get(E.summary, 'Cimento') + get(A.summary, 'Cimento');
    expect(Math.abs(cementStages - get(q.summary, 'Cimento'))).toBeLessThanOrEqual(3); // arredondamento de sacos
    const steelStages = get(F.summary, 'Aço') + get(E.summary, 'Aço');
    expect(Math.abs(steelStages - get(q.summary, 'Aço')) / steelStages).toBeLessThan(0.001);
  });
});

describe('quantitativo de acabamentos', () => {
  it('paredes por acabamento, pisos, rodapé, teto, esquadrias e muro com textura', async () => {
    const { fitSite, wallSite } = await import('../model/site');
    const b = buildExampleBuilding();
    const w = Object.values(b.levels[0].plan.walls)[0];
    w.finish = 'tijolinho';
    b.colors = { wallFinish: 'grafiato' };
    b.site = fitSite(b);
    wallSite(b);
    const muro = Object.values(b.levels[0].plan.furniture).find((f) => f.catalogId === 'muro_bloco')!;
    muro.finish = 'pedra';
    const q = buildQuantities(b, analyzeStructure(b));
    const K = q.stages.find((s) => s.key === 'acabamentos')!;
    const row = (re: RegExp) => K.rows.find((r) => re.test(r.item));
    const mat = (re: RegExp) => K.summary.find((r) => re.test(r.item))?.qty ?? 0;
    expect(row(/Paredes: Tijolinho/)!.qty).toBeGreaterThan(1);
    expect(row(/Paredes: Textura grafiato/)!.qty).toBeGreaterThan(50);
    expect(mat(/Plaquetas de tijolinho/)).toBeGreaterThan(1);
    expect(mat(/Textura grafiato/)).toBeGreaterThan(1);
    expect(row(/Piso:/)).toBeTruthy();
    expect(mat(/Rodapé/)).toBeGreaterThan(20);
    expect(mat(/Esquadria: Porta de giro/)).toBeGreaterThan(0);
    expect(row(/Teto: pintura/)).toBeTruthy();
    const M = q.stages.find((s) => s.key === 'muros')!;
    expect(M.summary.some((r) => /canjiquinha/.test(r.item))).toBe(true);
  });
});
