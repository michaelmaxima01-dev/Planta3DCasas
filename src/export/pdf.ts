/**
 * Caderno do projeto em PDF: capa, planta baixa em escala, quadros de áreas e esquadrias,
 * uma página por cômodo, lista de mobiliário e vistas 3D. Todas as folhas têm carimbo.
 */
import { jsPDF } from 'jspdf';
import type { Vec2 } from '../geometry/vec';
import { DEFAULT_META } from '../model/finishes';
import type { Level, Plan, ProjectMeta } from '../model/types';
import { styleName } from '../model/openings';
import { type Drawing, type Prim, arcPoints, boundsOf, buildDrawing, fmtDim, transformInsert } from './drawing';
import { type FurnitureRow, type ProjectSchedule, buildSchedule, furnitureName } from './schedule';

export type Paper = 'A4' | 'A3';

export interface PdfOptions {
  paper: Paper;
  /** 0 = escolher a maior escala que cabe. */
  scale: number;
  roomPages: boolean;
  furnitureList: boolean;
  views3d: boolean;
  meta: ProjectMeta;
  /** Acrescenta folhas extras no fim (ex.: estrutura), antes dos carimbos. */
  extraSheets?: (doc: Doc) => void;
}

export interface PdfImages {
  /** JPEG/PNG em data URL. */
  cover?: string;
  views?: { title: string; src: string }[];
}

const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000];
const PAPER: Record<Paper, { w: number; h: number }> = { A3: { w: 420, h: 297 }, A4: { w: 297, h: 210 } };
const INK = '#1f2328';
const MUTED = '#6b7480';
const LINE = '#c5ccd5';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A fonte padrão do PDF (WinAnsi) não tem letras gregas nem setas: troca por equivalentes legíveis. */
const PDF_SUBST: [RegExp, string][] = [
  [/→/g, '>'],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/γf/g, 'coef. ações'],
  [/γc/g, 'coef. concreto'],
  [/γs/g, 'coef. aço'],
  [/γn/g, 'gn'],
  [/σadm/g, 'tensão adm.'],
  [/σ/g, 's'],
  [/α/g, 'alfa'],
  [/λ/g, 'esbeltez'],
  [/γ/g, 'g'],
  [/•/g, '-'],
];
export function pdfSafe(s: string): string {
  let out = s;
  for (const [re, to] of PDF_SUBST) out = out.replace(re, to);
  return out;
}

const ptFromMm = (mm: number) => mm / 0.3528 / 0.72; // altura de maiúscula em mm → tamanho de fonte em pt
const fmt1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const deg = (rad: number) => (rad * 180) / Math.PI;

