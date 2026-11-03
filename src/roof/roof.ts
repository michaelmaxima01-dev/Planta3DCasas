/**
 * Telhado: geometria (planos, cumeeira, espigões, oitões), quantitativos de telhas e madeiramento
 * e verificação simplificada da terça (NBR 7190 - madeira; vento da NBR 6123 não verificado).
 *
 * O telhado cobre o retângulo envolvente do último pavimento + beiral e se apoia na laje de cobertura
 * por pontaletes (solução usual em sobrados com laje).
 */
import { computeWallGeometry } from '../geometry/walls';
import type { Building } from '../model/types';
import type { RoofKind } from '../structure/types';

export type RoofType = 'duas_aguas' | 'quatro_aguas' | 'uma_agua' | 'plano';

export interface RoofModel {
  type: RoofType;
  /** Inclinação em % (ex.: 30 = 30 cm de altura a cada 1 m). */
  slope: number;
  /** Beiral (m). */
  overhang: number;
  /** Gira a cumeeira 90° em relação ao lado maior. */
  rotate: boolean;
}

export const ROOF_TYPES: { key: RoofType; name: string }[] = [
  { key: 'duas_aguas', name: 'Duas águas' },
  { key: 'quatro_aguas', name: 'Quatro águas' },
  { key: 'uma_agua', name: 'Uma água' },
  { key: 'plano', name: 'Laje plana (sem telhado)' },
];

/** Inclinações mínimas usuais por telha (%). */
export const MIN_SLOPE: Record<RoofKind, number> = { ceramica: 30, fibrocimento: 10, metalica: 5, laje: 1 };
export const ROOF_COLOR: Record<RoofKind, string> = { ceramica: '#b4552d', fibrocimento: '#9aa1a6', metalica: '#7f8d99', laje: '#bdbdbd' };

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
}

export interface RoofResult {
  type: RoofType;
  geometry: RoofGeometry;
  elements: RoofElement[];
  /** Carga do telhado sobre a laje (kN/m² em projeção) e peso total. */
  load: number;
  weight: number;
  purlin?: { span: number; width: number; q: number; M: number; sigma: number; fd: number; deflection: number; limit: number };
  status: 'ok' | 'warn' | 'fail';
  notes: string[];
}

