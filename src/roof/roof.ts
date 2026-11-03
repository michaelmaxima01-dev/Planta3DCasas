/**
 * Telhado: geometria (planos, cumeeira, espigões, oitões), quantitativos de telhas e madeiramento
 * e verificação simplificada da terça (NBR 7190 - madeira; vento da NBR 6123 não verificado).
 *
 * O telhado cobre o retângulo envolvente do último pavimento + beiral e se apoia na laje de cobertura
 * por pontaletes (solução usual em sobrados com laje).
 */
import { computeWallGeometry } from '../geometry/walls';
import type { Building } from '../model/types';
import { ROOFS, type RoofKind, roofTile } from '../structure/types';

export type RoofType = 'duas_aguas' | 'quatro_aguas' | 'uma_agua' | 'plano';

export interface RoofModel {
  type: RoofType;
  /** Inclinação em % (ex.: 30 = 30 cm de altura a cada 1 m). */
  slope: number;
  /** Beiral (m). */
  overhang: number;
  /** Gira a cumeeira 90° em relação ao lado maior. */
  rotate: boolean;
  /** Sustentação: pontaletes sobre a laje ou tesouras apoiadas nas paredes/vigas (forro no último andar). */
  support?: RoofSupport;
}

export type RoofSupport = 'laje' | 'tesoura';
export const ROOF_SUPPORTS: { key: RoofSupport; name: string; text: string }[] = [
  { key: 'laje', name: 'Sobre a laje (pontaletes)', text: 'Laje de concreto no teto do último andar; o madeiramento apoia em pontaletes sobre ela.' },
  { key: 'tesoura', name: 'Tesouras de madeira (forro)', text: 'Sem laje no último andar: tesouras a cada 3 m vencem o vão e descarregam nas vigas de respaldo das paredes externas.' },
];

export const ROOF_TYPES: { key: RoofType; name: string }[] = [
  { key: 'duas_aguas', name: 'Duas águas' },
  { key: 'quatro_aguas', name: 'Quatro águas' },
  { key: 'uma_agua', name: 'Uma água' },
  { key: 'plano', name: 'Laje plana (sem telhado)' },
];

/** Inclinações mínimas usuais por telha (%). */
export const MIN_SLOPE = Object.fromEntries(ROOFS.map((r) => [r.key, r.minSlope])) as Record<RoofKind, number>;
export const ROOF_COLOR = Object.fromEntries(ROOFS.map((r) => [r.key, r.color])) as Record<RoofKind, string>;

export function defaultRoof(): RoofModel {
  return { type: 'duas_aguas', slope: 35, overhang: 0.6, rotate: false };
}

export type P3 = [number, number, number];

export interface RoofGeometry {
  /** Base (cota do topo da laje do último pavimento). */
  base: number;
  /** Retângulo do beiral. */
  eave: { minX: number; minY: number; maxX: number; maxY: number };
  /** Retângulo das paredes (sem beiral). */
  walls: { minX: number; minY: number; maxX: number; maxY: number };
  /** Planos do telhado (polígonos 3D: x, y da planta e z = altura). */
  faces: P3[][];
  /** Oitões (triângulos de alvenaria nas pontas do telhado de duas águas). */
  gables: P3[][];
  /** Linhas da planta de cobertura: cumeeira e espigões. */
  ridges: [P3, P3][];
  /** Setas de caimento (início, fim) na planta. */
  arrows: [P3, P3][];
  ridgeHeight: number;
  projectedArea: number;
  realArea: number;
  angle: number;
  /** Direção da cumeeira: 'x' ou 'y'. */
  ridgeDir: 'x' | 'y';
}