function mix(hex: string, white: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (v: number) => Math.round(v + (255 - v) * white);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Escolhe a maior escala padrão (menor denominador) em que a área cabe no quadro. */
export function pickScale(widthM: number, heightM: number, box: { w: number; h: number }): number {
  for (const s of SCALES) if ((widthM * 1000) / s <= box.w && (heightM * 1000) / s <= box.h) return s;
  return SCALES[SCALES.length - 1];
}

export class Doc {
  pdf: jsPDF;
  W: number;
  H: number;
  margin = 10;
  titleH: number;
  sheets: { title: string; scale?: string; meta?: ProjectMeta }[] = [];
  /** Carimbo usado nas próximas folhas (ex.: engenheiro nas folhas da estrutura). */
  activeMeta?: ProjectMeta;

  private meta: ProjectMeta;

  constructor(paper: Paper, meta: ProjectMeta) {
    this.meta = meta;
    this.pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: paper.toLowerCase(), compress: true });
    this.W = PAPER[paper].w;
    this.H = PAPER[paper].h;
    this.titleH = paper === 'A3' ? 30 : 26;
    this.pdf.setProperties({ title: meta.title || 'Projeto', subject: 'Caderno do projeto', creator: 'Planta3D Casas' });
  }

  /** Área útil da folha (dentro da moldura, acima do carimbo). */
  get area(): Box {
    const m = this.margin;
    return { x: m + 5, y: m + 5, w: this.W - 2 * m - 10, h: this.H - 2 * m - this.titleH - 10 };
  }

  newSheet(title: string, scale?: string) {
    if (this.sheets.length > 0) this.pdf.addPage();
    this.sheets.push({ title, scale, meta: this.activeMeta });
    const p = this.pdf;
    p.setDrawColor(INK);
    p.setLineWidth(0.5);
    p.rect(this.margin, this.margin, this.W - 2 * this.margin, this.H - 2 * this.margin);
  }

  setSheetScale(scale: string) {
    this.sheets[this.sheets.length - 1].scale = scale;
  }

  text(raw: string, x: number, y: number, size: number, o: { bold?: boolean; color?: string; align?: 'left' | 'center' | 'right'; angle?: number; maxWidth?: number } = {}) {
    const s = pdfSafe(raw);
    const p = this.pdf;
    p.setFont('helvetica', o.bold ? 'bold' : 'normal');
    p.setFontSize(ptFromMm(size));
    p.setTextColor(o.color ?? INK);
    p.text(s, x, y, { align: o.align ?? 'left', baseline: 'middle', angle: o.angle ?? 0, maxWidth: o.maxWidth });
  }

  /** Desenha todos os carimbos (no fim, quando já se sabe o total de folhas). */
  finish() {
    const total = this.sheets.length;
    const date = new Date().toLocaleDateString('pt-BR');
    this.sheets.forEach((sheet, i) => {
      const m = sheet.meta ?? this.meta;
      this.pdf.setPage(i + 1);
      const p = this.pdf;
      const x0 = this.margin;
      const y0 = this.H - this.margin - this.titleH;
      const w = this.W - 2 * this.margin;
      const h = this.titleH;
      p.setDrawColor(INK);
      p.setLineWidth(0.35);
      p.line(x0, y0, x0 + w, y0);
      const cols = [0.3, 0.22, 0.2, 0.28].map((f) => f * w);
      let x = x0;
      const cell = (cw: number, label: string, value: string, sub?: string, bold = false) => {
        this.text(label.toUpperCase(), x + 3, y0 + 5, 1.6, { color: MUTED });
        this.text(value || '-', x + 3, y0 + h * 0.45, bold ? 3.4 : 2.4, { bold, maxWidth: cw - 6 });
        if (sub) this.text(sub, x + 3, y0 + h * 0.78, 1.9, { color: MUTED, maxWidth: cw - 6 });
        x += cw;
        if (x < x0 + w - 1) {
          p.setLineWidth(0.25);
          p.line(x, y0, x, y0 + h);
        }
      };
      cell(cols[0], 'Projeto', m.title || DEFAULT_META.title, m.address, true);
      cell(cols[1], 'Cliente', m.client, m.notes);
      cell(cols[2], 'Responsável técnico', m.author, m.registry);
      // última coluna: folha, escala, data e numeração
      this.text('FOLHA', x + 3, y0 + 5, 1.6, { color: MUTED });
      this.text(sheet.title, x + 3, y0 + h * 0.4, 2.8, { bold: true, maxWidth: cols[3] - 6 });
      this.text(`Escala: ${sheet.scale ?? 'indicada'}`, x + 3, y0 + h * 0.68, 2, { color: MUTED });
      this.text(`Data: ${date}`, x + 3, y0 + h * 0.86, 2, { color: MUTED });
      this.text(`${String(i + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`, x0 + w - 4, y0 + h * 0.62, 5, { bold: true, align: 'right' });
    });
  }

  // ---------- desenho técnico ----------
  drawDrawing(d: Drawing, box: Box, scale: number, focus: { minX: number; minY: number; maxX: number; maxY: number }) {
    const p = this.pdf;
    const k = 1000 / scale;
    const cx = (focus.minX + focus.maxX) / 2;
    const cy = (focus.minY + focus.maxY) / 2;
    const M = (q: Vec2) => ({ x: box.x + box.w / 2 + (q.x - cx) * k, y: box.y + box.h / 2 + (q.y - cy) * k });

    p.saveGraphicsState();
    p.rect(box.x, box.y, box.w, box.h, null);
    p.clip();
    p.discardPath();

    const draw = (prim: Prim, tf: (q: Vec2) => Vec2, rot: number) => {
      switch (prim.t) {
        case 'poly':
          this.path(prim.pts.map((q) => M(tf(q))), prim.closed, prim, prim.layer);
          break;
        case 'arc':
          this.path(arcPoints(prim.c, prim.r, prim.a0, prim.a1).map((q) => M(tf(q))), false, prim, prim.layer);
          break;
        case 'text': {
          const at = M(tf(prim.p));
          this.text(prim.text, at.x, at.y, prim.size, { bold: prim.bold, color: prim.color ?? (prim.layer === 'COTAS' ? '#3d4650' : INK), align: 'center', angle: -deg(prim.angle + rot) });
          break;
        }
        case 'insert': {
          const block = d.blocks[prim.block];
          if (!block) break;
          for (const bp of block.prims) draw(bp, (q) => tf(transformInsert(q, prim.p, prim.rotation)), rot + prim.rotation);
          break;
        }
      }
    };
    for (const prim of d.prims) draw(prim, (q) => q, 0);
    p.restoreGraphicsState();
  }

  private path(pts: Vec2[], closed: boolean, st: { fill?: string; stroke?: string | null; weight?: number; dash?: boolean }, layer: string) {
    if (pts.length < 2) return;
    const p = this.pdf;
    const fill = st.fill ? (layer === 'COMODOS' ? mix(st.fill, 0.45) : layer === 'MOVEIS' ? mix(st.fill, 0.72) : st.fill) : null;
    const stroke = st.stroke === null ? null : st.stroke ?? INK;
    if (!fill && !stroke) return;
    p.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
    if (closed) p.close();
    if (fill) p.setFillColor(fill);
    if (stroke) {
      p.setDrawColor(stroke);
      p.setLineWidth(st.weight ?? 0.18);
      p.setLineDashPattern(st.dash ? [1.2, 0.8] : [], 0);
    }
    if (fill && stroke) p.fillStroke();
    else if (fill) p.fill();
    else p.stroke();
    if (st.dash) p.setLineDashPattern([], 0);
  }

  // ---------- tabelas ----------
  table(
    x: number,
    y: number,
    widths: number[],
    head: string[],
    rows: string[][],
    o: { align?: ('left' | 'right' | 'center')[]; foot?: string[]; rowH?: number; onPage?: () => number } = {},
  ): number {
    const p = this.pdf;
    const rh = o.rowH ?? 6.5;
    const totalW = widths.reduce((s, v) => s + v, 0);
    const bottom = this.area.y + this.area.h;
    const header = (yy: number) => {
      p.setFillColor('#eef1f5');
      p.rect(x, yy, totalW, rh, 'F');
      let cx = x;
      head.forEach((h, i) => {
        this.cellText(h.toUpperCase(), cx, yy + rh / 2, widths[i], o.align?.[i], 1.7, true, MUTED);
        cx += widths[i];
      });
      return yy + rh;
    };
    let yy = header(y);
    const line = (cells: string[], bold = false) => {
      if (yy + rh > bottom && o.onPage) yy = header(o.onPage());
      let cx = x;
      cells.forEach((c, i) => {
        this.cellText(c, cx, yy + rh / 2, widths[i], o.align?.[i], 2.1, bold);
        cx += widths[i];
      });
      p.setDrawColor(LINE);
      p.setLineWidth(0.15);
      p.line(x, yy + rh, x + totalW, yy + rh);
      yy += rh;
    };
    rows.forEach((r) => line(r));
    if (o.foot) {
      p.setDrawColor(INK);
      p.setLineWidth(0.3);
      p.line(x, yy, x + totalW, yy);
      line(o.foot, true);
    }
    return yy;
  }

  private cellText(s: string, x: number, y: number, w: number, align: 'left' | 'right' | 'center' = 'left', size = 2.1, bold = false, color?: string) {
    const pad = 2;
    const tx = align === 'right' ? x + w - pad : align === 'center' ? x + w / 2 : x + pad;
    this.pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    this.pdf.setFontSize(ptFromMm(size));
    let txt = s;
    while (txt.length > 1 && this.pdf.getTextWidth(txt) > w - 2 * pad) txt = txt.slice(0, -2) + '…';
    this.text(txt, tx, y, size, { bold, color, align });
  }

  heading(s: string, x: number, y: number, size = 4.2) {
    this.text(s, x, y, size, { bold: true });
    return y + size * 1.6;
  }

  image(src: string, box: Box, aspect: number) {
    let w = box.w;
    let h = w / aspect;
    if (h > box.h) {
      h = box.h;
      w = h * aspect;
    }
    const x = box.x + (box.w - w) / 2;
    const y = box.y + (box.h - h) / 2;
    this.pdf.addImage(src, src.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, w, h);
    this.pdf.setDrawColor(LINE);
    this.pdf.setLineWidth(0.2);
    this.pdf.rect(x, y, w, h);
  }
}

