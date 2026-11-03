/**
 * Relatório estrutural (memória de pré-dimensionamento) com termo de responsabilidade técnica
 * para assinatura do engenheiro.
 */
import type { jsPDF } from 'jspdf';
import { type Vec2 } from '../geometry/vec';
import { computeWallGeometry } from '../geometry/walls';
import { boundsOf } from '../export/drawing';
import { Doc, type Paper, pickScale } from '../export/pdf';
import { DEFAULT_META } from '../model/finishes';
import type { Building, ProjectMeta } from '../model/types';
import type { Status, StructureResult } from './analyze';
import { ROOF_TYPES } from '../roof/roof';
import { buildQuantities, fmtQty } from './quantities';
import { BALDRAME, ROOFS, SOILS } from './types';

const f2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
const ST: Record<Status, string> = { ok: 'Atende', warn: 'Atenção', fail: 'Não atende' };
const ST_COLOR: Record<Status, string> = { ok: '#2f9e44', warn: '#c27c0e', fail: '#c92a2a' };

/** Carimbo das folhas da estrutura: o responsável é o engenheiro (CREA e ART). */
export function engineerMeta(b: Building): ProjectMeta {
  const meta = { ...DEFAULT_META, ...b.meta };
  return {
    ...meta,
    author: meta.engineer || meta.author,
    registry: [meta.engineerRegistry ? `CREA ${meta.engineerRegistry}` : '', meta.art ? `ART ${meta.art}` : ''].filter(Boolean).join(' - ') || meta.registry,
  };
}

/** Relatório estrutural avulso. */
export function buildStructuralReport(b: Building, r: StructureResult, paper: Paper = 'A3'): jsPDF {
  const doc = new Doc(paper, engineerMeta(b));
  appendStructuralSheets(doc, b, r);
  doc.finish();
  return doc.pdf;
}

