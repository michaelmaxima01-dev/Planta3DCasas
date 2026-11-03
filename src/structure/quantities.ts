/**
 * Quantitativo de materiais da obra (fundação, estrutura, lajes, alvenaria, contrapiso e telhado).
 *
 * Volumes e comprimentos vêm da geometria e do dimensionamento; consumos de cimento, areia, brita e cal
 * usam traços típicos de obra (concreto virado em obra e argamassas usuais). Perdas incluídas:
 * concreto 5%, aço 10%, argamassas 10%, blocos 5%. Valores para orçamento preliminar.
 */
import { dist } from '../geometry/vec';
import type { Building } from '../model/types';
import type { StructureResult } from './analyze';

export interface QtyRow {
  group: string;
  item: string;
  unit: string;
  qty: number;
  note?: string;
}

/** Consumo por m³ de concreto virado em obra, por fck (cimento kg, areia m³, brita m³). */
const CONCRETE_MIX: Record<number, { cement: number; sand: number; gravel: number }> = {
  20: { cement: 300, sand: 0.8, gravel: 0.8 },
  25: { cement: 350, sand: 0.75, gravel: 0.8 },
  30: { cement: 400, sand: 0.7, gravel: 0.8 },
  35: { cement: 440, sand: 0.68, gravel: 0.8 },
  40: { cement: 480, sand: 0.65, gravel: 0.8 },
};
const LEAN = { cement: 200, sand: 0.85, gravel: 0.85 }; // concreto magro
const MORTAR = { cement: 175, lime: 175, sand: 1.2 }; // argamassa 1:2:8 (assentamento e reboco)
const SCREED = { cement: 320, sand: 1.2 }; // contrapiso 1:4

const KG_M: Record<string, number> = { '5': 0.154, '6,3': 0.245, '8': 0.395, '10': 0.617, '12,5': 0.963, '16': 1.578, '20': 2.466 };

const f1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const LOSS = { concrete: 1.05, steel: 1.1, mortar: 1.1, block: 1.05 };

/** Concreto equivalente das lajes treliçadas (capa + nervuras), m³ por m². */
const TRELICADA_CONCRETE: Record<number, number> = { 12: 0.055, 16: 0.065, 20: 0.075, 25: 0.09 };

function parseBars(s: string): { n: number; d: string } | null {
  const m = /(\d+)\s*Ø\s*([\d,]+)/.exec(s);
  return m ? { n: Number(m[1]), d: m[2] } : null;
}

export interface Quantities {
  rows: QtyRow[];
  summary: QtyRow[];
  steelByBar: { d: string; kg: number }[];
}

