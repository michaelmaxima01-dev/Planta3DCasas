/**
 * Desenho técnico da planta independente do formato de saída.
 * Gera primitivas (polígonos, arcos, textos e blocos) em metros, nas coordenadas da planta,
 * organizadas em camadas. O PDF e o DXF desenham a partir daqui.
 */
import { CATALOG_BY_ID } from '../catalog/catalog';
import { type Vec2, add, mul, normalize, perp, pointInPolygon, sub } from '../geometry/vec';
import { wallPlanPieces } from '../geometry/walls';
import type { Opening, Plan } from '../model/types';
import type { ProjectSchedule } from './schedule';

export type Layer = 'PAREDES' | 'PORTAS' | 'JANELAS' | 'MOVEIS' | 'COTAS' | 'TEXTOS' | 'COMODOS' | 'PILARES' | 'VIGAS' | 'LAJES' | 'FUNDACAO';

export const LAYERS: { name: Layer; color: number; label: string }[] = [
  // color = índice de cor do AutoCAD (ACI)
  { name: 'PAREDES', color: 7, label: 'Paredes' },
  { name: 'PORTAS', color: 4, label: 'Portas' },
  { name: 'JANELAS', color: 5, label: 'Janelas' },
  { name: 'MOVEIS', color: 8, label: 'Móveis' },
  { name: 'COTAS', color: 1, label: 'Cotas' },
  { name: 'TEXTOS', color: 3, label: 'Textos' },
  { name: 'COMODOS', color: 9, label: 'Contorno dos cômodos' },
  { name: 'PILARES', color: 30, label: 'Pilares' },
  { name: 'VIGAS', color: 6, label: 'Vigas' },
  { name: 'LAJES', color: 2, label: 'Lajes' },
  { name: 'FUNDACAO', color: 40, label: 'Fundação' },
];

interface Style {
  /** Espessura da linha impressa, em mm. */
  weight?: number;
  stroke?: string | null;
  dash?: boolean;
}

export type Prim =
  | ({ t: 'poly'; layer: Layer; pts: Vec2[]; closed: boolean; fill?: string } & Style)
  | ({ t: 'arc'; layer: Layer; c: Vec2; r: number; a0: number; a1: number } & Style)
  | {
      t: 'text';
      layer: Layer;
      p: Vec2;
      text: string;
      /** Altura impressa em mm (independente da escala). */
      size: number;
      angle: number;
      bold?: boolean;
      color?: string;
    }
  | { t: 'insert'; layer: Layer; block: string; p: Vec2; rotation: number };

export interface Block {
  name: string;
  prims: Prim[];
}

export interface Drawing {
  prims: Prim[];
  blocks: Record<string, Block>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Limites só da geometria (sem a margem reservada às cotas). */
  content: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface DrawingOptions {
  /** Denominador da escala (100 = 1:100). Define tamanho de textos e afastamento das cotas. */
  scale: number;
  furniture?: boolean;
  dimensions?: boolean;
  texts?: boolean;
  roomFills?: boolean;
  /** Desenha cotas internas de um cômodo (página do cômodo). */
  innerDimsFor?: string;
}

const fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDim = (v: number) => fmt2.format(v);
const readable = (a: number) => {
  let r = a;
  while (r > Math.PI / 2 + 1e-9) r -= Math.PI;
  while (r <= -Math.PI / 2 + 1e-9) r += Math.PI;
  return r;
};

/** Cota: linha de cota paralela a ab, deslocada `off` metros na direção n, com chamada e texto. */
export function dimensionPrims(a: Vec2, b: Vec2, n: Vec2, off: number, mm: (v: number) => number, text: string): Prim[] {
  const da = add(a, mul(n, off));
  const db = add(b, mul(n, off));
  const d = normalize(sub(b, a));
  const tick = mul(normalize(add(d, n)), mm(1.2));
  const ext = mm(1.5);
  const gap = mm(1);
  const mid = add(mul(add(da, db), 0.5), mul(n, mm(1.8)));
  const line = (p: Vec2, q: Vec2): Extract<Prim, { t: 'poly' }> => ({ t: 'poly', layer: 'COTAS', pts: [p, q], closed: false, weight: 0.13 });
  return [
    line(da, db),
    line(add(a, mul(n, gap)), add(da, mul(n, ext))),
    line(add(b, mul(n, gap)), add(db, mul(n, ext))),
    { ...line(sub(da, tick), add(da, tick)), weight: 0.35 },
    { ...line(sub(db, tick), add(db, tick)), weight: 0.35 },
    { t: 'text', layer: 'COTAS', p: mid, text, size: 2, angle: readable(Math.atan2(d.y, d.x)) },
  ];
}

function arcPoints(c: Vec2, r: number, a0: number, a1: number, steps = 24): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  }
  return out;
}
export { arcPoints };