/** Folhas da estrutura, usadas no relatório avulso e no fim do caderno do projeto. */
export function appendStructuralSheets(doc: Doc, b: Building, r: StructureResult) {
  const previous = doc.activeMeta;
  doc.activeMeta = engineerMeta(b);
  const meta = { ...DEFAULT_META, ...b.meta };
  const s = b.structure.settings;
  const levelName = (id: string) => (id === BALDRAME ? 'Fundação' : b.levels.find((l) => l.id === id)?.name ?? '');
  const more = (title: string) => () => {
    doc.newSheet(title);
    return doc.area.y;
  };

  // ---------- 1. premissas ----------
  doc.newSheet('Premissas e resumo');
  let a = doc.area;
  let y = doc.heading('Relatório estrutural - pré-dimensionamento', a.x, a.y + 2, 5);
  doc.text(meta.title, a.x, y, 3, { color: '#495057' });
  y += 10;
  const colW = (a.w - 10) / 2;
  const params: [string, string][] = [
    ['Sistema estrutural', 'Concreto armado moldado in loco + alvenaria de vedação'],
    ['Concreto / aço', `C${s.fck} (fck = ${s.fck} MPa) / CA-50 (fyk = ${s.fyk} MPa)`],
    ['Lajes', s.slab === 'macica' ? 'Maciças' : 'Pré-moldadas treliçadas'],
    ['Cobertura', ROOFS.find((x) => x.key === s.roof)?.name ?? ''],
    ['Sobrecarga de uso', `${f2(s.liveLoad)} kN/m² (cobertura: ${f2(s.roofLiveLoad)} kN/m²)`],
    ['Contrapiso e revestimento', `${f2(s.finishLoad)} kN/m²`],
    ['Alvenaria', `${f1(s.wallUnitWeight)} kN/m³ + revestimento ${f2(s.wallFinishLoad)} kN/m²`],
    ['Solo', `${SOILS.find((x) => x.key === s.soil)?.name ?? ''} - tensão admissível ${f0(s.soilStress)} kPa`],
    ['Fundação', s.foundation === 'sapata' ? 'Sapatas isoladas + vigas baldrame' : s.foundation === 'radier' ? 'Radier' : `Estacas (${f0(s.pileCapacity)} kN/estaca) + blocos`],
    ['Profundidade da fundação', `${f2(s.foundationDepth)} m`],
    ['Coeficientes de segurança', 'ações 1,4 (NBR 8681); concreto 1,4; aço 1,15 (NBR 6118)'],
  ];
  y = doc.table(a.x, y, [colW * 0.38, colW * 0.62], ['Parâmetro', 'Valor adotado'], params, { rowH: 6.2 });

  const counts = (arr: { status: Status }[]) => (['ok', 'warn', 'fail'] as Status[]).map((k) => arr.filter((x) => x.status === k).length);
  const summary: string[][] = [
    ['Lajes', ...counts(r.slabs).map(String)],
    ['Vigas', ...counts(r.beams).map(String)],
    ['Pilares', ...counts(r.pillars).map(String)],
    ['Fundações', ...counts(r.footings).map(String)],
  ];
  const x2 = a.x + colW + 10;
  let y2 = doc.heading('Resumo da verificação', x2, a.y + 22, 3.4);
  y2 = doc.table(x2, y2, [colW * 0.4, colW * 0.2, colW * 0.2, colW * 0.2], ['Elemento', 'Atende', 'Atenção', 'Não atende'], summary, { align: ['left', 'right', 'right', 'right'] });
  y2 += 6;
  const totals: [string, string][] = [
    ['Peso total na fundação', `${f0(r.totals.weight)} kN (${f1(r.totals.weight / 9.81)} t)`],
    ['Projeção do térreo', `${f2(r.totals.footprint)} m²`],
    ['Carga média por pavimento', `${f2(r.totals.perArea)} kN/m²`],
  ];
  if (r.totals.radierStress) totals.push(['Tensão média do radier', `${f1(r.totals.radierStress)} kPa`]);
  for (const [k, v] of totals) {
    doc.text(k, x2, y2, 2.3, { color: '#6b7480' });
    doc.text(v, x2 + colW, y2, 2.5, { bold: true, align: 'right' });
    y2 += 6;
  }
  y2 += 4;
  y2 = doc.heading('Tramitação das cargas', x2, y2, 3.2);
  const steps = ['1. Laje', '2. Vigas do contorno da laje', '3. Pilares nas extremidades das vigas', '4. Pilar do pavimento inferior (ou viga de transição)', '5. Pilar do térreo + vigas baldrame', '6. Fundação', '7. Solo'];
  steps.forEach((t, i) => doc.text(t, x2, y2 + i * 5, 2.2, { color: '#495057' }));

  // ---------- 2. pendências ----------
  const pend = r.issues.filter((i) => i.status !== 'ok');
  doc.newSheet('Pendências da verificação');
  a = doc.area;
  y = doc.heading(`Pendências (${pend.length})`, a.x, a.y + 2);
  if (pend.length === 0) doc.text('Nenhuma pendência: todos os elementos atendem aos critérios de pré-dimensionamento.', a.x, y + 2, 2.6, { color: '#2f9e44' });
  else
    doc.table(a.x, y, [a.w * 0.12, a.w * 0.88], ['Situação', 'Descrição'], pend.map((i) => [ST[i.status], i.text]), { onPage: more('Pendências (cont.)') });

  // ---------- 3. plantas de fôrmas ----------
  for (const l of b.levels) formSheet(doc, b, r, l.id, `Fôrmas - teto do ${l.name}`);
  formSheet(doc, b, r, BALDRAME, 'Locação da fundação');

  // ---------- 4. tabelas ----------
  doc.newSheet('Lajes');
  a = doc.area;
  y = doc.heading('Lajes', a.x, a.y + 2);
  doc.table(
    a.x,
    y,
    [0.07, 0.12, 0.18, 0.16, 0.07, 0.12, 0.09, 0.09, 0.1].map((k) => k * a.w),
    ['Cód.', 'Pavimento', 'Ambiente', 'Sistema', 'h cm', 'lx × ly m', 'q kN/m²', 'Total kN', 'Situação'],
    r.slabs.map((x) => [x.code, levelName(x.levelId), x.name, x.system, String(x.thickness), `${f2(x.lx)} × ${f2(x.ly)}`, f2(x.q), f1(x.total), ST[x.status]]),
    { align: ['left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'left'], onPage: more('Lajes (cont.)') },
  );

  doc.newSheet('Vigas');
  a = doc.area;
  y = doc.heading('Vigas', a.x, a.y + 2);
  doc.table(
    a.x,
    y,
    [0.06, 0.1, 0.08, 0.06, 0.08, 0.08, 0.08, 0.08, 0.08, 0.1, 0.1, 0.1].map((k) => k * a.w),
    ['Cód.', 'Pavimento', 'Seção cm', 'L m', 'q kN/m', 'Mk kN.m', 'Vk kN', 'Ra kN', 'Rb kN', 'Armadura', 'Estribos', 'Situação'],
    r.beams.map((v) => [v.code, levelName(v.levelId), `${v.bw}×${v.h}`, f2(v.L), f2(v.q), f1(v.Mk), f1(v.Vk), f1(v.Ra), f1(v.Rb), v.bars, v.stirrups, ST[v.status]]),
    { align: ['left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'left', 'left', 'left'], rowH: 5.8, onPage: more('Vigas (cont.)') },
  );

  doc.newSheet('Pilares');
  a = doc.area;
  y = doc.heading('Pilares', a.x, a.y + 2);
  doc.table(
    a.x,
    y,
    [0.06, 0.1, 0.08, 0.1, 0.07, 0.08, 0.08, 0.09, 0.08, 0.08, 0.06, 0.12].map((k) => k * a.w),
    ['Cód.', 'Pavimento', 'Seção cm', 'Posição', 'Coef.', 'Nk kN', 'Nd kN', 'Ac nec cm²', 'Ac cm²', 'Armadura', 'Esbeltez', 'Situação'],
    r.pillars.map((p) => [p.code, levelName(p.levelId), `${p.b}×${p.h}`, p.position, f1(p.alpha), f1(p.N), f1(p.Nd), f0(p.AcReq), f0(p.Ac), p.bars, f0(p.lambda), ST[p.status]]),
    { align: ['left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'left', 'right', 'left'], rowH: 5.8, onPage: more('Pilares (cont.)') },
  );

  doc.newSheet('Fundações');
  a = doc.area;
  y = doc.heading('Fundações', a.x, a.y + 2);
  y = doc.table(
    a.x,
    y,
    [0.08, 0.1, 0.12, 0.16, 0.08, 0.34, 0.12].map((k) => k * a.w),
    ['Cód.', 'Pilar', 'Nk kN', s.foundation === 'estaca' ? 'Estacas' : 'B × L m', 'h m', 'Observações', 'Situação'],
    r.footings.map((f) => [
      f.code,
      r.pillars.find((p) => p.id === f.pillarId)?.code ?? '',
      f1(f.N),
      f.kind === 'estaca' ? String(f.piles) : `${f2(f.B)} × ${f2(f.L)}`,
      f2(f.h),
      f.notes.join(' '),
      ST[f.status],
    ]),
    { align: ['left', 'left', 'right', 'right', 'right', 'left', 'left'], rowH: 5.8, onPage: more('Fundações (cont.)') },
  );

  // caminho das cargas de cada pilar do térreo
  doc.newSheet('Caminho das cargas');
  a = doc.area;
  y = doc.heading('Caminho das cargas por pilar', a.x, a.y + 2);
  const rows: string[][] = [];
  for (const p of r.pillars) {
    rows.push([`${p.code} - ${levelName(p.levelId)}`, p.loads.map((l) => `${l.label}: ${f1(l.value)}`).join('; '), f1(p.N)]);
  }
  doc.table(a.x, y, [a.w * 0.16, a.w * 0.72, a.w * 0.12], ['Pilar', 'Recebe (kN)', 'Nk total kN'], rows, { align: ['left', 'left', 'right'], rowH: 5.8, onPage: more('Caminho das cargas (cont.)') });

  // ---------- 5. telhado ----------
  if (r.roof) {
    doc.newSheet('Telhado');
    a = doc.area;
    const rf = r.roof;
    const g = rf.geometry;
    y = doc.heading(`Telhado - ${ROOF_TYPES.find((t) => t.key === rf.type)?.name ?? ''}`, a.x, a.y + 2);
    const info: [string, string][] = [
      ['Cobertura', ROOFS.find((x) => x.key === s.roof)?.name ?? ''],
      ['Inclinação', `${b.roof?.slope ?? 0}% (${f1((g.angle * 180) / Math.PI)}°)`],
      ['Beiral', `${f2(b.roof?.overhang ?? 0)} m`],
      ['Área em projeção / real', `${f2(g.projectedArea)} m² / ${f2(g.realArea)} m²`],
      ['Altura da cumeeira sobre a laje', `${f2(g.ridgeHeight)} m`],
      ['Peso sobre a laje de cobertura', `${f2(rf.load)} kN/m² (${f0(rf.weight)} kN)`],
    ];
    if (rf.purlin) {
      const pl = rf.purlin;
      info.push(['Terça 6×16 (vão 2,0 m entre pontaletes)', `tensão ${f1(pl.sigma)} MPa ≤ ${f1(pl.fd)} MPa; flecha ${f1(pl.deflection)} mm ≤ ${f0(pl.limit)} mm`]);
    }
    const half = (a.w - 10) / 2;
    doc.table(a.x, y, [half * 0.45, half * 0.55], ['Item', 'Valor'], info, { rowH: 6.2 });
    let yy = doc.heading('Madeiramento e telhas', a.x + half + 10, a.y + 2, 3.4);
    yy = doc.table(a.x + half + 10, yy, [half * 0.4, half * 0.2, half * 0.2, half * 0.2], ['Elemento', 'Seção', 'Espaçamento', 'Quantidade'], rf.elements.map((e) => [e.name, e.section, e.spacing, e.quantity]));
    rf.notes.forEach((n, k) => doc.text(`• ${n}`, a.x + half + 10, yy + 6 + k * 5, 2, { color: '#495057', maxWidth: half }));
  }

  // ---------- 6. quantitativo de materiais ----------
  {
    const q = buildQuantities(b, r);
    doc.newSheet('Quantitativo de materiais');
    a = doc.area;
    const half = (a.w - 10) / 2;
    y = doc.heading('Quantitativo de materiais', a.x, a.y + 2);
    doc.table(
      a.x,
      y,
      [half * 0.24, half * 0.52, half * 0.24],
      ['Grupo', 'Item', 'Quantidade'],
      q.rows.map((x) => [x.group, x.note && !Number.isNaN(x.qty) ? `${x.item} (${x.note})` : x.item, fmtQty(x)]),
      { align: ['left', 'left', 'right'], rowH: 5.4, onPage: more('Quantitativo (cont.)') },
    );
    let yy = doc.heading('Resumo para compra', a.x + half + 10, a.y + 2, 3.6);
    yy = doc.table(a.x + half + 10, yy, [half * 0.72, half * 0.28], ['Material', 'Quantidade'], q.summary.map((x) => [x.item, fmtQty(x)]), { align: ['left', 'right'], rowH: 6.2 });
    const notes = [
      'Perdas incluídas: concreto 5%, aço 10%, argamassas 10%, blocos 5%.',
      `Concreto virado em obra C${s.fck}: consumo típico de cimento, areia e brita por m³.`,
      'Se o concreto for usinado, descontar cimento, areia e brita do concreto estrutural.',
      'Argamassas: assentamento e reboco 1:2:8 (cimento:cal:areia); contrapiso 1:4.',
      'Aço de vigas e pilares pelo dimensionamento; sapatas e lajes por taxa usual.',
      'Quantitativo preliminar para orçamento: confirmar com o projeto executivo.',
    ];
    notes.forEach((n, k) => doc.text(`• ${n}`, a.x + half + 10, yy + 7 + k * 5.2, 2.1, { color: '#495057', maxWidth: half }));
  }

  // ---------- 7. termo de responsabilidade ----------
  doc.newSheet('Responsabilidade técnica');
  a = doc.area;
  y = doc.heading('Termo de responsabilidade técnica', a.x, a.y + 4, 5);
  const lines = [
    'Este relatório apresenta o lançamento e o pré-dimensionamento da estrutura gerados pelo sistema a partir do projeto',
    'arquitetônico, com os parâmetros indicados na primeira folha. Os resultados foram revisados pelo engenheiro responsável,',
    'que valida as hipóteses de cálculo, os materiais, as cargas e a capacidade do solo (com base em sondagem SPT), e',
    'responde pelo projeto estrutural conforme as normas NBR 6118, NBR 6120, NBR 6122 e NBR 8681.',
  ];
  lines.forEach((t, i) => doc.text(t, a.x, y + 4 + i * 6, 2.6, { color: '#343a40' }));
  y += 40;
  const fields: [string, string][] = [
    ['Engenheiro responsável', meta.engineer ?? ''],
    ['Registro CREA', meta.engineerRegistry ?? ''],
    ['ART nº', meta.art ?? ''],
    ['Obra', [meta.title, meta.address].filter(Boolean).join(' - ')],
    ['Proprietário', meta.client],
  ];
  for (const [k, v] of fields) {
    doc.text(k.toUpperCase(), a.x, y, 1.9, { color: '#6b7480' });
    doc.text(v || '', a.x, y + 6, 3.2, { bold: true });
    doc.pdf.setDrawColor('#adb5bd');
    doc.pdf.setLineWidth(0.2);
    doc.pdf.line(a.x, y + 9, a.x + a.w * 0.55, y + 9);
    y += 16;
  }
  const sx = a.x + a.w * 0.62;
  const sw = a.w * 0.36;
  const sy = a.y + 70;
  doc.text('Local e data', sx, sy, 1.9, { color: '#6b7480' });
  doc.pdf.line(sx, sy + 12, sx + sw, sy + 12);
  doc.pdf.setDrawColor('#212529');
  doc.pdf.setLineWidth(0.35);
  doc.pdf.line(sx, sy + 55, sx + sw, sy + 55);
  doc.text(meta.engineer || 'Engenheiro responsável', sx + sw / 2, sy + 60, 2.8, { align: 'center', bold: true });
  doc.text(meta.engineerRegistry ? `CREA ${meta.engineerRegistry}` : 'CREA', sx + sw / 2, sy + 66, 2.2, { align: 'center', color: '#495057' });
  doc.text('Assinatura do responsável técnico', sx + sw / 2, sy + 72, 1.9, { align: 'center', color: '#6b7480' });

  doc.activeMeta = previous;
}

/** Planta de fôrmas: paredes como referência, lajes, vigas (tracejadas) e pilares; ou locação das sapatas. */
function formSheet(doc: Doc, b: Building, r: StructureResult, levelKey: string, title: string) {
  doc.newSheet(title);
  const a = doc.area;
  const plan = levelKey === BALDRAME ? b.levels[0].plan : b.levels.find((l) => l.id === levelKey)!.plan;
  const geoms = Object.values(computeWallGeometry(plan));
  const bb = boundsOf(geoms.flatMap((g) => g.polygon));
  if (!bb) return;
  const box = { x: a.x, y: a.y + 10, w: a.w, h: a.h - 10 };
  const scale = pickScale(bb.maxX - bb.minX + 2, bb.maxY - bb.minY + 2, box);
  doc.setSheetScale(`1:${scale}`);
  doc.text(`${title.toUpperCase()}  -  ESC. 1:${scale}`, a.x, a.y + 2, 3, { bold: true });
  const k = 1000 / scale;
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  const M = (p: Vec2) => ({ x: box.x + box.w / 2 + (p.x - cx) * k, y: box.y + box.h / 2 + (p.y - cy) * k });
  const p = doc.pdf;
  const poly = (pts: Vec2[], fill: string | null, stroke: string | null, w = 0.2, dash = false) => {
    const q = pts.map(M);
    p.moveTo(q[0].x, q[0].y);
    for (const v of q.slice(1)) p.lineTo(v.x, v.y);
    p.close();
    if (fill) p.setFillColor(fill);
    if (stroke) {
      p.setDrawColor(stroke);
      p.setLineWidth(w);
      p.setLineDashPattern(dash ? [1.5, 1] : [], 0);
    }
    if (fill && stroke) p.fillStroke();
    else if (fill) p.fill();
    else p.stroke();
    p.setLineDashPattern([], 0);
  };
  const rect = (c: Vec2, len: number, wid: number, rot: number) => {
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    return [
      [-len / 2, -wid / 2],
      [len / 2, -wid / 2],
      [len / 2, wid / 2],
      [-len / 2, wid / 2],
    ].map(([u, v]) => ({ x: c.x + u * cs - v * sn, y: c.y + u * sn + v * cs }));
  };

  for (const g of geoms) poly(g.polygon, '#e9ecef', '#ced4da', 0.1);
  if (levelKey !== BALDRAME) {
    for (const sl of r.slabs.filter((x) => x.levelId === levelKey)) {
      const c = sl.polygon.reduce((acc, q) => ({ x: acc.x + q.x / sl.polygon.length, y: acc.y + q.y / sl.polygon.length }), { x: 0, y: 0 });
      const m = M(c);
      doc.text(sl.code, m.x, m.y - 3, 3, { bold: true, align: 'center' });
      doc.text(`${sl.system.replace('Treliçada ', '')}  h=${sl.thickness}`, m.x, m.y + 2, 2, { align: 'center', color: '#495057' });
      doc.text(`${f2(sl.q)} kN/m²`, m.x, m.y + 6, 1.9, { align: 'center', color: '#6b7480' });
    }
  } else {
    for (const f of r.footings) {
      poly(rect(f.p, f.L, f.B, f.rotation), '#fff4e6', ST_COLOR[f.status], 0.3);
      const m = M({ x: f.p.x, y: f.p.y + f.B / 2 });
      doc.text(`${f.code} ${f.kind === 'estaca' ? `${f.piles} est.` : `${Math.round(f.L * 100)}×${Math.round(f.B * 100)} h${Math.round(f.h * 100)}`}`, m.x, m.y + 3, 2, { align: 'center', bold: true });
    }
  }
  for (const v of r.beams.filter((x) => x.levelId === levelKey)) {
    const c = { x: (v.a.x + v.b.x) / 2, y: (v.a.y + v.b.y) / 2 };
    const ang = Math.atan2(v.b.y - v.a.y, v.b.x - v.a.x);
    poly(rect(c, v.L, v.bw / 100, ang), null, ST_COLOR[v.status] === ST_COLOR.ok ? '#343a40' : ST_COLOR[v.status], 0.25, true);
    if (v.L * k > 18) {
      let t = ang;
      if (t > Math.PI / 2) t -= Math.PI;
      if (t <= -Math.PI / 2) t += Math.PI;
      const m = M({ x: c.x - Math.sin(t) * 0.22, y: c.y + Math.cos(t) * -0.22 });
      doc.text(`${v.code} ${v.bw}×${v.h}`, m.x, m.y, 1.9, { align: 'center', angle: (-t * 180) / Math.PI, color: '#1d3b6e' });
    }
  }
  const pillarLevel = levelKey === BALDRAME ? b.levels[0].id : levelKey;
  for (const pl of r.pillars.filter((x) => x.levelId === pillarLevel)) {
    poly(rect(pl.p, pl.h / 100, pl.b / 100, pl.rotation), pl.status === 'ok' ? '#343a40' : ST_COLOR[pl.status], '#212529', 0.15);
    const m = M(pl.p);
    doc.text(`${pl.code} ${pl.b}/${pl.h}`, m.x + 2, m.y - 2.5, 1.9, { bold: true });
  }
}