export function roofGeometry(b: Building): RoofGeometry | null {
  const roof = b.roof ?? defaultRoof();
  const top = b.levels[b.levels.length - 1];
  if (!top) return null;
  const polys = Object.values(computeWallGeometry(top.plan)).flatMap((g) => g.polygon);
  if (polys.length === 0) return null;
  const walls = {
    minX: Math.min(...polys.map((p) => p.x)),
    minY: Math.min(...polys.map((p) => p.y)),
    maxX: Math.max(...polys.map((p) => p.x)),
    maxY: Math.max(...polys.map((p) => p.y)),
  };
  const o = roof.type === 'plano' ? 0 : roof.overhang;
  const e = { minX: walls.minX - o, minY: walls.minY - o, maxX: walls.maxX + o, maxY: walls.maxY + o };
  const base = top.elevation + top.height;
  const W = e.maxX - e.minX;
  const D = e.maxY - e.minY;
  let ridgeDir: 'x' | 'y' = W >= D ? 'x' : 'y';
  if (roof.rotate) ridgeDir = ridgeDir === 'x' ? 'y' : 'x';
  const i = roof.slope / 100;
  const angle = Math.atan(i);
  const projectedArea = W * D;
  const faces: P3[][] = [];
  const gables: P3[][] = [];
  const ridges: [P3, P3][] = [];
  const arrows: [P3, P3][] = [];
  let ridgeHeight = 0;

  // trabalha num sistema local (u ao longo da cumeeira, v através) e converte para x/y
  const toXY = (u: number, v: number, z: number): P3 => (ridgeDir === 'x' ? [u, v, z] : [v, u, z]);
  const [u0, u1, v0, v1] = ridgeDir === 'x' ? [e.minX, e.maxX, e.minY, e.maxY] : [e.minY, e.maxY, e.minX, e.maxX];
  const [wu0, wu1, wv0, wv1] = ridgeDir === 'x' ? [walls.minX, walls.maxX, walls.minY, walls.maxY] : [walls.minY, walls.maxY, walls.minX, walls.maxX];
  const S = v1 - v0;
  const vm = (v0 + v1) / 2;

  if (roof.type === 'plano') {
    faces.push([toXY(u0, v0, base), toXY(u1, v0, base), toXY(u1, v1, base), toXY(u0, v1, base)]);
  } else if (roof.type === 'uma_agua') {
    const h = i * S;
    ridgeHeight = h;
    faces.push([toXY(u0, v0, base + h), toXY(u1, v0, base + h), toXY(u1, v1, base), toXY(u0, v1, base)]);
    const hw = (z: number) => base + h * ((v1 - z) / S);
    gables.push([toXY(wu0, wv0, base), toXY(wu0, wv1, base), toXY(wu0, wv1, hw(wv1)), toXY(wu0, wv0, hw(wv0))]);
    gables.push([toXY(wu1, wv0, base), toXY(wu1, wv1, base), toXY(wu1, wv1, hw(wv1)), toXY(wu1, wv0, hw(wv0))]);
    arrows.push([toXY((u0 + u1) / 2, v0 + S * 0.2, base), toXY((u0 + u1) / 2, v1 - S * 0.2, base)]);
  } else if (roof.type === 'duas_aguas') {
    const h = (i * S) / 2;
    ridgeHeight = h;
    faces.push([toXY(u0, v0, base), toXY(u1, v0, base), toXY(u1, vm, base + h), toXY(u0, vm, base + h)]);
    faces.push([toXY(u0, vm, base + h), toXY(u1, vm, base + h), toXY(u1, v1, base), toXY(u0, v1, base)]);
    const hw = (v: number) => base + i * ((S / 2) - Math.abs(v - vm));
    for (const u of [wu0, wu1]) gables.push([toXY(u, wv0, base), toXY(u, wv1, base), toXY(u, wv1, hw(wv1)), toXY(u, vm, base + h), toXY(u, wv0, hw(wv0))]);
    ridges.push([toXY(u0, vm, base + h), toXY(u1, vm, base + h)]);
    const um = (u0 + u1) / 2;
    arrows.push([toXY(um, vm - S * 0.1, base), toXY(um, v0 + S * 0.12, base)], [toXY(um, vm + S * 0.1, base), toXY(um, v1 - S * 0.12, base)]);
  } else {
    // quatro águas: cumeeira menor no meio e espigões até os cantos
    const h = (i * S) / 2;
    ridgeHeight = h;
    const r0 = Math.min(u0 + S / 2, (u0 + u1) / 2);
    const r1 = Math.max(u1 - S / 2, (u0 + u1) / 2);
    const R0 = toXY(r0, vm, base + h);
    const R1 = toXY(r1, vm, base + h);
    const c00 = toXY(u0, v0, base);
    const c10 = toXY(u1, v0, base);
    const c11 = toXY(u1, v1, base);
    const c01 = toXY(u0, v1, base);
    faces.push([c00, c10, R1, R0], [R0, R1, c11, c01], [c01, c00, R0], [c10, c11, R1]);
    if (r1 > r0 + 1e-6) ridges.push([R0, R1]);
    ridges.push([c00, R0], [c01, R0], [c10, R1], [c11, R1]);
    const um = (u0 + u1) / 2;
    arrows.push([toXY(um, vm - S * 0.1, base), toXY(um, v0 + S * 0.12, base)], [toXY(um, vm + S * 0.1, base), toXY(um, v1 - S * 0.12, base)]);
  }
  const realArea = roof.type === 'plano' ? projectedArea : projectedArea / Math.cos(angle);
  return { base, eave: e, walls, faces, gables, ridges, arrows, ridgeHeight, projectedArea, realArea, angle, ridgeDir };
}