export function buildPdf(levels: Level[], o: PdfOptions, images: PdfImages = {}): jsPDF {
  // numeração contínua das esquadrias entre pavimentos
  const counters = { door: 0, window: 0 };
  const perLevel = levels.map((level) => ({ level, sch: buildSchedule(level.plan, counters) }));
  const multi = levels.length > 1;
  const pre = (lv: Level, name: string) => (multi ? `${lv.name} - ${name}` : name);
  const merged: ProjectSchedule = {
    geoms: {},
    rooms: perLevel.flatMap(({ level, sch }) => sch.rooms.map((r) => ({ ...r, room: { ...r.room, name: pre(level, r.room.name) } }))),
    openings: perLevel.flatMap(({ sch }) => sch.openings),
    furniture: perLevel.flatMap(({ level, sch }) => sch.furniture.map((f) => ({ ...f, roomName: pre(level, f.roomName) }))),
    totalArea: perLevel.reduce((s, x) => s + x.sch.totalArea, 0),
    builtArea: perLevel.reduce((s, x) => s + x.sch.builtArea, 0),
  };
  const doc = new Doc(o.paper, o.meta);
  coverSheet(doc, merged, o, images);
  for (const { level, sch } of perLevel) planSheet(doc, level.plan, sch, o, multi ? `Planta baixa - ${level.name}` : 'Planta baixa');
  tablesSheet(doc, merged);
  if (o.roomPages) for (const { level, sch } of perLevel) for (const r of sch.rooms) roomSheet(doc, level.plan, sch, r.room.id, multi ? level.name : '');
  if (o.furnitureList && merged.furniture.length) furnitureSheet(doc, merged);
  if (o.views3d && images.views?.length) viewsSheet(doc, images.views);
  o.extraSheets?.(doc);
  doc.finish();
  return doc.pdf;
}

