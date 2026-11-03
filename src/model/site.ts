/**
 * Terreno (lote): medidas, posição e frente para a rua. Mostra o lote na planta e no 3D,
 * calcula taxa de ocupação, coeficiente de aproveitamento e área permeável, e mura o terreno.
 * Recuos padrão: frontal 4,00 m e laterais 1,50 m (confira a lei de uso do solo do município).
 */
import { CATALOG_BY_ID } from '../catalog/catalog';
import { detectRooms } from '../geometry/rooms';
import type { Vec2 } from '../geometry/vec';
import { addFenceSegment, insertGate } from './fences';
import { planBounds } from './ops';
import type { Building } from './types';

export type SiteFront = 'baixo' | 'cima' | 'esquerda' | 'direita';

export interface Site {
  /** Testada (largura da frente) e profundidade, em metros. */
  w: number;
  d: number;
  /** Canto superior esquerdo do lote na planta. */
  x: number;
  y: number;
  front: SiteFront;
  show: boolean;
}

export const SITE_FRONTS: { key: SiteFront; name: string }[] = [
  { key: 'baixo', name: 'Embaixo da planta' },
  { key: 'cima', name: 'Em cima da planta' },
  { key: 'esquerda', name: 'À esquerda' },
  { key: 'direita', name: 'À direita' },
];

export const RECUO_FRONTAL = 4;
export const RECUO_LATERAL = 1.5;

const horizontal = (f: SiteFront) => f === 'baixo' || f === 'cima';

/** Tamanho do lote na planta (x, y), conforme o lado da frente. */
export const siteSize = (s: Site) => (horizontal(s.front) ? { sx: s.w, sy: s.d } : { sx: s.d, sy: s.w });

/** Cantos do lote: a frente sempre é o trecho [0]→[1]. */
export function siteCorners(s: Site): Vec2[] {
  const { sx, sy } = siteSize(s);
  const tl = { x: s.x, y: s.y };
  const tr = { x: s.x + sx, y: s.y };
  const br = { x: s.x + sx, y: s.y + sy };
  const bl = { x: s.x, y: s.y + sy };
  switch (s.front) {
    case 'baixo':
      return [bl, br, tr, tl];
    case 'cima':
      return [tr, tl, bl, br];
    case 'esquerda':
      return [tl, bl, br, tr];
    case 'direita':
      return [br, tr, tl, bl];
  }
}

/** Lote padrão (10 × 25 m) posicionado em volta do térreo com os recuos usuais. */
export function fitSite(b: Building, base?: Partial<Site>): Site {
  const s: Site = { w: 10, d: 25, x: 0, y: 0, front: 'baixo', show: true, ...b.site, ...base };
  const bb = planBounds(b.levels[0].plan);
  if (!bb) return s;
  const bw = bb.maxX - bb.minX;
  const bh = bb.maxY - bb.minY;
  const across = horizontal(s.front) ? bw : bh;
  const along = horizontal(s.front) ? bh : bw;
  s.w = Math.max(s.w, Math.ceil(across + 2 * RECUO_LATERAL));
  s.d = Math.max(s.d, Math.ceil(along + RECUO_FRONTAL + RECUO_LATERAL));
  const { sx, sy } = siteSize(s);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  if (s.front === 'baixo') {
    s.x = cx - sx / 2;
    s.y = bb.maxY + RECUO_FRONTAL - sy;
  } else if (s.front === 'cima') {
    s.x = cx - sx / 2;
    s.y = bb.minY - RECUO_FRONTAL;
  } else if (s.front === 'esquerda') {
    s.x = bb.minX - RECUO_FRONTAL;
    s.y = cy - sy / 2;
  } else {
    s.x = bb.maxX + RECUO_FRONTAL - sx;
    s.y = cy - sy / 2;
  }
  s.x = Math.round(s.x * 100) / 100;
  s.y = Math.round(s.y * 100) / 100;
  return s;
}

const shoelace = (p: Vec2[]) => Math.abs(p.reduce((a, q, i) => a + q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y, 0)) / 2;

export interface SiteStats {
  lot: number;
  ground: number;
  built: number;
  occupancy: number;
  far: number;
  permeable: number;
  permeableRate: number;
}

/** Índices urbanísticos aproximados (área construída pelo contorno dos cômodos). */
export function siteStats(b: Building): SiteStats | null {
  const s = b.site;
  if (!s) return null;
  const lot = s.w * s.d;
  const areas = b.levels.map((l) => detectRooms(l.plan).reduce((a, r) => a + shoelace(r.polygon), 0));
  const ground = areas[0] ?? 0;
  const built = areas.reduce((a, x) => a + x, 0);
  const permeable = Object.values(b.levels[0].plan.furniture)
    .filter((f) => CATALOG_BY_ID[f.catalogId]?.permeable)
    .reduce((a, f) => a + f.width * f.depth, 0);
  return { lot, ground, built, occupancy: ground / lot, far: built / lot, permeable, permeableRate: permeable / lot };
}

/**
 * Mura o terreno no térreo: muro nas divisas laterais e de fundo, mureta com gradil na frente,
 * com portão de garagem de correr e portão social.
 */
export function wallSite(b: Building, opts: { side?: string; front?: string } = {}): number {
  const s = b.site;
  if (!s) return 0;
  const plan = b.levels[0].plan;
  const [f0, f1, back1, back0] = siteCorners(s);
  const side = opts.side ?? 'muro_bloco';
  const front = opts.front ?? 'mureta_gradil';
  let n = 0;
  const add = (type: string, a: Vec2, c: Vec2) => {
    if (addFenceSegment(plan, type, a, c)) n++;
  };
  add(front, f0, f1);
  add(side, f1, back1);
  add(side, back1, back0);
  add(side, back0, f0);
  // portões na frente: garagem perto de um canto, social ao lado
  const L = s.w;
  const dir = { x: (f1.x - f0.x) / L, y: (f1.y - f0.y) / L };
  const at = (d: number) => ({ x: f0.x + dir.x * d, y: f0.y + dir.y * d });
  const rot = Math.atan2(dir.y, dir.x);
  if (L >= 5) {
    insertGate(plan, 'portao_correr_muro', at(0.3 + 1.5), rot, 3.0);
    n++;
  }
  if (L >= 7) {
    insertGate(plan, 'portao_social', at(0.3 + 3.0 + 0.6 + 0.5), rot);
    n++;
  }
  return n;
}