export interface RoofElement {
  name: string;
  section: string;
  spacing: string;
  quantity: string;
  /** Quantidade numérica e unidade (para o quantitativo). */
  qty: number;
  unit: string;
  /** Volume de madeira (m³), quando for peça de madeira. */
  wood?: number;
}

export interface BeamCheck {
  name: string;
  section: string;
  span: number;
  q: number;
  sigma: number;
  fd: number;
  deflection: number;
  limit: number;
  ok: boolean;
}

export interface RoofResult {
  type: RoofType;
  support: RoofSupport;
  tile: string;
  geometry: RoofGeometry;
  elements: RoofElement[];
  /** Peso da cobertura (kN/m² em projeção) e peso total (kN). */
  load: number;
  weight: number;
  /** Verificações de madeira: terça, caibro e banzo da tesoura. */
  checks: BeamCheck[];
  purlin?: BeamCheck;
  truss?: { span: number; spacing: number; count: number; heightAtWalls: number };
  /** Lados que recebem a carga das tesouras (comprimento e carga por metro). */
  eaveLoads: { side: 'minX' | 'maxX' | 'minY' | 'maxY'; length: number; q: number }[];
  woodVolume: number;
  status: 'ok' | 'warn' | 'fail';
  notes: string[];
}

/** Flexão e flecha de peça de madeira biapoiada (C30 conífera: fd ≈ 12 MPa, E ≈ 14,5 GPa). */
function woodBeam(name: string, b: number, h: number, span: number, q: number): BeamCheck {
  const M = (q * span * span) / 8; // kN·m
  const W = (b * h * h) / 6; // cm³
  const sigma = ((1.4 * M * 100) / W) * 10; // MPa
  const fd = (0.56 * 30) / 1.4;
  const I = (b * h ** 3) / 12;
  const deflection = ((5 * (q / 100) * (span * 100) ** 4) / (384 * 1450 * I)) * 10; // mm
  const limit = (span * 1000) / 200;
  return { name, section: `${b} × ${h} cm`, span, q, sigma, fd, deflection, limit, ok: sigma <= fd && deflection <= limit };
}