function coverSheet(doc: Doc, sch: ProjectSchedule, o: PdfOptions, images: PdfImages) {
  doc.newSheet('Capa');
  const a = doc.area;
  const left = a.w * 0.36;
  let y = a.y + 14;
  doc.text('CADERNO DO PROJETO', a.x + 4, y, 2.6, { color: MUTED, bold: true });
  y += 12;
  doc.text(o.meta.title || DEFAULT_META.title, a.x + 4, y, 8, { bold: true, maxWidth: left - 8 });
  y += 14;
  const info: [string, string][] = [
    ['Cliente', o.meta.client],
    ['Endereço', o.meta.address],
    ['Responsável', [o.meta.author, o.meta.registry].filter(Boolean).join(' - ')],
    ['Data', new Date().toLocaleDateString('pt-BR')],
  ];
  for (const [k, v] of info) {
    doc.text(k.toUpperCase(), a.x + 4, y, 1.8, { color: MUTED });
    doc.text(v || '-', a.x + 4, y + 5, 2.8, { maxWidth: left - 8 });
    y += 13;
  }
  y += 4;
  const doors = sch.openings.filter((x) => x.op.kind === 'door').length;
  const stats: [string, string][] = [
    ['Área útil total', `${fmtDim(sch.totalArea)} m²`],
    ['Área construída (aprox.)', `${fmtDim(sch.builtArea)} m²`],
    ['Cômodos', String(sch.rooms.length)],
    ['Portas / janelas', `${doors} / ${sch.openings.length - doors}`],
    ['Itens de mobiliário', String(sch.furniture.length)],
  ];
  doc.pdf.setFillColor('#f3f5f8');
  doc.pdf.rect(a.x + 2, y - 5, left - 6, stats.length * 9 + 6, 'F');
  for (const [k, v] of stats) {
    doc.text(k, a.x + 6, y, 2.4, { color: MUTED });
    doc.text(v, a.x + left - 8, y, 2.8, { bold: true, align: 'right' });
    y += 9;
  }
  if (o.meta.notes) doc.text(o.meta.notes, a.x + 4, Math.min(y + 8, a.y + a.h - 6), 2.2, { color: MUTED, maxWidth: left - 8 });
  if (images.cover) doc.image(images.cover, { x: a.x + left, y: a.y, w: a.w - left, h: a.h }, 1.6);
}