export function furnitureBlockName(f: { catalogId: string; width: number; depth: number; height: number }) {
  const cm = (v: number) => Math.round(v * 100);
  return `MOV_${f.catalogId}_${cm(f.width)}x${cm(f.depth)}x${cm(f.height)}`.toUpperCase();
}

function furnitureBlock(name: string, f: { catalogId: string; width: number; depth: number; height: number }): Block {
  const item = CATALOG_BY_ID[f.catalogId];
  const parts = item ? item.parts(f.width, f.depth, f.height) : [];
  const prims: Prim[] = parts
    .map((p, i) => ({ p, i, top: p.y + p.sy / 2 }))
    .sort((a, b) => a.top - b.top || a.i - b.i)
    .map(({ p }) => {
      const pts =
        p.shape === 'box'
          ? [
              { x: p.x - p.sx / 2, y: p.z - p.sz / 2 },
              { x: p.x + p.sx / 2, y: p.z - p.sz / 2 },
              { x: p.x + p.sx / 2, y: p.z + p.sz / 2 },
              { x: p.x - p.sx / 2, y: p.z + p.sz / 2 },
            ]
          : Array.from({ length: 24 }, (_, k) => {
              const a = (k / 24) * Math.PI * 2;
              return { x: p.x + (p.sx / 2) * Math.cos(a), y: p.z + (p.sz / 2) * Math.sin(a) };
            });
      const c = Math.cos(p.ry ?? 0);
      const s2 = Math.sin(p.ry ?? 0);
      const rot = p.ry ? pts.map((q) => ({ x: p.x + (q.x - p.x) * c - (q.y - p.z) * s2, y: p.z + (q.x - p.x) * s2 + (q.y - p.z) * c })) : pts;
      return { t: 'poly', layer: 'MOVEIS', pts: rot, closed: true, fill: p.material === 'glass' ? undefined : p.color, stroke: '#555b61', weight: 0.13 } as Prim;
    });
  return { name, prims };
}