export function buildQuantities(b: Building, r: StructureResult): Quantities {
  const s = b.structure.settings;
  const mix = CONCRETE_MIX[s.fck] ?? CONCRETE_MIX[25];
  const rows: QtyRow[] = [];
  const steel = new Map<string, number>();
  const addSteel = (d: string, meters: number) => steel.set(d, (steel.get(d) ?? 0) + meters * (KG_M[d] ?? 0.6));
  let steelByRate = 0;
  const conc = { fund: 0, sup: 0, lean: 0 };
  let forms = 0;
  let excavation = 0;
  const levelById = new Map(b.levels.map((l) => [l.id, l]));
  const depth = s.foundationDepth;

  // ---------- fundação ----------
  let footVol = 0;
  for (const f of r.footings) {
    if (f.kind === 'estaca') {
      const pileVol = f.piles * Math.PI * 0.125 ** 2 * 6;
      footVol += pileVol + f.B * f.L * f.h;
      steelByRate += pileVol * 30 + f.B * f.L * f.h * 60;
    } else {
      footVol += f.B * f.L * f.h;
      steelByRate += f.B * f.L * f.h * 50;
      conc.lean += f.B * f.L * 0.05;
      forms += 2 * (f.B + f.L) * f.h;
      excavation += (f.B + 0.4) * (f.L + 0.4) * depth;
    }
  }
  conc.fund += footVol;
  rows.push({ group: 'Fundação', item: s.foundation === 'estaca' ? 'Concreto das estacas e blocos' : 'Concreto das sapatas', unit: 'm³', qty: footVol });
  if (conc.lean > 0) rows.push({ group: 'Fundação', item: 'Concreto magro (lastro 5 cm)', unit: 'm³', qty: conc.lean });

  // arranques dos pilares (do topo da sapata ao piso)
  let arr = 0;
  for (const f of r.footings) {
    const p = r.pillars.find((x) => x.id === f.pillarId);
    if (p) arr += (p.b / 100) * (p.h / 100) * Math.max(0, depth - f.h);
  }
  conc.fund += arr;
  rows.push({ group: 'Fundação', item: 'Concreto dos arranques dos pilares', unit: 'm³', qty: arr });

  let baldVol = 0;
  for (const v of r.beams.filter((x) => x.levelId === 'baldrame')) {
    baldVol += (v.bw / 100) * (v.h / 100) * v.L;
    forms += 2 * (v.h / 100) * v.L;
    excavation += (v.bw / 100 + 0.3) * (v.h / 100 + 0.1) * v.L;
  }
  conc.fund += baldVol;
  rows.push({ group: 'Fundação', item: 'Concreto das vigas baldrame', unit: 'm³', qty: baldVol });
  if (s.foundation === 'radier') {
    const v = r.totals.footprint * 0.15;
    conc.fund += v;
    rows.push({ group: 'Fundação', item: 'Concreto do radier (15 cm)', unit: 'm³', qty: v });
  }
  rows.push({ group: 'Fundação', item: 'Escavação (sapatas e valas)', unit: 'm³', qty: excavation });

  // ---------- superestrutura ----------
  let pilVol = 0;
  for (const p of r.pillars) {
    const H = levelById.get(p.levelId)?.height ?? 2.95;
    pilVol += (p.b / 100) * (p.h / 100) * H;
    forms += (2 * (p.b + p.h) / 100) * H;
    const bars = parseBars(p.bars);
    if (bars) addSteel(bars.d, bars.n * (H + 0.6));
    const ties = Math.ceil((H * 100) / 15) + 1;
    addSteel('5', ties * ((2 * (p.b - 5 + p.h - 5)) / 100 + 0.1));
  }
  conc.sup += pilVol;
  rows.push({ group: 'Estrutura', item: 'Concreto dos pilares', unit: 'm³', qty: pilVol });

  let beamVol = 0;
  for (const v of r.beams) {
    const bars = parseBars(v.bars);
    if (bars) addSteel(bars.d, bars.n * (v.L + 0.6));
    addSteel('6,3', 2 * (v.L + 0.3));
    const sp = Number(/c\/\s*(\d+)/.exec(v.stirrups)?.[1] ?? 20);
    addSteel('5', (Math.ceil((v.L * 100) / sp) + 1) * ((2 * (v.bw - 5 + v.h - 5)) / 100 + 0.1));
    if (v.levelId === 'baldrame') continue;
    beamVol += (v.bw / 100) * (v.h / 100) * v.L;
    forms += ((2 * v.h + v.bw) / 100) * v.L;
  }
  conc.sup += beamVol;
  rows.push({ group: 'Estrutura', item: 'Concreto das vigas', unit: 'm³', qty: beamVol });

  // ---------- lajes ----------
  let slabVol = 0;
  let slabArea = 0;
  for (const x of r.slabs) {
    const A = x.area - x.holeArea;
    slabArea += A;
    if (s.slab === 'macica') {
      slabVol += A * (x.thickness / 100);
      steelByRate += A * (x.thickness / 100) * 80;
      forms += A;
    } else {
      slabVol += A * (TRELICADA_CONCRETE[x.thickness] ?? 0.065);
      steelByRate += A * 2.5; // tela + negativos
    }
  }
  conc.sup += slabVol;
  rows.push({ group: 'Lajes', item: s.slab === 'macica' ? 'Concreto das lajes maciças' : 'Concreto da capa e nervuras', unit: 'm³', qty: slabVol });
  if (s.slab === 'trelicada') {
    rows.push({ group: 'Lajes', item: 'Vigotas treliçadas (intereixo 42 cm)', unit: 'm', qty: slabArea / 0.42 });
    rows.push({ group: 'Lajes', item: 'Lajotas cerâmicas / EPS', unit: 'un', qty: slabArea * 8 * LOSS.block });
    rows.push({ group: 'Lajes', item: 'Tela soldada Q-92 (capa)', unit: 'm²', qty: slabArea * 1.1 });
  }
  rows.push({ group: 'Lajes', item: 'Escoramento (área de laje)', unit: 'm²', qty: slabArea });

  // ---------- alvenaria, revestimento e contrapiso ----------
  let wallArea = 0;
  let floorArea = 0;
  for (const l of b.levels) {
    for (const w of Object.values(l.plan.walls)) {
      const L = dist(l.plan.nodes[w.a], l.plan.nodes[w.b]);
      const holes = Object.values(l.plan.openings)
        .filter((o) => o.wallId === w.id)
        .reduce((acc, o) => acc + o.width * Math.min(o.height, w.height - o.sill), 0);
      wallArea += Math.max(0, L * w.height - holes);
    }
  }
  for (const x of r.slabs) floorArea += x.area - x.holeArea;
  floorArea += r.totals.footprint; // contrapiso do térreo
  const mortarLay = wallArea * 0.013 * LOSS.mortar;
  const mortarPlaster = wallArea * 0.04 * LOSS.mortar;
  const screed = floorArea * 0.04 * LOSS.mortar;
  rows.push({ group: 'Alvenaria e revestimento', item: 'Blocos cerâmicos 14×19×29 cm', unit: 'un', qty: wallArea * 17 * LOSS.block, note: `${f1(wallArea)} m² de parede` });
  rows.push({ group: 'Alvenaria e revestimento', item: 'Argamassa de assentamento 1:2:8', unit: 'm³', qty: mortarLay });
  rows.push({ group: 'Alvenaria e revestimento', item: 'Chapisco e reboco (2 faces, 2 cm)', unit: 'm³', qty: mortarPlaster });
  rows.push({ group: 'Alvenaria e revestimento', item: 'Contrapiso 4 cm (traço 1:4)', unit: 'm³', qty: screed, note: `${f1(floorArea)} m² de piso` });

  // ---------- telhado ----------
  for (const e of r.roof?.elements ?? []) rows.push({ group: 'Telhado', item: `${e.name} (${e.section})`, unit: '', qty: NaN, note: e.quantity });

  // ---------- aço ----------
  const steelBars = [...steel.entries()].map(([d, kg]) => ({ d, kg: kg * LOSS.steel })).sort((a, c) => parseFloat(a.d.replace(',', '.')) - parseFloat(c.d.replace(',', '.')));
  const steelRate = steelByRate * LOSS.steel;
  for (const x of steelBars) rows.push({ group: 'Aço CA-50/60', item: `Barras Ø${x.d} mm`, unit: 'kg', qty: x.kg });
  rows.push({ group: 'Aço CA-50/60', item: 'Armadura de sapatas e lajes (por taxa)', unit: 'kg', qty: steelRate });

  // ---------- resumo ----------
  const structuralConcrete = (conc.fund + conc.sup) * LOSS.concrete;
  const lean = conc.lean * LOSS.concrete;
  const cementKg = structuralConcrete * mix.cement + lean * LEAN.cement + (mortarLay + mortarPlaster) * MORTAR.cement + screed * SCREED.cement;
  const sand = structuralConcrete * mix.sand + lean * LEAN.sand + (mortarLay + mortarPlaster) * MORTAR.sand + screed * SCREED.sand;
  const gravel = structuralConcrete * mix.gravel + lean * LEAN.gravel;
  const lime = (mortarLay + mortarPlaster) * MORTAR.lime;
  const steelTotal = steelBars.reduce((acc, x) => acc + x.kg, 0) + steelRate;

  const summary: QtyRow[] = [
    { group: 'Resumo', item: `Concreto estrutural C${s.fck} (fundação ${f1(conc.fund * LOSS.concrete)} + estrutura ${f1(conc.sup * LOSS.concrete)} m³)`, unit: 'm³', qty: structuralConcrete },
    { group: 'Resumo', item: 'Cimento Portland (sacos de 50 kg)', unit: 'sc', qty: Math.ceil(cementKg / 50) },
    { group: 'Resumo', item: 'Areia média lavada', unit: 'm³', qty: sand },
    { group: 'Resumo', item: 'Brita 1', unit: 'm³', qty: gravel },
    { group: 'Resumo', item: 'Cal hidratada (sacos de 20 kg)', unit: 'sc', qty: Math.ceil(lime / 20) },
    { group: 'Resumo', item: 'Água (amassamento)', unit: 'L', qty: Math.round(cementKg * 0.55) },
    { group: 'Resumo', item: 'Aço CA-50/60', unit: 'kg', qty: steelTotal },
    { group: 'Resumo', item: 'Fôrmas (chapa compensada)', unit: 'm²', qty: forms * 1.1 },
    { group: 'Resumo', item: 'Blocos cerâmicos 14×19×29', unit: 'un', qty: Math.ceil(wallArea * 17 * LOSS.block) },
    { group: 'Resumo', item: 'Escavação', unit: 'm³', qty: excavation },
  ];
  return { rows, summary, steelByBar: steelBars };
}

export const fmtQty = (q: QtyRow) =>
  Number.isNaN(q.qty) ? q.note ?? '' : `${q.qty.toLocaleString('pt-BR', { maximumFractionDigits: q.unit === 'un' || q.unit === 'sc' || q.unit === 'L' ? 0 : q.unit === 'kg' ? 0 : 2 })} ${q.unit}`;
