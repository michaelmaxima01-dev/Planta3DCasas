/**
 * Quantitativo de materiais da obra, separado por etapa:
 *   Fundação · Estrutura (pilares, vigas, lajes) · Alvenaria e revestimentos · Telhado
 *
 * Volumes e comprimentos vêm da geometria e do dimensionamento; consumos de cimento, areia, brita e cal
 * usam traços típicos de obra (concreto virado em obra e argamassas usuais). Perdas incluídas:
 * concreto 5%, aço 10%, argamassas 10%, blocos 5%. Valores para orçamento preliminar.
 */
import { dist } from '../geometry/vec';
import { CATALOG_BY_ID } from '../catalog/catalog';
import { detectRooms } from '../geometry/rooms';
import { ceilingDef } from '../model/ceiling';
import { finishName } from '../model/finishes';
import { styleName } from '../model/openings';
import { type WallFinish, wallFinishDef } from '../model/wallFinish';
import type { Building } from '../model/types';
import type { StructureResult } from './analyze';

export interface QtyRow {
  group: string;
  item: string;
  unit: string;
  qty: number;
  note?: string;
}

export type StageKey = 'fundacao' | 'estrutura' | 'alvenaria' | 'telhado' | 'acabamentos' | 'muros';

export interface Stage {
  key: StageKey;
  name: string;
  /** Itens detalhados (peças, volumes). */
  rows: QtyRow[];
  /** Materiais para compra desta etapa. */
  summary: QtyRow[];
}