export function buildDrawing(plan: Plan, sch: ProjectSchedule, o: DrawingOptions): Drawing {
  const mm = (v: number) => (v * o.scale) / 1000; // mm impressos → metros no modelo
  const prims: Prim[] = [];
  const blocks: Record<string, Block> = {};
  const geoms = sch.geoms;
  const roomPolys = sch.rooms.map((r) => r.room.polygon);

  // pisos e contorno dos cômodos
  for (const r of sch.rooms) {
    prims.push({ t: 'poly', layer: 'COMODOS', pts: r.room.inner, closed: true, fill: o.roomFills ? r.room.floorColor : undefined, stroke: null });
  }

  // móveis (por baixo das paredes)
  if (o.furniture !== false) {
    const list = Object.values(plan.furniture).sort((a, b) => a.elevation + a.height - (b.elevation + b.height));
    for (const f of list) {
      if (!CATALOG_BY_ID[f.catalogId]) continue;
      const name = furnitureBlockName(f);
      blocks[name] ??= furnitureBlock(name, f);
      prims.push({ t: 'insert', layer: 'MOVEIS', block: name, p: { x: f.x, y: f.y }, rotation: f.rotation });
    }
  }

  // paredes: partes cheias (vãos abertos) com hachura sólida
  const byWall: Record<string, Opening[]> = {};
  for (const op of Object.values(plan.openings)) (byWall[op.wallId] ??= []).push(op);
  for (const g of Object.values(geoms)) {
    for (const pts of wallPlanPieces(g, byWall[g.id] ?? [])) {
      prims.push({ t: 'poly', layer: 'PAREDES', pts, closed: true, fill: '#3b4047', stroke: '#1f2328', weight: 0.35 });
    }
  }

  // portas e janelas
  for (const info of sch.openings) {
    const { op } = info;
    const g = geoms[op.wallId];
    const c = info.center;
    const t = g.thickness;
    const w = op.width;
    const L = (u: number, v: number) => add(add(c, mul(g.dir, u)), mul(g.normal, v));
    const line = (layer: Layer, p: Vec2, q: Vec2, weight = 0.18, dash = false): Prim => ({ t: 'poly', layer, pts: [p, q], closed: false, weight, dash });
    if (op.kind === 'door') {
      const hinge = op.flip ? w / 2 : -w / 2;
      const s = op.side ? -1 : 1;
      const other = -hinge;
      prims.push(line('PORTAS', L(-w / 2, -t / 2), L(-w / 2, t / 2), 0.25));
      prims.push(line('PORTAS', L(w / 2, -t / 2), L(w / 2, t / 2), 0.25));
      const h0 = L(hinge, s * (t / 2));
      const leaf = L(hinge, s * (t / 2 + w));
      prims.push({ t: 'poly', layer: 'PORTAS', pts: [h0, leaf], closed: false, weight: 0.35 });
      const aStart = Math.atan2(leaf.y - h0.y, leaf.x - h0.x);
      const end = L(other, s * (t / 2));
      const aEnd0 = Math.atan2(end.y - h0.y, end.x - h0.x);
      let delta = aEnd0 - aStart;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      const a0 = delta > 0 ? aStart : aStart + delta;
      prims.push({ t: 'arc', layer: 'PORTAS', c: h0, r: w, a0, a1: a0 + Math.abs(delta), weight: 0.13, dash: true });
    } else {
      for (const v of [-t / 2, -t / 6, t / 6, t / 2]) prims.push(line('JANELAS', L(-w / 2, v), L(w / 2, v), Math.abs(v) > t / 3 ? 0.25 : 0.13));
      prims.push(line('JANELAS', L(-w / 2, -t / 2), L(-w / 2, t / 2), 0.25));
      prims.push(line('JANELAS', L(w / 2, -t / 2), L(w / 2, t / 2), 0.25));
    }
    if (o.texts !== false) {
      // etiqueta P1/J1 do lado oposto à abertura da porta (ou do lado externo da janela)
      let side = op.kind === 'door' ? (op.side ? 1 : -1) : 1;
      if (op.kind === 'window') {
        const probe = L(0, t / 2 + 0.15);
        if (roomPolys.some((poly) => pointInPolygon(probe, poly))) side = -1;
      }
      prims.push({ t: 'text', layer: 'TEXTOS', p: L(0, side * (t / 2 + mm(3))), text: info.tag, size: 2, angle: readable(Math.atan2(g.dir.y, g.dir.x)), bold: true, color: op.kind === 'door' ? '#0b7285' : '#1c5fb8' });
    }
  }

  // nome e área dos cômodos
  if (o.texts !== false) {
    for (const r of sch.rooms) {
      // texto cabe na largura do cômodo (largura aproximada de um caractere ≈ 0,62 × altura)
      const rb = boundsOf(r.room.inner)!;
      const widthMm = ((rb.maxX - rb.minX) * 1000) / o.scale;
      const name = r.room.name.toUpperCase();
      const area = `A = ${fmtDim(r.room.area)} m²`;
      const fit = (pref: number, text: string) => Math.max(1.4, Math.min(pref, (widthMm * 0.85) / (text.length * 0.62)));
      const nameSize = fit(2.6, name);
      const areaSize = Math.min(fit(2, area), nameSize);
      prims.push({ t: 'text', layer: 'TEXTOS', p: add(r.room.center, { x: 0, y: -mm(nameSize * 0.75) }), text: name, size: nameSize, angle: 0, bold: true });
      prims.push({ t: 'text', layer: 'TEXTOS', p: add(r.room.center, { x: 0, y: mm(areaSize * 0.85) }), text: area, size: areaSize, angle: 0 });
    }
  }

  // cotas externas: uma por parede de fachada e uma total por lado
  const wallBounds = boundsOf(Object.values(geoms).flatMap((g) => g.polygon));
  if (o.dimensions !== false && wallBounds) {
    for (const g of Object.values(geoms)) {
      const m = mul(add(g.a, g.b), 0.5);
      const probe = (n: Vec2) => add(m, mul(n, g.thickness / 2 + 0.05));
      const outside = (n: Vec2) => !roomPolys.some((poly) => pointInPolygon(probe(n), poly));
      const n = outside(g.normal) ? g.normal : outside(mul(g.normal, -1)) ? mul(g.normal, -1) : null;
      if (!n || g.length < 0.3) continue;
      prims.push(...dimensionPrims(g.a, g.b, n, g.thickness / 2 + mm(7), mm, fmtDim(g.length)));
    }
    const { minX, minY, maxX, maxY } = wallBounds;
    const off = mm(15);
    prims.push(...dimensionPrims({ x: minX, y: minY }, { x: maxX, y: minY }, { x: 0, y: -1 }, off, mm, fmtDim(maxX - minX)));
    prims.push(...dimensionPrims({ x: minX, y: maxY }, { x: minX, y: minY }, { x: -1, y: 0 }, off, mm, fmtDim(maxY - minY)));
  }

  // cotas internas do cômodo (página por cômodo)
  if (o.innerDimsFor) {
    const r = sch.rooms.find((x) => x.room.id === o.innerDimsFor);
    if (r) {
      for (const e of r.edges) {
        if (e.length < 0.25) continue;
        const d = normalize(sub(e.b, e.a));
        prims.push(...dimensionPrims(e.a, e.b, perp(d), mm(4), mm, fmtDim(e.length)));
      }
    }
  }

  const all = [...Object.values(geoms).flatMap((g) => g.polygon), ...Object.values(plan.furniture)];
  const b = boundsOf(all) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const pad = o.dimensions !== false ? mm(24) : mm(6);
  return { prims, blocks, content: b, bounds: { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad } };
}

export function boundsOf(pts: Vec2[]) {
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Converte coordenadas locais de um bloco para a planta. */
export function transformInsert(p: Vec2, at: Vec2, rotation: number): Vec2 {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return { x: at.x + p.x * c - p.y * s, y: at.y + p.x * s + p.y * c };
}