function planSheet(doc: Doc, plan: Plan, sch: ProjectSchedule, o: PdfOptions, title: string) {
  doc.newSheet(title);
  const a = doc.area;
  const box = { x: a.x, y: a.y + 8, w: a.w, h: a.h - 8 };
  // a margem das cotas tem tamanho fixo no papel (24 mm de cada lado)
  const probe = buildDrawing(plan, sch, { scale: 100, roomFills: true });
  const c = probe.content;
  const scale = o.scale || pickScale(c.maxX - c.minX, c.maxY - c.minY, { w: box.w - 48, h: box.h - 48 });
  const d = buildDrawing(plan, sch, { scale, roomFills: true });
  doc.setSheetScale(`1:${scale}`);
  doc.text(`${title.toUpperCase()}  -  ESC. 1:${scale}`, a.x, a.y + 2, 3, { bold: true });
  doc.text('Cotas e áreas em metros. P = porta, J = janela (ver quadro de esquadrias).', a.x + a.w, a.y + 2, 2, { color: MUTED, align: 'right' });
  doc.drawDrawing(d, box, scale, d.bounds);
}

function tablesSheet(doc: Doc, sch: ProjectSchedule) {
  doc.newSheet('Quadros de áreas e esquadrias');
  const a = doc.area;
  const colW = (a.w - 10) / 2;
  const newPage = () => {
    doc.newSheet('Quadros (continuação)');
    return doc.area.y;
  };

  let y = doc.heading('Quadro de áreas', a.x, a.y + 2);
  const totalWall = sch.rooms.reduce((s, r) => s + r.netWallArea, 0);
  y = doc.table(
    a.x,
    y,
    [colW * 0.3, colW * 0.22, colW * 0.12, colW * 0.12, colW * 0.1, colW * 0.14],
    ['Cômodo', 'Piso', 'Área m²', 'Perím. m', 'P.D. m', 'Paredes m²'],
    sch.rooms.map((r) => [r.room.name, r.finish, fmtDim(r.room.area), fmtDim(r.room.perimeter), fmtDim(r.ceilingHeight), fmtDim(r.netWallArea)]),
    { align: ['left', 'left', 'right', 'right', 'right', 'right'], foot: ['Total', '', fmtDim(sch.totalArea), '', '', fmtDim(totalWall)], onPage: newPage },
  );
  doc.text(`Área construída aproximada (inclui paredes): ${fmtDim(sch.builtArea)} m²`, a.x, y + 6, 2, { color: MUTED });
  doc.text('P.D. = pé-direito. Área de paredes já descontadas portas e janelas.', a.x, y + 11, 2, { color: MUTED });

  const x2 = a.x + colW + 10;
  let y2 = doc.heading('Quadro de esquadrias', x2, a.y + 2);
  const roomName = (id: string) => sch.rooms.find((r) => r.room.id === id)?.room.name ?? '';
  y2 = doc.table(
    x2,
    y2,
    [colW * 0.1, colW * 0.13, colW * 0.12, colW * 0.12, colW * 0.13, colW * 0.4],
    ['Cód.', 'Tipo', 'Larg. m', 'Alt. m', 'Peitoril m', 'Ambientes'],
    sch.openings.map((x) => [
      x.tag,
      styleName(x.op),
      fmtDim(x.op.width),
      fmtDim(x.op.height),
      x.op.kind === 'door' ? '-' : fmtDim(x.op.sill),
      [...x.rooms.map(roomName), ...(x.exterior ? ['Externo'] : [])].join(' / '),
    ]),
    { align: ['left', 'left', 'right', 'right', 'right', 'left'], onPage: newPage },
  );
  void y2;
}