export interface Quantities {
  stages: Stage[];
  /** Todas as linhas detalhadas (compatibilidade). */
  rows: QtyRow[];
  /** Resumo total da obra. */
  summary: QtyRow[];
  steelByBar: { d: string; kg: number }[];
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
const MORTAR = { cement: 175, lime: 175, sand: 1.2 }; // argamassa 1:2:8
const SCREED = { cement: 320, sand: 1.2 }; // contrapiso 1:4
const KG_M: Record<string, number> = { '5': 0.154, '6,3': 0.245, '8': 0.395, '10': 0.617, '12,5': 0.963, '16': 1.578, '20': 2.466 };
const LOSS = { concrete: 1.05, steel: 1.1, mortar: 1.1, block: 1.05 };
const TRELICADA_CONCRETE: Record<number, number> = { 12: 0.055, 16: 0.065, 20: 0.075, 25: 0.09 };

const f2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function parseBars(s: string): { n: number; d: string } | null {
  const m = /(\d+)\s*Ø\s*([\d,]+)/.exec(s);
  return m ? { n: Number(m[1]), d: m[2] } : null;
}

/** Acumulador de materiais de uma etapa. */
class Acc {
  concrete = 0;
  lean = 0;
  mortar = 0;
  screed = 0;
  steel = new Map<string, number>();
  steelRate = 0;
  forms = 0;
  rows: QtyRow[] = [];
  readonly group: string;
  constructor(group: string) {
    this.group = group;
  }
  row(item: string, unit: string, qty: number, note?: string) {
    this.rows.push({ group: this.group, item, unit, qty, note });
  }
  bar(d: string, meters: number) {
    this.steel.set(d, (this.steel.get(d) ?? 0) + meters * (KG_M[d] ?? 0.6));
  }
  steelKg() {
    return ([...this.steel.values()].reduce((a, b) => a + b, 0) + this.steelRate) * LOSS.steel;
  }
  summary(fck: number, extra: QtyRow[] = []): QtyRow[] {
    const mix = CONCRETE_MIX[fck] ?? CONCRETE_MIX[25];
    const c = this.concrete * LOSS.concrete;
    const l = this.lean * LOSS.concrete;
    const cement = c * mix.cement + l * LEAN.cement + this.mortar * MORTAR.cement + this.screed * SCREED.cement;
    const sand = c * mix.sand + l * LEAN.sand + this.mortar * MORTAR.sand + this.screed * SCREED.sand;
    const gravel = c * mix.gravel + l * LEAN.gravel;
    const lime = this.mortar * MORTAR.lime;
    const g = this.group;
    const out: QtyRow[] = [];
    if (c > 0) out.push({ group: g, item: `Concreto C${fck}`, unit: 'm³', qty: c });
    if (l > 0) out.push({ group: g, item: 'Concreto magro', unit: 'm³', qty: l });
    if (cement > 0) out.push({ group: g, item: 'Cimento Portland (sacos de 50 kg)', unit: 'sc', qty: Math.ceil(cement / 50) });
    if (sand > 0) out.push({ group: g, item: 'Areia média lavada', unit: 'm³', qty: sand });
    if (gravel > 0) out.push({ group: g, item: 'Brita 1', unit: 'm³', qty: gravel });
    if (lime > 0) out.push({ group: g, item: 'Cal hidratada (sacos de 20 kg)', unit: 'sc', qty: Math.ceil(lime / 20) });
    if (cement > 0) out.push({ group: g, item: 'Água (amassamento)', unit: 'L', qty: Math.round(cement * 0.55) });
    const st = this.steelKg();
    if (st > 0) out.push({ group: g, item: 'Aço CA-50/60', unit: 'kg', qty: st });
    if (this.forms > 0) out.push({ group: g, item: 'Fôrmas (chapa compensada)', unit: 'm²', qty: this.forms * 1.1 });
    return [...out, ...extra];
  }
}

export function buildQuantities(b: Building, r: StructureResult): Quantities {
  const s = b.structure.settings;
  const levelById = new Map(b.levels.map((l) => [l.id, l]));
  const depth = s.foundationDepth;
  const F = new Acc('Fundação');
  const E = new Acc('Estrutura');
  const A = new Acc('Alvenaria e revestimentos');
  const T = new Acc('Telhado');

  // ---------- fundação ----------
  let footVol = 0;
  let excavation = 0;
  let lean = 0;
  for (const f of r.footings) {
    if (f.kind === 'estaca') {
      const pileVol = f.piles * Math.PI * 0.125 ** 2 * 6;
      footVol += pileVol + f.B * f.L * f.h;
      F.steelRate += pileVol * 30 + f.B * f.L * f.h * 60;
    } else {
      footVol += f.B * f.L * f.h;
      F.steelRate += f.B * f.L * f.h * 50;
      lean += f.B * f.L * 0.05;
      F.forms += 2 * (f.B + f.L) * f.h;
      excavation += (f.B + 0.4) * (f.L + 0.4) * depth;
    }
  }
  F.row(s.foundation === 'estaca' ? 'Concreto das estacas e blocos' : 'Concreto das sapatas', 'm³', footVol, `${r.footings.length} un`);
  if (lean > 0) F.row('Concreto magro (lastro 5 cm)', 'm³', lean);
  let arr = 0;
  for (const f of r.footings) for (const pid of f.pillarIds) {
    const p = r.pillars.find((x) => x.id === pid);
    if (!p) continue;
    const H = Math.max(0, depth - f.h);
    arr += (p.b / 100) * (p.h / 100) * H;
    const bars = parseBars(p.bars);
    if (bars) F.bar(bars.d, bars.n * (H + 0.8));
    F.forms += (2 * (p.b + p.h) / 100) * H;
  }
  F.row('Concreto dos arranques dos pilares', 'm³', arr);
  let baldVol = 0;
  for (const v of r.beams.filter((x) => x.levelId === 'baldrame')) {
    baldVol += (v.bw / 100) * (v.h / 100) * v.L;
    F.forms += 2 * (v.h / 100) * v.L;
    excavation += (v.bw / 100 + 0.3) * (v.h / 100 + 0.1) * v.L;
    const bars = parseBars(v.bars);
    if (bars) F.bar(bars.d, bars.n * (v.L + 0.6));
    F.bar('6,3', 2 * (v.L + 0.3));
    const sp = Number(/c\/\s*(\d+)/.exec(v.stirrups)?.[1] ?? 20);
    F.bar('5', (Math.ceil((v.L * 100) / sp) + 1) * ((2 * (v.bw - 5 + v.h - 5)) / 100 + 0.1));
  }
  F.row('Concreto das vigas baldrame', 'm³', baldVol, `${r.beams.filter((x) => x.levelId === 'baldrame').length} vigas`);
  let radier = 0;
  if (s.foundation === 'radier') {
    radier = r.totals.footprint * 0.15;
    F.row('Concreto do radier (15 cm)', 'm³', radier);
    F.steelRate += radier * 60;
  }
  F.concrete = footVol + arr + baldVol + radier;
  F.lean = lean;
  F.row('Escavação (sapatas e valas)', 'm³', excavation);
  F.row('Impermeabilização dos baldrames (betume)', 'm²', r.beams.filter((x) => x.levelId === 'baldrame').reduce((a, v) => a + v.L * (v.bw / 100 + 2 * (v.h / 100)), 0));

  // ---------- estrutura ----------
  let pilVol = 0;
  for (const p of r.pillars) {
    const H = levelById.get(p.levelId)?.height ?? 2.95;
    pilVol += (p.b / 100) * (p.h / 100) * H;
    E.forms += (2 * (p.b + p.h) / 100) * H;
    const bars = parseBars(p.bars);
    if (bars) E.bar(bars.d, bars.n * (H + 0.6));
    E.bar('5', (Math.ceil((H * 100) / 15) + 1) * ((2 * (p.b - 5 + p.h - 5)) / 100 + 0.1));
  }
  E.row('Concreto dos pilares', 'm³', pilVol, `${r.pillars.length} trechos`);
  let beamVol = 0;
  const upperBeams = r.beams.filter((x) => x.levelId !== 'baldrame');
  for (const v of upperBeams) {
    beamVol += (v.bw / 100) * (v.h / 100) * v.L;
    E.forms += ((2 * v.h + v.bw) / 100) * v.L;
    const bars = parseBars(v.bars);
    if (bars) E.bar(bars.d, bars.n * (v.L + 0.6));
    E.bar('6,3', 2 * (v.L + 0.3));
    const sp = Number(/c\/\s*(\d+)/.exec(v.stirrups)?.[1] ?? 20);
    E.bar('5', (Math.ceil((v.L * 100) / sp) + 1) * ((2 * (v.bw - 5 + v.h - 5)) / 100 + 0.1));
  }
  E.row('Concreto das vigas', 'm³', beamVol, `${upperBeams.length} vigas`);
  let slabVol = 0;
  let slabArea = 0;
  for (const x of r.slabs) {
    const Ar = x.area - x.holeArea;
    slabArea += Ar;
    if (s.slab === 'macica') {
      slabVol += Ar * (x.thickness / 100);
      E.steelRate += Ar * (x.thickness / 100) * 80;
      E.forms += Ar;
    } else {
      slabVol += Ar * (TRELICADA_CONCRETE[x.thickness] ?? 0.065);
      E.steelRate += Ar * 2.5;
    }
  }
  E.row(s.slab === 'macica' ? 'Concreto das lajes maciças' : 'Concreto da capa e nervuras das lajes', 'm³', slabVol, `${f1(slabArea)} m² de laje`);
  E.concrete = pilVol + beamVol + slabVol;
  const slabExtra: QtyRow[] = [];
  if (s.slab === 'trelicada' && slabArea > 0) {
    slabExtra.push({ group: 'Estrutura', item: 'Vigotas treliçadas (intereixo 42 cm)', unit: 'm', qty: slabArea / 0.42 });
    slabExtra.push({ group: 'Estrutura', item: 'Lajotas cerâmicas / EPS', unit: 'un', qty: slabArea * 8 * LOSS.block });
    slabExtra.push({ group: 'Estrutura', item: 'Tela soldada Q-92 (capa)', unit: 'm²', qty: slabArea * 1.1 });
  }
  if (slabArea > 0) slabExtra.push({ group: 'Estrutura', item: 'Escoramento de lajes', unit: 'm²', qty: slabArea });
  E.rows.push(...slabExtra);

  // ---------- alvenaria, revestimento e contrapiso ----------
  let wallArea = 0;
  for (const l of b.levels) {
    for (const w of Object.values(l.plan.walls)) {
      const L = dist(l.plan.nodes[w.a], l.plan.nodes[w.b]);
      const holes = Object.values(l.plan.openings)
        .filter((o) => o.wallId === w.id)
        .reduce((acc, o) => acc + o.width * Math.min(o.height, w.height - o.sill), 0);
      wallArea += Math.max(0, L * w.height - holes);
    }
  }
  let floorArea = r.totals.footprint;
  for (const x of r.slabs) floorArea += x.area - x.holeArea;
  const mortarLay = wallArea * 0.013 * LOSS.mortar;
  const plaster = wallArea * 0.04 * LOSS.mortar;
  const screed = floorArea * 0.04 * LOSS.mortar;
  A.mortar = mortarLay + plaster;
  A.screed = screed;
  const blocks = wallArea * 17 * LOSS.block;
  A.row('Alvenaria (área líquida de paredes)', 'm²', wallArea);
  A.row('Blocos cerâmicos 14×19×29 cm', 'un', blocks);
  A.row('Argamassa de assentamento 1:2:8', 'm³', mortarLay);
  A.row('Chapisco e reboco (2 faces, 2 cm)', 'm³', plaster);
  A.row('Contrapiso 4 cm (traço 1:4)', 'm³', screed, `${f1(floorArea)} m² de piso`);
  const blockRow: QtyRow[] = [{ group: A.group, item: 'Blocos cerâmicos 14×19×29', unit: 'un', qty: Math.ceil(blocks) }];
  // ---------- telhado ----------
  const roofRows: QtyRow[] = [];
  let wood = 0;
  for (const e of r.roof?.elements ?? []) {
    T.row(`${e.name}${e.section !== '-' ? ` (${e.section})` : ''}`, e.unit, e.qty, e.spacing !== '-' ? e.spacing : undefined);
    wood += e.wood ?? 0;
  }
  if (wood > 0) roofRows.push({ group: T.group, item: 'Madeira serrada (total do madeiramento)', unit: 'm³', qty: wood * 1.1 });
  for (const e of r.roof?.elements ?? []) {
    if (/Telhas|Shingle|Chapas OSB|Calhas|Cumeeiras/.test(e.name)) roofRows.push({ group: T.group, item: e.name, unit: e.unit, qty: e.qty });
  }

  // ---------- acabamentos ----------
  const K = new Acc('Acabamentos');
  const kMat = new Map<string, QtyRow>();
  const addMat = (item: string, unit: string, qty: number) => {
    const k = `${item}|${unit}`;
    const prev = kMat.get(k);
    if (prev) prev.qty += qty;
    else kMat.set(k, { group: K.group, item, unit, qty });
  };
  const roundUnits = (r: QtyRow) => (r.unit === 'un' || r.unit === 'sc' ? { ...r, qty: Math.ceil(r.qty) } : r);
  // paredes: as duas faces, descontando portas e janelas, por acabamento
  const byFinish = new Map<string, number>();
  for (const l of b.levels) {
    for (const w of Object.values(l.plan.walls)) {
      const L = dist(l.plan.nodes[w.a], l.plan.nodes[w.b]);
      const holes = Object.values(l.plan.openings)
        .filter((o) => o.wallId === w.id)
        .reduce((acc, o) => acc + o.width * Math.min(o.height, w.height - o.sill), 0);
      const area = Math.max(0, L * w.height - holes) * 2;
      const fk = w.finish ?? b.colors?.wallFinish ?? 'pintura';
      byFinish.set(fk, (byFinish.get(fk) ?? 0) + area);
    }
  }
  // teto pintado onde não há forro (cômodos de cada andar)
  let ceilingPaint = 0;
  const floorBy = new Map<string, number>();
  let skirting = 0;
  for (const l of b.levels) {
    const rooms = detectRooms(l.plan);
    const area = rooms.reduce((acc, rm) => acc + rm.area, 0);
    if (l.ceiling) {
      const def = ceilingDef(l.ceiling.type);
      if (area > 0) {
        K.row(`Forro: ${def.name} (${l.name})`, 'm²', area);
        for (const m of def.materials) addMat(m.item, m.unit, area * m.perM2 * 1.05);
      }
    } else ceilingPaint += area;
    for (const rm of rooms) {
      const name = finishName(rm.floorColor);
      floorBy.set(name, (floorBy.get(name) ?? 0) + rm.area);
      skirting += rm.perimeter;
    }
    // descontar vãos de porta do rodapé
    skirting -= Object.values(l.plan.openings).filter((o) => o.kind === 'door').reduce((acc, o) => acc + o.width * 2, 0);
  }
  for (const [fk, area] of byFinish) {
    if (area <= 0) continue;
    const def = wallFinishDef(fk as WallFinish);
    K.row(`Paredes: ${def.name} (2 faces)`, 'm²', area);
    for (const m of def.materials) addMat(m.item, m.unit, area * m.perM2);
  }
  if (ceilingPaint > 0) {
    K.row('Teto: pintura (cômodos sem forro)', 'm²', ceilingPaint);
    for (const m of wallFinishDef('pintura').materials) addMat(m.item, m.unit, ceilingPaint * m.perM2);
  }
  for (const [name, area] of floorBy) {
    if (area <= 0) continue;
    K.row(`Piso: ${name}`, 'm²', area);
    if (/madeira/i.test(name)) {
      addMat('Piso vinílico / laminado (madeira)', 'm²', area * 1.1);
      addMat('Manta acústica para piso', 'm²', area * 1.05);
    } else if (/porcelanato/i.test(name)) {
      addMat('Porcelanato de piso', 'm²', area * 1.1);
      addMat('Argamassa colante AC-III (sacos 20 kg)', 'sc', (area * 5) / 20);
      addMat('Rejunte (kg)', 'kg', area * 0.3);
    } else if (/cimento/i.test(name)) {
      addMat('Cimento queimado (cimento + pó xadrez)', 'm²', area * 1.05);
    } else {
      addMat('Piso cerâmico', 'm²', area * 1.1);
      addMat('Argamassa colante AC-I (sacos 20 kg)', 'sc', (area * 4) / 20);
      addMat('Rejunte (kg)', 'kg', area * 0.4);
    }
  }
  if (skirting > 0) {
    K.row('Rodapés (perímetro dos cômodos, sem os vãos de porta)', 'm', skirting);
    addMat('Rodapé', 'm', skirting * 1.05);
  }
  // esquadrias por tipo (detalhe por medida), peitoris e soleiras
  const esq = new Map<string, number>();
  let sills = 0;
  let thresholds = 0;
  for (const l of b.levels) {
    for (const o of Object.values(l.plan.openings)) {
      const name = styleName(o);
      const k = `${name} (${f2(o.width)} × ${f2(o.height)} m)`;
      esq.set(k, (esq.get(k) ?? 0) + 1);
      addMat(`Esquadria: ${name}`, 'un', 1);
      if (o.kind === 'window' && o.sill > 0.05) sills += o.width + 0.06;
      else thresholds += o.width;
    }
  }
  for (const [k, n] of esq) K.row(k, 'un', n);
  if (sills > 0) addMat('Peitoris de granito', 'm', sills);
  if (thresholds > 0) addMat('Soleiras de granito', 'm', thresholds);
  const kExtra = [...kMat.values()].map(roundUnits);

  // ---------- muros, muretas e cercas ----------
  const M = new Acc('Muros e cercas');
  const mExtra: QtyRow[] = [];
  const mm = { block: 0, brick: 0, gradil: 0, mesh: 0, wood: 0, wire: 0, glass: 0, stone: 0, plates: 0, posts: 0, plants: 0, paint: 0, gates: 0 };
  let mLen = 0;
  const muroFinish = new Map<string, QtyRow>();
  for (const f of Object.values(b.levels[0]?.plan.furniture ?? {})) {
    const c = CATALOG_BY_ID[f.catalogId];
    if (c?.gate) {
      mm.gates++;
      M.row(c.name, 'un', 1, `${f1(f.width)} m`);
      continue;
    }
    if (!c?.fence || !c.fenceQty) continue;
    const L = f.width;
    const H = f.height;
    if (f.finish && f.finish !== 'pintura') {
      const def = wallFinishDef(f.finish);
      const area = L * H * 2;
      for (const m of def.materials) {
        const k = `${m.item}|${m.unit}`;
        const prev = muroFinish.get(k);
        if (prev) prev.qty += area * m.perM2;
        else muroFinish.set(k, { group: 'Muros e cercas', item: m.item, unit: m.unit, qty: area * m.perM2 });
      }
    }
    mLen += L;
    const masonry = (h: number, kind: 'block' | 'brick') => {
      const area = L * h;
      if (kind === 'block') mm.block += area;
      else mm.brick += area;
      M.mortar += area * 0.013 * LOSS.mortar + (kind === 'block' ? area * 2 * 0.02 * LOSS.mortar : 0);
      if (kind === 'block' && (!f.finish || f.finish === 'pintura')) mm.paint += area * 2;
      // pilaretes a cada 3 m e cinta/baldrame corrido 15×30
      const piers = Math.ceil(L / 3) + 1;
      M.concrete += piers * 0.15 * 0.15 * h + L * 0.15 * 0.3;
      M.bar('8', piers * 4 * (h + 0.5) + L * 4);
      M.bar('5', (piers * Math.ceil(h / 0.15) + Math.ceil(L / 0.15)) * 0.6);
      // brocas (estacas curtas Ø25, 2 m) sob os pilaretes
      M.concrete += piers * Math.PI * 0.125 ** 2 * 2;
    };
    switch (c.fenceQty) {
      case 'bloco':
        masonry(Math.min(H, 2.5), 'block');
        break;
      case 'tijolo':
        masonry(H, 'brick');
        break;
      case 'mureta':
        masonry(H, 'block');
        break;
      case 'mureta_gradil':
        masonry(0.6, 'block');
        mm.gradil += L * (H - 0.6);
        break;
      case 'mureta_vidro':
        masonry(0.6, 'block');
        mm.glass += L * (H - 0.6);
        break;
      case 'pedra':
        mm.stone += L * H * f.depth;
        M.mortar += L * H * f.depth * 0.3;
        break;
      case 'premoldado':
        mm.plates += L * H;
        mm.posts += Math.ceil(L / 2) + 1;
        break;
      case 'gradil':
        mm.gradil += L * H;
        mm.posts += Math.ceil(L / 2) + 1;
        break;
      case 'alambrado':
        mm.mesh += L * H;
        mm.posts += Math.ceil(L / 2.5) + 1;
        break;
      case 'madeira':
      case 'bambu':
        mm.wood += L;
        break;
      case 'arame':
        mm.wire += L * 4;
        mm.posts += Math.ceil(L / 2.5) + 1;
        break;
      case 'viva':
        mm.plants += Math.ceil(L / 0.4);
        break;
    }
    M.row(c.name, 'm', L, `altura ${f1(H)} m`);
  }
  if (mLen > 0 || mm.gates > 0) {
    const area = mm.block + mm.brick;
    if (mm.block > 0) mExtra.push({ group: M.group, item: 'Blocos de concreto 14×19×39 (muros)', unit: 'un', qty: Math.ceil(mm.block * 12.5 * LOSS.block) });
    if (mm.brick > 0) mExtra.push({ group: M.group, item: 'Tijolos maciços aparentes', unit: 'un', qty: Math.ceil(mm.brick * 48 * LOSS.block) });
    if (mm.paint > 0) mExtra.push({ group: M.group, item: 'Pintura acrílica externa (2 faces)', unit: 'm²', qty: mm.paint }, { group: M.group, item: 'Tinta acrílica (latas de 18 L, 2 demãos)', unit: 'un', qty: Math.ceil((mm.paint * 2) / 200) });
    if (mm.gradil > 0) mExtra.push({ group: M.group, item: 'Gradil metálico (com pintura)', unit: 'm²', qty: mm.gradil });
    if (mm.glass > 0) mExtra.push({ group: M.group, item: 'Vidro temperado 10 mm', unit: 'm²', qty: mm.glass });
    if (mm.mesh > 0) mExtra.push({ group: M.group, item: 'Tela de alambrado (fio 12)', unit: 'm²', qty: mm.mesh * 1.05 });
    if (mm.plates > 0) mExtra.push({ group: M.group, item: 'Placas pré-moldadas de concreto', unit: 'm²', qty: mm.plates });
    if (mm.stone > 0) mExtra.push({ group: M.group, item: 'Pedra rachão', unit: 'm³', qty: mm.stone * 1.1 });
    if (mm.posts > 0) mExtra.push({ group: M.group, item: 'Mourões / postes', unit: 'un', qty: mm.posts });
    if (mm.wood > 0) mExtra.push({ group: M.group, item: 'Cerca de madeira/bambu (painéis)', unit: 'm', qty: mm.wood });
    if (mm.wire > 0) mExtra.push({ group: M.group, item: 'Arame liso/farpado', unit: 'm', qty: mm.wire * 1.1 });
    if (mm.plants > 0) mExtra.push({ group: M.group, item: 'Mudas para cerca viva', unit: 'un', qty: mm.plants });
    if (mm.gates > 0) mExtra.push({ group: M.group, item: 'Portões', unit: 'un', qty: mm.gates });
    for (const r of muroFinish.values()) mExtra.push(r.unit === 'un' || r.unit === 'sc' ? { ...r, qty: Math.ceil(r.qty) } : r);
    M.row('Comprimento total de muros e cercas', 'm', mLen, area > 0 ? `${f1(area)} m² de alvenaria` : undefined);
  }

  // ---------- aço por bitola (total) ----------
  const allBars = new Map<string, number>();
  for (const acc of [F, E, M]) for (const [d, kg] of acc.steel) allBars.set(d, (allBars.get(d) ?? 0) + kg);
  const steelByBar = [...allBars.entries()]
    .map(([d, kg]) => ({ d, kg: kg * LOSS.steel }))
    .sort((a, c) => parseFloat(a.d.replace(',', '.')) - parseFloat(c.d.replace(',', '.')));
  for (const acc of [F, E]) {
    for (const [d, kg] of [...acc.steel.entries()].sort((a, c) => parseFloat(a[0].replace(',', '.')) - parseFloat(c[0].replace(',', '.')))) {
      acc.row(`Aço Ø${d} mm`, 'kg', kg * LOSS.steel);
    }
    if (acc.steelRate > 0) acc.row(acc === F ? 'Aço de sapatas/radier (por taxa)' : 'Aço de lajes (por taxa)', 'kg', acc.steelRate * LOSS.steel);
  }

  const stages: Stage[] = [
    { key: 'fundacao', name: 'Fundação', rows: F.rows, summary: F.summary(s.fck, [{ group: F.group, item: 'Escavação', unit: 'm³', qty: excavation }]) },
    { key: 'estrutura', name: 'Estrutura', rows: E.rows, summary: E.summary(s.fck, slabExtra) },
    { key: 'alvenaria', name: 'Alvenaria', rows: A.rows, summary: A.summary(s.fck, blockRow) },
    { key: 'telhado', name: 'Telhado', rows: T.rows, summary: roofRows },
  ];
  if (K.rows.length) stages.push({ key: 'acabamentos', name: 'Acabamentos', rows: K.rows, summary: kExtra });
  if (M.rows.length) {
    for (const [d, kg] of [...M.steel.entries()]) M.row(`Aço Ø${d} mm (pilaretes e cintas)`, 'kg', kg * LOSS.steel);
    stages.push({ key: 'muros', name: 'Muros e cercas', rows: M.rows, summary: M.summary(s.fck, mExtra) });
  }

  // ---------- total ----------
  const tot = new Acc('Total');
  tot.concrete = F.concrete + E.concrete + M.concrete;
  tot.lean = F.lean;
  tot.mortar = A.mortar + M.mortar;
  tot.screed = A.screed;
  tot.steelRate = F.steelRate + E.steelRate;
  for (const [d, kg] of allBars) tot.steel.set(d, kg);
  tot.forms = F.forms + E.forms;
  const summary = tot.summary(s.fck, [
    ...blockRow.map((x) => ({ ...x, group: 'Total' })),
    { group: 'Total', item: 'Escavação', unit: 'm³', qty: excavation },
    ...roofRows.map((x) => ({ ...x, group: 'Total' })),
    ...mExtra.map((x) => ({ ...x, group: 'Total' })),
    ...kExtra.map((x) => ({ ...x, group: 'Total' })),
  ]);
  summary[0] = { ...summary[0], item: `Concreto estrutural C${s.fck} (fundação ${f1(F.concrete * LOSS.concrete)} + estrutura ${f1(E.concrete * LOSS.concrete)}${M.concrete > 0 ? ` + muros ${f1(M.concrete * LOSS.concrete)}` : ''} m³)` };

  return { stages, rows: stages.flatMap((st) => st.rows), summary, steelByBar };
}

export const fmtQty = (q: QtyRow) =>
  Number.isNaN(q.qty)
    ? q.note ?? ''
    : `${q.qty.toLocaleString('pt-BR', { maximumFractionDigits: q.unit === 'un' || q.unit === 'sc' || q.unit === 'L' || q.unit === 'kg' ? 0 : 2 })} ${q.unit}`;
