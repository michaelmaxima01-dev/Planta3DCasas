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