/** Verificação e quantitativos do telhado. `load` = peso da cobertura em kN/m² (projeção). */
export function analyzeRoof(b: Building, material: RoofKind, load: number, live: number): RoofResult | null {
  const roof = b.roof ?? defaultRoof();
  const g = roofGeometry(b);
  if (!g) return null;
  const notes: string[] = [];
  let status: RoofResult['status'] = 'ok';
  const elements: RoofElement[] = [];
  const A = g.realArea;
  const m = (v: number) => `${Math.ceil(v)} m`;
  const deg = (g.angle * 180) / Math.PI;

  if (roof.type === 'plano' || material === 'laje') {
    notes.push('Cobertura em laje: prever impermeabilização, caimento mínimo de 1% para os ralos e platibanda.');
    return { type: roof.type, geometry: g, elements, load, weight: load * g.projectedArea, status, notes };
  }

  const min = MIN_SLOPE[material];
  if (roof.slope < min) {
    status = 'fail';
    notes.push(`Inclinação de ${roof.slope}% abaixo do mínimo usual para esta telha (${min}%): risco de infiltração.`);
  }
  if (roof.overhang > 1.0) {
    status = status === 'fail' ? 'fail' : 'warn';
    notes.push('Beiral acima de 1 m: verificar a ancoragem dos caibros/terças em balanço.');
  }

  const ridgeLen = g.ridges.reduce((s, [a, c]) => s + Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), 0);
  const terSpacing = material === 'ceramica' ? 1.5 : 1.4;
  const terLen = A / terSpacing;
  if (material === 'ceramica') {
    elements.push({ name: 'Telhas cerâmicas', section: 'tipo portuguesa/romana', spacing: '≈ 16 un/m²', quantity: `${Math.ceil(A * 16 * 1.05)} un (+5%)` });
    elements.push({ name: 'Ripas', section: '2,5 × 5 cm', spacing: 'galga 0,33 m', quantity: m(A / 0.33) });
    elements.push({ name: 'Caibros', section: '5 × 6 cm', spacing: '0,50 m', quantity: m(A / 0.5) });
  } else {
    const sheet = material === 'fibrocimento' ? 2.13 : 1.0;
    elements.push({ name: material === 'fibrocimento' ? 'Telhas de fibrocimento 6 mm (2,44 × 1,10)' : 'Telhas metálicas', section: '-', spacing: '-', quantity: material === 'fibrocimento' ? `${Math.ceil((A / sheet) * 1.05)} un (+5%)` : `${Math.ceil(A * 1.05)} m²` });
  }
  elements.push({ name: 'Terças', section: '6 × 16 cm', spacing: `${terSpacing.toFixed(2).replace('.', ',')} m`, quantity: m(terLen) });
  elements.push({ name: 'Pontaletes (sobre a laje)', section: '7,5 × 7,5 cm', spacing: '2,00 m sob as terças', quantity: `${Math.ceil(terLen / 2)} un` });
  if (ridgeLen > 0) elements.push({ name: roof.type === 'quatro_aguas' ? 'Cumeeira e espigões' : 'Cumeeira', section: 'peça de cumeeira', spacing: '-', quantity: m(ridgeLen) });

  // terça biapoiada nos pontaletes (vão 2,0 m), largura de influência = espaçamento
  const span = 2.0;
  const width = terSpacing;
  const self = 0.06 * 0.16 * 6; // madeira ≈ 6 kN/m³
  const q = (load + live) * width + self; // kN/m (projeção, a favor da segurança)
  const M = (q * span * span) / 8; // kN·m
  const Wcm3 = (6 * 16 * 16) / 6;
  const sigma = ((1.4 * M * 100) / Wcm3) * 10; // MPa (ELU)
  const fd = (0.56 * 30) / 1.4; // C30 conífera: kmod 0,56, γw 1,4
  const E = 14500; // MPa
  const I = (6 * 16 ** 3) / 12; // cm⁴
  const deflection = ((5 * (q / 100) * (span * 100) ** 4) / (384 * (E / 10) * I)) * 10; // mm
  const limit = (span * 1000) / 200;
  if (sigma > fd) {
    status = 'fail';
    notes.push(`Terça 6×16: tensão ${sigma.toFixed(1)} MPa > ${fd.toFixed(1)} MPa resistente. Reduzir o vão entre pontaletes.`);
  }
  if (deflection > limit) {
    status = status === 'fail' ? 'fail' : 'warn';
    notes.push(`Flecha da terça ${deflection.toFixed(1)} mm > L/200 (${limit.toFixed(0)} mm).`);
  }
  notes.push(`Inclinação ${roof.slope}% (${deg.toFixed(1)}°), altura da cumeeira ${g.ridgeHeight.toFixed(2).replace('.', ',')} m sobre a laje.`);
  notes.push('Ação do vento (NBR 6123) e ancoragem não verificadas: confirmar no projeto do telhado.');

  return {
    type: roof.type,
    geometry: g,
    elements,
    load,
    weight: load * g.projectedArea,
    purlin: { span, width, q, M, sigma, fd, deflection, limit },
    status,
    notes,
  };
}

/** Terças (paralelas à cumeeira) e pontaletes sobre a laje, para visualização da estrutura do telhado. */
export function roofTimber(b: Building): { purlins: [P3, P3][]; posts: { x: number; y: number; z0: number; z1: number }[] } {
  const roof = b.roof ?? defaultRoof();
  const g = roofGeometry(b);
  const out = { purlins: [] as [P3, P3][], posts: [] as { x: number; y: number; z0: number; z1: number }[] };
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
      out.posts.push({ x, y, z0: g.base, z1: z - 0.08 });
    }
  }
  return out;
}