const nf = (v: number, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Projeto do telhado: madeiramento, sustentação (pontaletes ou tesouras), quantitativos e verificações.
 * `load` = peso da cobertura (kN/m² em projeção), `live` = sobrecarga.
 */
export function analyzeRoof(b: Building, material: RoofKind, load: number, live: number): RoofResult | null {
  const roof = { ...defaultRoof(), ...b.roof };
  const support: RoofSupport = roof.support ?? 'laje';
  const g = roofGeometry(b);
  if (!g) return null;
  const tile = roofTile(material);
  const notes: string[] = [];
  let status: RoofResult['status'] = 'ok';
  const worse = (s: RoofResult['status']) => {
    if (s === 'fail' || status === 'fail') status = 'fail';
    else if (s === 'warn') status = 'warn';
  };
  const elements: RoofElement[] = [];
  const A = g.realArea;
  const deg = (g.angle * 180) / Math.PI;
  const ceil = (v: number) => Math.ceil(v - 1e-9);
  const el = (name: string, section: string, spacing: string, qty: number, unit: string, wood?: number) =>
    elements.push({ name, section, spacing, qty, unit, wood, quantity: `${unit === 'm' || unit === 'm²' ? ceil(qty) : ceil(qty).toLocaleString('pt-BR')} ${unit}` });
  const result = (extra: Partial<RoofResult>): RoofResult => ({
    type: roof.type,
    support,
    tile: tile.name,
    geometry: g,
    elements,
    load,
    weight: load * g.projectedArea,
    checks: [],
    eaveLoads: [],
    woodVolume: elements.reduce((s, e) => s + (e.wood ?? 0), 0),
    status,
    notes,
    ...extra,
  });

  if (roof.type === 'plano' || tile.family === 'laje') {
    notes.push('Cobertura em laje: impermeabilização (manta asfáltica + proteção mecânica), caimento mínimo de 1% para os ralos e platibanda.');
    el('Manta asfáltica 4 mm', '-', '-', g.projectedArea * 1.15, 'm²');
    el('Ralos e condutores Ø100', '-', '1 a cada 40 m²', Math.max(2, ceil(g.projectedArea / 40)), 'un');
    return result({});
  }

  if (roof.slope < tile.minSlope) {
    worse('fail');
    notes.push(`Inclinação de ${roof.slope}% abaixo do mínimo para ${tile.name} (${tile.minSlope}%): risco de infiltração.`);
  }
  if (roof.overhang > 1.0) {
    worse('warn');
    notes.push('Beiral acima de 1 m: verificar a ancoragem dos caibros/terças em balanço.');
  }

  // ----- geometria auxiliar -----
  const W = g.walls;
  const ridgeX = g.ridgeDir === 'x';
  const along = ridgeX ? W.maxX - W.minX : W.maxY - W.minY; // comprimento na direção da cumeeira
  const span = ridgeX ? W.maxY - W.minY : W.maxX - W.minX; // vão das tesouras
  const ridgeLen = g.ridges.reduce((s, [a, c]) => s + Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), 0);
  const e = g.eave;
  const eaveLen = roof.type === 'quatro_aguas' ? 2 * (e.maxX - e.minX + e.maxY - e.minY) : 2 * (ridgeX ? e.maxX - e.minX : e.maxY - e.minY);
  const rake = roof.type === 'quatro_aguas' ? 0 : (roof.type === 'uma_agua' ? 2 : 4) * ((ridgeX ? e.maxY - e.minY : e.maxX - e.minX) / (roof.type === 'uma_agua' ? 1 : 2)) / Math.cos(g.angle);

  // ----- cobertura -----
  if (tile.family === 'telha') {
    el(`Telhas: ${tile.name}`, '-', `≈ ${tile.perM2} un/m²`, A * (tile.perM2 ?? 16) * 1.05, 'un');
    el('Cumeeiras e espigões (peças)', '-', '3 un/m', ridgeLen * 3, 'un');
    el('Ripas', '2,5 × 5 cm', `galga ${nf(tile.galga ?? 0.33)} m`, A / (tile.galga ?? 0.33), 'm', (A / (tile.galga ?? 0.33)) * 0.025 * 0.05);
    el('Caibros', '5 × 6 cm', '0,50 m', A / 0.5, 'm', (A / 0.5) * 0.05 * 0.06);
  } else if (tile.family === 'chapa') {
    el(`Telhas: ${tile.name}`, '-', '-', tile.key === 'fibrocimento' ? (A / (tile.sheet ?? 2.13)) * 1.05 : A * 1.05, tile.key === 'fibrocimento' ? 'un' : 'm²');
    el('Cumeeiras (peças)', '-', '-', ridgeLen / (tile.key === 'fibrocimento' ? 1.0 : 1.0), 'un');
    el('Parafusos/ganchos de fixação', '-', '≈ 3 un/m²', A * 3, 'un');
  } else {
    el('Shingle (fardos de 3,1 m²)', '-', '-', (A / 3.1) * 1.1, 'un');
    el('Chapas OSB 11 mm (1,22 × 2,44)', '-', '-', (A / 2.98) * 1.08, 'un');
    el('Manta de subcobertura (rolos 30 m²)', '-', '-', (A / 30) * 1.1, 'un');
    el('Caibros', '5 × 6 cm', '0,60 m', A / 0.6, 'm', (A / 0.6) * 0.05 * 0.06);
  }

  // ----- terças -----
  const terSpacing = tile.family === 'chapa' ? (tile.key === 'fibrocimento' ? 1.15 : 1.5) : 1.5;
  const terLen = A / terSpacing;
  el('Terças', '6 × 16 cm', `${nf(terSpacing)} m`, terLen, 'm', terLen * 0.06 * 0.16);

  // ----- sustentação -----
  const total = (load + live) * g.projectedArea;
  let truss: RoofResult['truss'];
  const eaveLoads: RoofResult['eaveLoads'] = [];
  let purlinSpan = 2.0;
  if (support === 'laje') {
    el('Pontaletes (sobre a laje)', '7,5 × 7,5 cm', '2,00 m sob as terças', terLen / 2, 'un', (terLen / 2) * 0.075 * 0.075 * Math.max(0.3, g.ridgeHeight / 2));
    notes.push('Peso do telhado descarrega na laje de cobertura por meio dos pontaletes.');
  } else {
    const spacing = 3.0;
    const count = ceil(along / spacing) + 1;
    purlinSpan = along / (count - 1);
    const hWalls = roof.type === 'uma_agua' ? (roof.slope / 100) * span : ((roof.slope / 100) * span) / 2;
    const top = (roof.type === 'uma_agua' ? Math.hypot(span, hWalls) : 2 * Math.hypot(span / 2, hWalls)) + 2 * roof.overhang;
    const memberLen = top + span + hWalls + 1.2 * span; // banzos + pendural + diagonais/montantes
    truss = { span, spacing: purlinSpan, count, heightAtWalls: hWalls };
    el(roof.type === 'uma_agua' ? 'Meias-tesouras de madeira' : 'Tesouras de madeira (Howe)', 'banzos 6 × 16 cm', `${nf(purlinSpan)} m`, count, 'un', count * memberLen * 0.06 * 0.16);
    el('Forro (PVC ou gesso) do último andar', '-', '-', (W.maxX - W.minX) * (W.maxY - W.minY), 'm²');
    if (span > 12) {
      worse('warn');
      notes.push(`Vão de ${nf(span)} m acima do usual para tesoura de madeira (até ~12 m): considerar tesoura metálica ou apoio intermediário.`);
    }
    // carga das tesouras nas paredes de beiral (vigas de respaldo)
    const sides: ('minX' | 'maxX' | 'minY' | 'maxY')[] = roof.type === 'quatro_aguas' ? ['minX', 'maxX', 'minY', 'maxY'] : ridgeX ? ['minY', 'maxY'] : ['minX', 'maxX'];
    const sideLen = (sd: string) => (sd === 'minX' || sd === 'maxX' ? W.maxY - W.minY : W.maxX - W.minX);
    const perim = sides.reduce((s, sd) => s + sideLen(sd), 0);
    for (const sd of sides) eaveLoads.push({ side: sd, length: sideLen(sd), q: total / perim });
    notes.push(`Tesouras descarregam ${nf(total / perim)} kN/m nas vigas de respaldo das paredes de beiral.`);
  }

  // ----- calhas, rufos e fixações -----
  el('Calhas (beiral)', 'chapa galvanizada', '-', eaveLen, 'm');
  el('Condutores Ø100', '-', '1 a cada 8 m de calha', Math.max(2, ceil(eaveLen / 8)), 'un');
  if (rake > 0) el('Rufos / testeiras (oitões)', '-', '-', rake, 'm');
  el('Pregos e parafusos', '-', '≈ 0,15 kg/m²', A * 0.15, 'kg');
  el('Manta térmica sob as telhas (opcional)', '-', '-', A * 1.1, 'm²');

  // ----- verificações (com escolha automática da seção de madeira) -----
  const pick = (name: string, options: [number, number][], span: number, q: number) => {
    let c = woodBeam(name, options[0][0], options[0][1], span, q);
    for (const [bb, hh] of options) {
      c = woodBeam(name, bb, hh, span, q);
      if (c.ok) break;
    }
    return { c, b: Number(c.section.split(' ')[0]), h: Number(c.section.split(' ')[2]) };
  };
  const setSection = (prefix: string, b0: number, h0: number, b1: number, h1: number) => {
    const e = elements.find((x) => x.name.startsWith(prefix));
    if (!e || (b0 === b1 && h0 === h1)) return;
    e.section = e.section.replace(`${b0} × ${h0}`, `${b1} × ${h1}`);
    if (e.wood) e.wood = (e.wood * (b1 * h1)) / (b0 * h0);
  };
  const checks: BeamCheck[] = [];
  const pp = pick('Terça', [[6, 16], [8, 16], [6, 20], [8, 20], [10, 20]], purlinSpan, (load + live) * terSpacing + 0.06);
  const purlin = pp.c;
  checks.push(purlin);
  setSection('Terças', 6, 16, pp.b, pp.h);
  if (tile.family !== 'chapa') {
    const cp = pick('Caibro', [[5, 6], [5, 7], [6, 8], [6, 12]], terSpacing / Math.cos(g.angle), (load + live) * 0.5 + 0.02);
    checks.push(cp.c);
    setSection('Caibros', 5, 6, cp.b, cp.h);
  }
  if (truss) {
    const bp = pick('Banzo superior da tesoura', [[6, 16], [8, 16], [6, 20], [8, 20]], Math.min(2.5, truss.span / 4 / Math.cos(g.angle)), (load + live) * truss.spacing + 0.06);
    checks.push(bp.c);
    const te = elements.find((x) => x.name.startsWith('Tesouras') || x.name.startsWith('Meias-tesouras'));
    if (te && (bp.b !== 6 || bp.h !== 16)) {
      te.section = `banzos ${bp.b} × ${bp.h} cm`;
      if (te.wood) te.wood = (te.wood * bp.b * bp.h) / 96;
    }
  }
  for (const c of checks) {
    if (!c.ok) {
      worse(c.sigma > c.fd ? 'fail' : 'warn');
      notes.push(`${c.name} ${c.section}: tensão ${nf(c.sigma, 1)} MPa (resist. ${nf(c.fd, 1)}), flecha ${nf(c.deflection, 1)} mm (limite ${nf(c.limit, 0)}). Nenhuma seção usual atende: reduzir o vão ou usar madeira de maior classe.`);
    }
  }
  notes.push(`Inclinação ${roof.slope}% (${nf(deg, 1)}°), altura da cumeeira ${nf(g.ridgeHeight)} m.`);
  notes.push('Ação do vento (NBR 6123) e ancoragem não verificadas: confirmar no projeto do telhado.');

  return result({ checks, purlin, truss, eaveLoads, status });
}