function roomSheet(doc: Doc, plan: Plan, sch: ProjectSchedule, roomId: string, levelName: string) {
  const info = sch.rooms.find((r) => r.room.id === roomId)!;
  const room = info.room;
  doc.newSheet(`Cômodo: ${room.name}${levelName ? ` (${levelName})` : ''}`);
  const a = doc.area;
  const drawW = a.w * 0.58;
  const box = { x: a.x, y: a.y + 8, w: drawW - 6, h: a.h - 8 };
  const rb = boundsOf(room.inner)!;
  const pad = 1.2;
  const focus = { minX: rb.minX - pad, minY: rb.minY - pad, maxX: rb.maxX + pad, maxY: rb.maxY + pad };
  const scale = pickScale(focus.maxX - focus.minX, focus.maxY - focus.minY, box);
  const d = buildDrawing(plan, sch, { scale, roomFills: true, dimensions: false, innerDimsFor: roomId });
  doc.setSheetScale(`1:${scale}`);
  doc.text(`${room.name.toUpperCase()}  -  ESC. 1:${scale}`, a.x, a.y + 2, 3, { bold: true });
  // recorta só a região do cômodo, centralizada no quadro
  const cw = ((focus.maxX - focus.minX) * 1000) / scale;
  const chh = ((focus.maxY - focus.minY) * 1000) / scale;
  const crop = { x: box.x + (box.w - cw) / 2, y: box.y + (box.h - chh) / 2, w: cw, h: chh };
  doc.drawDrawing(d, crop, scale, focus);
  doc.pdf.setDrawColor(LINE);
  doc.pdf.setLineWidth(0.2);
  doc.pdf.rect(crop.x, crop.y, crop.w, crop.h);

  const x = a.x + drawW + 2;
  const w = a.w - drawW - 2;
  let y = doc.heading(room.name, x, a.y + 3, 5);
  const floorArea = room.area;
  const stats: [string, string][] = [
    ['Área útil (piso)', `${fmtDim(floorArea)} m²`],
    ['Perímetro', `${fmtDim(room.perimeter)} m`],
    ['Pé-direito', `${fmtDim(info.ceilingHeight)} m`],
    ['Volume', `${fmt1(floorArea * info.ceilingHeight)} m³`],
    ['Acabamento de piso', info.finish],
    ['Área de paredes (líquida)', `${fmtDim(info.netWallArea)} m²`],
    ['Rodapé (aprox.)', `${fmtDim(Math.max(0, room.perimeter - info.openings.filter((o) => o.op.kind === 'door').reduce((s, o) => s + o.op.width, 0)))} m`],
  ];
  for (const [k, v] of stats) {
    doc.text(k, x, y, 2.3, { color: MUTED });
    doc.text(v, x + w, y, 2.5, { bold: true, align: 'right' });
    doc.pdf.setDrawColor('#e6e9ee');
    doc.pdf.setLineWidth(0.15);
    doc.pdf.line(x, y + 2.6, x + w, y + 2.6);
    y += 6.2;
  }
  const more = () => {
    doc.newSheet(`Cômodo: ${room.name} (cont.)`);
    return doc.area.y;
  };
  y += 4;
  y = doc.heading('Paredes (medidas internas)', x, y, 3);
  y = doc.table(
    x,
    y,
    [w * 0.2, w * 0.4, w * 0.4],
    ['Lado', 'Comprimento m', 'Altura m'],
    info.edges.map((e, i) => [String(i + 1), fmtDim(e.length), fmtDim(e.height)]),
    { align: ['left', 'right', 'right'], rowH: 5.6, onPage: more },
  );
  y += 5;
  y = doc.heading('Portas e janelas', x, y, 3);
  y = info.openings.length
    ? doc.table(
        x,
        y,
        [w * 0.14, w * 0.22, w * 0.34, w * 0.3],
        ['Cód.', 'Tipo', 'Larg. x Alt. m', 'Peitoril m'],
        info.openings.map((o) => [o.tag, styleName(o.op), `${fmtDim(o.op.width)} x ${fmtDim(o.op.height)}`, o.op.kind === 'door' ? '-' : fmtDim(o.op.sill)]),
        { align: ['left', 'left', 'right', 'right'], rowH: 5.6, onPage: more },
      )
    : (doc.text('Nenhuma.', x, y + 2, 2.2, { color: MUTED }), y + 6);
  y += 5;
  y = doc.heading('Mobiliário', x, y, 3);
  if (info.furniture.length) {
    doc.table(
      x,
      y,
      [w * 0.5, w * 0.14, w * 0.36],
      ['Item', 'Qtd.', 'L x P x A m'],
      groupFurniture(info.furniture.map((f) => ({ f, name: furnitureName(f), roomName: room.name }))).map((g) => [g.name, String(g.qty), g.dims]),
      { align: ['left', 'right', 'right'], rowH: 5.6, onPage: more },
    );
  } else doc.text('Nenhum item.', x, y + 2, 2.2, { color: MUTED });
}