/** Terças (paralelas à cumeeira) e pontaletes sobre a laje, para visualização da estrutura do telhado. */
export function roofTimber(b: Building): { purlins: [P3, P3][]; posts: { x: number; y: number; z0: number; z1: number }[]; members: [P3, P3][] } {
  const roof = b.roof ?? defaultRoof();
  const g = roofGeometry(b);
  const out = { purlins: [] as [P3, P3][], posts: [] as { x: number; y: number; z0: number; z1: number }[], members: [] as [P3, P3][] };
  const trussMode = (roof.support ?? 'laje') === 'tesoura';
  if (!g || roof.type === 'plano') return out;
  const i = roof.slope / 100;
  const e = g.eave;
  const w = g.walls;
  const toXY = (u: number, v: number, z: number): P3 => (g.ridgeDir === 'x' ? [u, v, z] : [v, u, z]);
  const [u0, u1, v0, v1] = g.ridgeDir === 'x' ? [e.minX, e.maxX, e.minY, e.maxY] : [e.minY, e.maxY, e.minX, e.maxX];
  const [wv0, wv1] = g.ridgeDir === 'x' ? [w.minY, w.maxY] : [w.minX, w.maxX];
  const [wu0, wu1] = g.ridgeDir === 'x' ? [w.minX, w.maxX] : [w.minY, w.maxY];
  const S = v1 - v0;
  const vm = (v0 + v1) / 2;
  const spacing = 1.5 * Math.cos(g.angle);
  const zAt = (v: number) => (roof.type === 'uma_agua' ? g.base + i * (v1 - v) : g.base + i * (S / 2 - Math.abs(v - vm))) - 0.1;
  const lines: number[] = [];
  if (roof.type === 'uma_agua') {
    for (let v = wv1 - 0.1; v > wv0; v -= spacing) lines.push(v);
    lines.push(wv0 + 0.1);
  } else {
    lines.push(vm);
    for (let d = spacing; vm - d > wv0; d += spacing) lines.push(vm - d, vm + d);
  }
  for (const v of lines) {
    const z = zAt(v);
    let a = wu0;
    let c = wu1;
    if (roof.type === 'quatro_aguas') {
      const fromEave = Math.min(v - v0, v1 - v);
      a = Math.max(wu0, u0 + fromEave);
      c = Math.min(wu1, u1 - fromEave);
      if (c - a < 0.3) continue;
    }
    out.purlins.push([toXY(a, v, z), toXY(c, v, z)]);
    for (let u = a + 0.3; u <= c - 0.3 + 1e-6; u += 2) {
      const [x, y] = toXY(u, v, 0);
      if (!trussMode) out.posts.push({ x, y, z0: g.base, z1: z - 0.08 });
    }
  }
  // tesouras: banzo inferior, banzos superiores, pendural e diagonais
  if (trussMode) {
    const along = wu1 - wu0;
    const count = Math.ceil(along / 3.0 - 1e-9) + 1;
    for (let k = 0; k < count; k++) {
      const u = wu0 + 0.1 + ((along - 0.2) * k) / (count - 1);
      const z = (v: number) => zAt(v) - 0.12;
      const A = toXY(u, wv0, g.base);
      const B = toXY(u, wv1, g.base);
      out.members.push([A, B]);
      if (roof.type === 'uma_agua') {
        const top0 = toXY(u, wv0, z(wv0));
        const top1 = toXY(u, wv1, z(wv1));
        out.members.push([top0, top1], [A, top0]);
        const mid = (wv0 + wv1) / 2;
        out.members.push([toXY(u, mid, g.base), toXY(u, mid, z(mid))], [toXY(u, mid, g.base), top0]);
      } else {
        const R = toXY(u, vm, z(vm));
        const C = toXY(u, vm, g.base);
        out.members.push([toXY(u, wv0, z(wv0) - 0.0), R], [toXY(u, wv1, z(wv1)), R], [C, R]);
        for (const side of [wv0, wv1]) {
          const q = (side + vm) / 2;
          out.members.push([C, toXY(u, q, z(q))], [toXY(u, q, g.base), toXY(u, q, z(q))]);
        }
        out.members.push([A, toXY(u, wv0, z(wv0))], [B, toXY(u, wv1, z(wv1))]);
      }
    }
  }
  return out;
}