function furnitureSheet(doc: Doc, sch: ProjectSchedule) {
  doc.newSheet('Lista de mobiliário');
  const a = doc.area;
  const y = doc.heading('Lista de mobiliário', a.x, a.y + 2);
  const groups = groupFurniture(sch.furniture);
  doc.table(
    a.x,
    y,
    [a.w * 0.07, a.w * 0.27, a.w * 0.34, a.w * 0.08, a.w * 0.24],
    ['Nº', 'Ambiente', 'Item', 'Qtd.', 'L x P x A m'],
    groups.map((g, i) => [String(i + 1), g.roomName, g.name, String(g.qty), g.dims]),
    {
      align: ['left', 'left', 'left', 'right', 'right'],
      foot: ['', 'Total de itens', '', String(sch.furniture.length), ''],
      onPage: () => {
        doc.newSheet('Lista de mobiliário (cont.)');
        return doc.area.y;
      },
    },
  );
}

function viewsSheet(doc: Doc, views: { title: string; src: string }[]) {
  for (let i = 0; i < views.length; i += 2) {
    doc.newSheet('Vistas 3D');
    const a = doc.area;
    const pair = views.slice(i, i + 2);
    const w = (a.w - 8) / pair.length;
    pair.forEach((v, j) => {
      const x = a.x + j * (w + 8);
      doc.text(v.title, x, a.y + 2, 3, { bold: true });
      doc.image(v.src, { x, y: a.y + 8, w, h: a.h - 8 }, 1.6);
    });
  }
}

/** Agrupa móveis iguais (mesmo ambiente, item e medidas) com quantidade. */
export function groupFurniture(rows: FurnitureRow[]) {
  const map = new Map<string, { roomName: string; name: string; dims: string; qty: number }>();
  for (const r of rows) {
    const dims = `${fmtDim(r.f.width)} x ${fmtDim(r.f.depth)} x ${fmtDim(r.f.height)}`;
    const key = `${r.roomName}|${r.name}|${dims}`;
    const g = map.get(key);
    if (g) g.qty++;
    else map.set(key, { roomName: r.roomName, name: r.name, dims, qty: 1 });
  }
  return [...map.values()];
}
