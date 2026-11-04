/**
 * Catálogo de móveis procedurais.
 *
 * Cada item é descrito por "peças" (caixas, cilindros, esferas) em coordenadas locais:
 * x = largura (centro em 0), y = altura (chão em 0), z = profundidade (frente em +z).
 * A mesma lista de peças gera a vista 3D e o símbolo de cima na planta 2D.
 */

export type PartShape = 'box' | 'cyl' | 'sphere';
export type PartMaterial = 'matte' | 'fabric' | 'wood' | 'metal' | 'glass' | 'ceramic';

export interface Part {
  shape: PartShape;
  /** Centro da peça. */
  x: number;
  y: number;
  z: number;
  /** Tamanho total em cada eixo (diâmetro para cilindro/esfera). */
  sx: number;
  sy: number;
  sz: number;
  color: string;
  material?: PartMaterial;
  /** Rotação da peça em torno do eixo vertical (rad, mesmo sentido da rotação na planta). */
  ry?: number;
}

export interface CatalogLight {
  y: number;
  color: string;
  intensity: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  width: number;
  depth: number;
  height: number;
  elevation?: number;
  light?: CatalogLight;
  /** Escada: abre vão no piso do andar de cima. */
  stair?: boolean;
  /** Trecho de muro/cerca (desenhado em trechos; largura = comprimento). */
  fence?: boolean;
  /** Tipo para o quantitativo de muros e cercas. */
  fenceQty?: FenceQty;
  /** Portão: ao ser colocado sobre um muro, abre o vão no trecho. */
  gate?: boolean;
  /** Superfície permeável (gramado, canteiros) para a taxa de permeabilidade. */
  permeable?: boolean;
  /** Dimensões (largura, profundidade) para uma altura piso a piso. */
  footprint?: (h: number) => { width: number; depth: number };
  parts: (w: number, d: number, h: number) => Part[];
}

/** Caixa: (x, z) centro na planta, (sx, sz) tamanho, y0 base, sy altura. */
const B = (x: number, z: number, sx: number, sz: number, y0: number, sy: number, color: string, material?: PartMaterial): Part => ({
  shape: 'box', x, y: y0 + sy / 2, z, sx, sy, sz, color, material,
});
const C = (x: number, z: number, sx: number, sz: number, y0: number, sy: number, color: string, material?: PartMaterial): Part => ({
  shape: 'cyl', x, y: y0 + sy / 2, z, sx, sy, sz, color, material,
});
const S = (x: number, z: number, sx: number, sz: number, y0: number, sy: number, color: string, material?: PartMaterial): Part => ({
  shape: 'sphere', x, y: y0 + sy / 2, z, sx, sy, sz, color, material,
});

const WOOD = '#a0784f';
const STEP_A = '#d4c2a8';
const STEP_B = '#c9b59a';
/** Degraus pela fórmula de Blondel (espelho ≤ 18,5 cm, 2e + p ≈ 64 cm). */
const steps = (h: number) => {
  const n = Math.max(2, Math.ceil(h / 0.185));
  const rise = h / n;
  return { n, rise, tread: Math.max(0.25, Math.min(0.3, 0.64 - 2 * rise)) };
};
const rail = (x: number, d: number, h: number): Part[] => [
  { shape: 'box', x, y: h * 0.5 + 0.45, z: 0, sx: 0.04, sy: 0.04, sz: Math.hypot(d, h) * 0.98, color: '#5b5f63', material: 'metal' },
];
const WOOD_DARK = '#6e4f33';
const WOOD_LIGHT = '#c9a77c';
const WHITE = '#f3f1ec';
const BLACK = '#1d1f21';
const STEEL = '#b9c0c7';
const GLASS = '#bfe3f5';

function legs(w: number, d: number, inset: number, size: number, height: number, color: string, material: PartMaterial = 'wood'): Part[] {
  const x = w / 2 - inset;
  const z = d / 2 - inset;
  return [
    B(-x, -z, size, size, 0, height, color, material),
    B(x, -z, size, size, 0, height, color, material),
    B(-x, z, size, size, 0, height, color, material),
    B(x, z, size, size, 0, height, color, material),
  ];
}

function sofa(w: number, d: number, h: number, seats: number, fabric: string): Part[] {
  const arm = Math.min(0.2, w * 0.12);
  const backD = Math.min(0.22, d * 0.25);
  const inner = w - 2 * arm;
  const n = Math.max(1, seats);
  const cushion = inner / n;
  const parts: Part[] = [
    ...legs(w, d, 0.06, 0.05, 0.1, WOOD_DARK),
    B(0, 0, w, d, 0.1, 0.3, fabric, 'fabric'),
    B(0, -d / 2 + backD / 2, w, backD, 0.4, h - 0.4, fabric, 'fabric'),
    B(-(w / 2 - arm / 2), 0, arm, d, 0.4, 0.22, fabric, 'fabric'),
    B(w / 2 - arm / 2, 0, arm, d, 0.4, 0.22, fabric, 'fabric'),
  ];
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + cushion * (i + 0.5);
    parts.push(B(x, backD / 2, cushion - 0.02, d - backD - 0.02, 0.4, 0.12, shade(fabric, 12), 'fabric'));
  }
  return parts;
}

function bed(w: number, d: number, h: number, pillows: number): Part[] {
  const parts: Part[] = [
    B(0, 0, w, d, 0.05, 0.25, WOOD, 'wood'),
    ...legs(w, d, 0.05, 0.06, 0.05, WOOD_DARK),
    B(0, 0.03, w - 0.04, d - 0.1, 0.3, 0.22, '#f4f1ea', 'fabric'),
    B(0, -d / 2 + 0.03, w, 0.06, 0.05, h - 0.05, WOOD_DARK, 'wood'),
    B(0, d * 0.14, w - 0.02, d * 0.6, 0.52, 0.03, '#7f98b2', 'fabric'),
  ];
  const pw = (w - 0.1) / pillows;
  for (let i = 0; i < pillows; i++) {
    parts.push(B(-w / 2 + 0.05 + pw * (i + 0.5), -d / 2 + 0.28, pw - 0.06, 0.34, 0.52, 0.1, '#ffffff', 'fabric'));
  }
  return parts;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amount));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export const CATALOG: CatalogItem[] = [
  // ---------- Sala ----------
  {
    id: 'sofa3', name: 'Sofá 3 lugares', category: 'Sala', width: 2.1, depth: 0.9, height: 0.85,
    parts: (w, d, h) => sofa(w, d, h, 3, '#6f7f91'),
  },
  {
    id: 'sofa2', name: 'Sofá 2 lugares', category: 'Sala', width: 1.6, depth: 0.88, height: 0.85,
    parts: (w, d, h) => sofa(w, d, h, 2, '#8a7464'),
  },
  {
    id: 'armchair', name: 'Poltrona', category: 'Sala', width: 0.85, depth: 0.85, height: 0.85,
    parts: (w, d, h) => sofa(w, d, h, 1, '#b07d52'),
  },
  {
    id: 'coffee_table', name: 'Mesa de centro', category: 'Sala', width: 1.0, depth: 0.55, height: 0.42,
    parts: (w, d, h) => [
      B(0, 0, w, d, h - 0.04, 0.04, WOOD_LIGHT, 'wood'),
      B(0, 0, w - 0.1, d - 0.1, 0.12, 0.02, WOOD_LIGHT, 'wood'),
      ...legs(w, d, 0.04, 0.04, h - 0.04, WOOD_DARK),
    ],
  },
  {
    id: 'tv_rack', name: 'Rack com TV', category: 'Sala', width: 1.8, depth: 0.45, height: 0.5,
    parts: (w, d, h) => {
      const tvW = Math.min(1.45, w * 0.85);
      return [
        B(0, 0, w, d, 0.08, h - 0.08, '#e8e2d8', 'wood'),
        ...legs(w, d, 0.05, 0.04, 0.08, BLACK, 'metal'),
        B(-w / 4, d / 2 + 0.003, w / 2 - 0.03, 0.006, 0.12, h - 0.16, '#d9d1c4'),
        B(w / 4, d / 2 + 0.003, w / 2 - 0.03, 0.006, 0.12, h - 0.16, '#d9d1c4'),
        B(0, -d / 2 + 0.12, 0.3, 0.16, h, 0.03, BLACK, 'metal'),
        B(0, -d / 2 + 0.12, 0.06, 0.04, h, 0.12, BLACK, 'metal'),
        B(0, -d / 2 + 0.12, tvW, 0.04, h + 0.1, tvW * 0.56, BLACK, 'glass'),
      ];
    },
  },
  {
    id: 'bookshelf', name: 'Estante', category: 'Sala', width: 1.0, depth: 0.35, height: 1.9,
    parts: (w, d, h) => {
      const parts: Part[] = [
        B(-w / 2 + 0.015, 0, 0.03, d, 0, h, WOOD, 'wood'),
        B(w / 2 - 0.015, 0, 0.03, d, 0, h, WOOD, 'wood'),
        B(0, -d / 2 + 0.01, w, 0.02, 0, h, WOOD_DARK, 'wood'),
      ];
      const shelves = 5;
      for (let i = 0; i <= shelves; i++) {
        const y = (i * (h - 0.03)) / shelves;
        parts.push(B(0, 0, w - 0.06, d, y, 0.03, WOOD, 'wood'));
        if (i < shelves) {
          const books = ['#a33b3b', '#2f5d8a', '#d7a531', '#3c7a4b', '#6b4a8a'];
          parts.push(B(-w / 4, 0.02, w / 2.6, d * 0.7, y + 0.03, (h / shelves) * 0.7, books[i % books.length]));
        }
      }
      return parts;
    },
  },
  {
    id: 'rug', name: 'Tapete', category: 'Decoração', width: 2.0, depth: 1.4, height: 0.012,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#c7b393', 'fabric'), B(0, 0, w - 0.2, d - 0.2, 0.0005, h, '#b39a76', 'fabric')],
  },
  {
    id: 'plant', name: 'Planta', category: 'Decoração', width: 0.5, depth: 0.5, height: 1.2,
    parts: (w, d, h) => [
      C(0, 0, w * 0.6, d * 0.6, 0, 0.35, '#b5653a', 'ceramic'),
      S(0, 0, w, d, 0.35, (h - 0.35) * 0.75, '#4f7f3a', 'matte'),
      S(0.05, -0.04, w * 0.7, d * 0.7, 0.35 + (h - 0.35) * 0.45, (h - 0.35) * 0.55, '#5f9446', 'matte'),
    ],
  },
  {
    id: 'floor_lamp', name: 'Luminária de piso', category: 'Iluminação', width: 0.4, depth: 0.4, height: 1.65,
    light: { y: 1.45, color: '#ffd59a', intensity: 4 },
    parts: (w, d, h) => [
      C(0, 0, w * 0.75, d * 0.75, 0, 0.03, BLACK, 'metal'),
      C(0, 0, 0.03, 0.03, 0.03, h - 0.28, BLACK, 'metal'),
      C(0, 0, w, d, h - 0.25, 0.25, '#f3e7d0', 'fabric'),
    ],
  },
  {
    id: 'ceiling_light', name: 'Pendente', category: 'Iluminação', width: 0.45, depth: 0.45, height: 0.3, elevation: 2.2,
    light: { y: 0.05, color: '#ffe2b0', intensity: 6 },
    parts: (w, d, h) => [
      C(0, 0, 0.012, 0.012, h * 0.4, 0.6, BLACK, 'metal'),
      C(0, 0, w, d, 0, h * 0.4, '#2a2d30', 'metal'),
      S(0, 0, 0.12, 0.12, -0.03, 0.12, '#fff6df', 'glass'),
    ],
  },
  // ---------- Escadas ----------
  {
    id: 'stair', name: 'Escada reta', category: 'Escadas', width: 0.9, depth: 4.34, height: 2.95, stair: true,
    footprint: (h) => ({ width: 0.9, depth: steps(h).n * steps(h).tread }),
    parts: (w, d, h) => {
      const { n, rise } = steps(h);
      const tread = d / n;
      const parts: Part[] = [];
      for (let i = 0; i < n; i++) parts.push(B(0, d / 2 - (i + 0.5) * tread, w, tread, 0, (i + 1) * rise, i % 2 ? STEP_B : STEP_A, 'wood'));
      parts.push(...rail(w / 2 - 0.02, d, h));
      return parts;
    },
  },
  {
    id: 'stair_l', name: 'Escada em L (com patamar)', category: 'Escadas', width: 2.6, depth: 2.95, height: 2.95, stair: true,
    footprint: (h) => {
      const { n, tread } = steps(h);
      const n1 = Math.ceil(n / 2);
      return { width: 0.9 + (n - n1) * tread, depth: 0.9 + (n1 - 1) * tread };
    },
    parts: (w, d, h) => {
      // lance 1 sobe da frente (+z) para o fundo na coluna esquerda; patamar no canto; lance 2 vai para a direita
      const { n, rise } = steps(h);
      const n1 = Math.ceil(n / 2);
      const n2 = n - n1;
      const t1 = (d - 0.9) / Math.max(1, n1 - 1);
      const t2 = (w - 0.9) / Math.max(1, n2);
      const x0 = -w / 2 + 0.45;
      const parts: Part[] = [];
      for (let i = 0; i < n1 - 1; i++) parts.push(B(x0, d / 2 - (i + 0.5) * t1, 0.9, t1, 0, (i + 1) * rise, i % 2 ? STEP_B : STEP_A, 'wood'));
      parts.push(B(x0, -d / 2 + 0.45, 0.9, 0.9, 0, n1 * rise, '#bfa98b', 'wood'));
      for (let j = 0; j < n2; j++) parts.push(B(-w / 2 + 0.9 + (j + 0.5) * t2, -d / 2 + 0.45, t2, 0.9, 0, (n1 + j + 1) * rise, j % 2 ? STEP_B : STEP_A, 'wood'));
      return parts;
    },
  },
  {
    id: 'stair_u', name: 'Escada em U (dois lances)', category: 'Escadas', width: 1.9, depth: 2.95, height: 2.95, stair: true,
    footprint: (h) => {
      const { n, tread } = steps(h);
      return { width: 1.9, depth: 0.95 + Math.ceil(n / 2) * tread };
    },
    parts: (w, d, h) => {
      // lance 1 sobe pela esquerda até o patamar no fundo; lance 2 volta pela direita
      const { n, rise } = steps(h);
      const n1 = Math.ceil(n / 2);
      const n2 = n - n1;
      const run = d - 0.95;
      const t1 = run / Math.max(1, n1 - 1);
      const t2 = run / Math.max(1, n2);
      const cw = (w - 0.1) / 2;
      const parts: Part[] = [];
      for (let i = 0; i < n1 - 1; i++) parts.push(B(-w / 2 + cw / 2, d / 2 - (i + 0.5) * t1, cw, t1, 0, (i + 1) * rise, i % 2 ? STEP_B : STEP_A, 'wood'));
      parts.push(B(0, -d / 2 + 0.475, w, 0.95, 0, n1 * rise, '#bfa98b', 'wood'));
      for (let j = 0; j < n2; j++) parts.push(B(w / 2 - cw / 2, -d / 2 + 0.95 + (j + 0.5) * t2, cw, t2, 0, (n1 + j + 1) * rise, j % 2 ? STEP_B : STEP_A, 'wood'));
      parts.push(B(0, 0.475, 0.06, run, h * 0.5, 0.9, '#5b5f63', 'metal'));
      return parts;
    },
  },
  {
    id: 'stair_spiral', name: 'Escada caracol', category: 'Escadas', width: 1.6, depth: 1.6, height: 2.95, stair: true,
    footprint: () => ({ width: 1.6, depth: 1.6 }),
    parts: (w, d, h) => {
      const n = Math.max(8, Math.ceil(h / 0.2));
      const rise = h / n;
      const r = Math.min(w, d) / 2;
      const step = (2 * Math.PI * 0.8) / n; // ~290° de giro
      const parts: Part[] = [C(0, 0, 0.12, 0.12, 0, h + 0.9, '#5b5f63', 'metal')];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + i * step;
        parts.push({ shape: 'box', x: Math.cos(a) * r * 0.5, y: (i + 1) * rise - 0.02, z: Math.sin(a) * r * 0.5, sx: r * 0.95, sy: 0.04, sz: 0.32, color: i % 2 ? STEP_B : STEP_A, material: 'wood', ry: a });
      }
      return parts;
    },
  },
  // ---------- Jantar / Cozinha ----------
  {
    id: 'dining_table', name: 'Mesa de jantar', category: 'Cozinha', width: 1.6, depth: 0.9, height: 0.76,
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.04, 0.04, WOOD, 'wood'), ...legs(w, d, 0.06, 0.06, h - 0.04, WOOD_DARK)],
  },
  {
    id: 'chair', name: 'Cadeira', category: 'Cozinha', width: 0.45, depth: 0.5, height: 0.9,
    parts: (w, d, h) => [
      ...legs(w, d, 0.03, 0.035, 0.43, WOOD_DARK),
      B(0, 0.01, w, d - 0.02, 0.43, 0.05, WOOD, 'wood'),
      B(-w / 2 + 0.03, -d / 2 + 0.02, 0.035, 0.035, 0.48, h - 0.48, WOOD_DARK, 'wood'),
      B(w / 2 - 0.03, -d / 2 + 0.02, 0.035, 0.035, 0.48, h - 0.48, WOOD_DARK, 'wood'),
      B(0, -d / 2 + 0.02, w, 0.03, h - 0.22, 0.2, WOOD, 'wood'),
    ],
  },
  {
    id: 'kitchen_counter', name: 'Bancada com pia', category: 'Cozinha', width: 2.4, depth: 0.6, height: 0.9,
    parts: (w, d, h) => {
      const parts: Part[] = [
        B(0, -0.03, w, d - 0.06, 0, 0.1, '#4a4d50'),
        B(0, -0.01, w, d - 0.04, 0.1, h - 0.14, '#efe9df', 'wood'),
        B(0, 0, w, d, h - 0.04, 0.04, '#33363a', 'ceramic'),
        B(w * 0.15, 0.02, 0.6, 0.42, h, 0.006, STEEL, 'metal'),
        C(w * 0.15, -d / 2 + 0.07, 0.03, 0.03, h, 0.28, STEEL, 'metal'),
        B(w * 0.15, -d / 2 + 0.15, 0.025, 0.18, h + 0.25, 0.025, STEEL, 'metal'),
      ];
      const doors = Math.max(1, Math.round(w / 0.6));
      for (let i = 1; i < doors; i++) {
        parts.push(B(-w / 2 + (w / doors) * i, d / 2 - 0.035, 0.006, 0.006, 0.12, h - 0.2, '#b9b2a6'));
      }
      return parts;
    },
  },
  {
    id: 'fridge', name: 'Geladeira', category: 'Cozinha', width: 0.7, depth: 0.7, height: 1.85,
    parts: (w, d, h) => [
      B(0, 0, w, d, 0.02, h - 0.02, '#dfe3e6', 'metal'),
      B(0, d / 2 + 0.003, w - 0.02, 0.006, h * 0.62, 0.01, '#8d949a'),
      B(w / 2 - 0.07, d / 2 + 0.025, 0.025, 0.03, h * 0.68, 0.35, STEEL, 'metal'),
      B(w / 2 - 0.07, d / 2 + 0.025, 0.025, 0.03, h * 0.3, 0.35, STEEL, 'metal'),
    ],
  },
  {
    id: 'stove', name: 'Fogão 4 bocas', category: 'Cozinha', width: 0.6, depth: 0.6, height: 0.9,
    parts: (w, d, h) => [
      B(0, 0, w, d, 0, h - 0.03, '#e6e6e6', 'metal'),
      B(0, 0, w, d, h - 0.03, 0.03, BLACK, 'glass'),
      C(-w / 4.5, -d / 4.5, 0.13, 0.13, h, 0.02, '#4d4d4d', 'metal'),
      C(w / 4.5, -d / 4.5, 0.11, 0.11, h, 0.02, '#4d4d4d', 'metal'),
      C(-w / 4.5, d / 4.5, 0.11, 0.11, h, 0.02, '#4d4d4d', 'metal'),
      C(w / 4.5, d / 4.5, 0.13, 0.13, h, 0.02, '#4d4d4d', 'metal'),
      B(0, d / 2 + 0.004, w - 0.12, 0.008, 0.2, 0.38, '#222', 'glass'),
      B(0, d / 2 + 0.03, w - 0.16, 0.02, 0.63, 0.02, STEEL, 'metal'),
    ],
  },
  // ---------- Quarto ----------
  {
    id: 'double_bed', name: 'Cama de casal', category: 'Quarto', width: 1.6, depth: 2.05, height: 1.05,
    parts: (w, d, h) => bed(w, d, h, 2),
  },
  {
    id: 'single_bed', name: 'Cama de solteiro', category: 'Quarto', width: 0.95, depth: 1.95, height: 0.9,
    parts: (w, d, h) => bed(w, d, h, 1),
  },
  {
    id: 'nightstand', name: 'Criado-mudo com abajur', category: 'Quarto', width: 0.45, depth: 0.4, height: 0.5,
    light: { y: 0.75, color: '#ffd08a', intensity: 1.5 },
    parts: (w, d, h) => [
      B(0, 0, w, d, 0.06, h - 0.06, WOOD_LIGHT, 'wood'),
      ...legs(w, d, 0.03, 0.03, 0.06, WOOD_DARK),
      B(0, d / 2 + 0.003, w - 0.04, 0.006, h * 0.55, 0.006, WOOD_DARK),
      C(0, -0.03, 0.12, 0.12, h, 0.02, '#cfc6b8', 'ceramic'),
      C(0, -0.03, 0.02, 0.02, h + 0.02, 0.18, '#cfc6b8', 'ceramic'),
      C(0, -0.03, 0.24, 0.24, h + 0.17, 0.16, '#f6ecd9', 'fabric'),
    ],
  },
  {
    id: 'wardrobe', name: 'Guarda-roupa', category: 'Quarto', width: 1.8, depth: 0.6, height: 2.2,
    parts: (w, d, h) => {
      const parts: Part[] = [B(0, 0, w, d, 0, h, '#ddd4c6', 'wood'), B(0, -0.01, w - 0.02, d - 0.04, 0, 0.08, '#b8ad9c')];
      const doors = Math.max(2, Math.round(w / 0.6));
      for (let i = 1; i < doors; i++) {
        const x = -w / 2 + (w / doors) * i;
        parts.push(B(x, d / 2 + 0.002, 0.006, 0.004, 0.1, h - 0.15, '#9d927f'));
      }
      for (let i = 0; i < doors; i++) {
        const x = -w / 2 + (w / doors) * (i + (i % 2 === 0 ? 0.88 : 0.12));
        parts.push(B(x, d / 2 + 0.02, 0.02, 0.025, h * 0.42, 0.3, STEEL, 'metal'));
      }
      return parts;
    },
  },
  {
    id: 'desk', name: 'Escrivaninha', category: 'Escritório', width: 1.2, depth: 0.6, height: 0.75,
    parts: (w, d, h) => [
      B(0, 0, w, d, h - 0.03, 0.03, WOOD_LIGHT, 'wood'),
      B(-w / 2 + 0.2, 0, 0.4, d - 0.02, 0, h - 0.03, '#e9e3d8', 'wood'),
      B(w / 2 - 0.02, 0, 0.03, d - 0.02, 0, h - 0.03, '#e9e3d8', 'wood'),
      B(0, -d / 2 + 0.12, 0.22, 0.16, h, 0.015, BLACK, 'metal'),
      B(0, -d / 2 + 0.1, 0.04, 0.03, h, 0.14, BLACK, 'metal'),
      B(0, -d / 2 + 0.12, 0.58, 0.03, h + 0.12, 0.34, BLACK, 'glass'),
      B(0.05, 0.08, 0.42, 0.14, h, 0.015, '#3a3d40'),
    ],
  },
  {
    id: 'office_chair', name: 'Cadeira de escritório', category: 'Escritório', width: 0.6, depth: 0.6, height: 1.05,
    parts: (w, d, h) => [
      C(0, 0, w, d, 0.04, 0.03, BLACK, 'metal'),
      C(0, 0, 0.05, 0.05, 0.07, 0.38, '#555', 'metal'),
      B(0, 0.02, w * 0.8, d * 0.8, 0.45, 0.08, '#2e3a48', 'fabric'),
      B(0, -d * 0.36, w * 0.75, 0.06, 0.55, h - 0.55, '#2e3a48', 'fabric'),
    ],
  },
  // ---------- Banheiro ----------
  {
    id: 'toilet', name: 'Vaso sanitário', category: 'Banheiro', width: 0.4, depth: 0.68, height: 0.78,
    parts: (w, d, h) => [
      B(0, -d / 2 + 0.09, w * 0.95, 0.18, 0.4, h - 0.4, WHITE, 'ceramic'),
      C(0, 0.07, w * 0.9, d * 0.68, 0, 0.4, WHITE, 'ceramic'),
      C(0, 0.07, w, d * 0.72, 0.4, 0.03, '#ffffff', 'ceramic'),
    ],
  },
  {
    id: 'bath_sink', name: 'Gabinete com cuba', category: 'Banheiro', width: 0.7, depth: 0.45, height: 0.85,
    parts: (w, d, h) => [
      B(0, 0, w, d, 0.15, h - 0.2, '#c9b08f', 'wood'),
      B(0, 0, w, d, h - 0.05, 0.05, WHITE, 'ceramic'),
      C(0, 0.03, 0.42, 0.32, h, 0.12, '#ffffff', 'ceramic'),
      C(0, -d / 2 + 0.06, 0.03, 0.03, h, 0.22, STEEL, 'metal'),
      B(0, -d / 2 + 0.01, w * 0.9, 0.02, 1.15, 0.75, GLASS, 'glass'),
    ],
  },
  {
    id: 'shower', name: 'Box de chuveiro', category: 'Banheiro', width: 0.9, depth: 0.9, height: 2.0,
    parts: (w, d, h) => [
      B(0, 0, w, d, 0, 0.05, '#eeeeee', 'ceramic'),
      B(0, d / 2 - 0.01, w, 0.012, 0.05, h - 0.05, GLASS, 'glass'),
      B(w / 2 - 0.01, 0, 0.012, d, 0.05, h - 0.05, GLASS, 'glass'),
      C(-w / 2 + 0.05, -d / 2 + 0.05, 0.025, 0.025, 1.0, h - 0.95, STEEL, 'metal'),
      C(-w / 2 + 0.22, -d / 2 + 0.22, 0.22, 0.22, h - 0.1, 0.02, STEEL, 'metal'),
    ],
  },
  {
    id: 'bathtub', name: 'Banheira', category: 'Banheiro', width: 1.7, depth: 0.75, height: 0.55,
    parts: (w, d, h) => [
      B(0, 0, w, d, 0, h, WHITE, 'ceramic'),
      B(0, 0, w - 0.12, d - 0.12, h - 0.12, 0.11, '#a9d6ee', 'glass'),
      C(-w / 2 + 0.08, 0, 0.03, 0.03, h, 0.15, STEEL, 'metal'),
    ],
  },
];


/** Itens adicionais (sala, quarto, cozinha, lavanderia, área externa, garagem, escritório). */
CATALOG.push(
  // ---------- Sala ----------
  {
    id: 'sideboard', name: 'Aparador', category: 'Sala', width: 1.4, depth: 0.4, height: 0.8,
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.03, 0.03, WOOD, 'wood'), B(0, 0, w - 0.04, d - 0.04, 0.12, h - 0.15, WOOD_LIGHT, 'wood'), ...legs(w, d, 0.04, 0.04, 0.12, WOOD_DARK)],
  },
  {
    id: 'side_table', name: 'Mesa lateral', category: 'Sala', width: 0.45, depth: 0.45, height: 0.55,
    parts: (w, d, h) => [C(0, 0, w, d, h - 0.03, 0.03, WOOD, 'wood'), C(0, 0, 0.05, 0.05, 0, h - 0.03, BLACK, 'metal'), C(0, 0, w * 0.6, d * 0.6, 0, 0.02, BLACK, 'metal')],
  },
  {
    id: 'pouf', name: 'Puff', category: 'Sala', width: 0.5, depth: 0.5, height: 0.42,
    parts: (w, d, h) => [C(0, 0, w, d, 0, h, '#c48a5a', 'fabric')],
  },
  {
    id: 'tv_wall', name: 'TV de parede', category: 'Sala', width: 1.45, depth: 0.08, height: 0.83, elevation: 1.0,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, BLACK, 'glass')],
  },
  {
    id: 'piano', name: 'Piano vertical', category: 'Sala', width: 1.5, depth: 0.6, height: 1.25,
    parts: (w, d, h) => [B(0, -0.05, w, d - 0.1, 0, h, '#1b1b1b', 'wood'), B(0, d / 2 - 0.12, w - 0.1, 0.24, 0.7, 0.05, '#f5f5f5', 'ceramic')],
  },
  // ---------- Quarto ----------
  {
    id: 'king_bed', name: 'Cama king', category: 'Quarto', width: 1.93, depth: 2.03, height: 1.1,
    parts: (w, d, h) => bed(w, d, h, 2),
  },
  {
    id: 'bunk_bed', name: 'Beliche', category: 'Quarto', width: 0.95, depth: 1.95, height: 1.65,
    parts: (w, d, h) => [
      ...legs(w, d, 0.03, 0.06, h, WOOD_DARK),
      B(0, 0, w, d, 0.25, 0.06, WOOD, 'wood'),
      B(0, 0, w - 0.06, d - 0.06, 0.31, 0.15, '#f4f1ea', 'fabric'),
      B(0, 0, w, d, 1.15, 0.06, WOOD, 'wood'),
      B(0, 0, w - 0.06, d - 0.06, 1.21, 0.15, '#7f98b2', 'fabric'),
      B(w / 2 - 0.02, d / 2 - 0.25, 0.03, 0.4, 0.3, 1.3, WOOD_DARK, 'wood'),
    ],
  },
  {
    id: 'crib', name: 'Berço', category: 'Quarto', width: 0.7, depth: 1.3, height: 0.95,
    parts: (w, d, h) => [...legs(w, d, 0.03, 0.05, h, WHITE, 'wood'), B(0, 0, w - 0.04, d - 0.04, 0.35, 0.12, '#fdf6e3', 'fabric'), B(-w / 2 + 0.01, 0, 0.02, d, 0.47, h - 0.47, '#ffffff', 'wood'), B(w / 2 - 0.01, 0, 0.02, d, 0.47, h - 0.47, '#ffffff', 'wood')],
  },
  {
    id: 'dresser', name: 'Cômoda', category: 'Quarto', width: 1.0, depth: 0.45, height: 0.85,
    parts: (w, d, h) => {
      const p: Part[] = [B(0, 0, w, d, 0.06, h - 0.06, WOOD_LIGHT, 'wood'), ...legs(w, d, 0.03, 0.04, 0.06, WOOD_DARK)];
      for (let i = 1; i < 4; i++) p.push(B(0, d / 2 + 0.003, w - 0.04, 0.006, 0.06 + (i * (h - 0.06)) / 4, 0.006, WOOD_DARK));
      return p;
    },
  },
  {
    id: 'vanity', name: 'Penteadeira', category: 'Quarto', width: 1.0, depth: 0.45, height: 0.78,
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.03, 0.03, WHITE, 'wood'), ...legs(w, d, 0.03, 0.04, h - 0.03, WHITE), B(0, -d / 2 + 0.02, w * 0.6, 0.02, h + 0.05, 0.7, '#cfe3ee', 'glass')],
  },
  // ---------- Cozinha ----------
  {
    id: 'wall_cabinet', name: 'Armário aéreo', category: 'Cozinha', width: 1.2, depth: 0.35, height: 0.7, elevation: 1.5,
    parts: (w, d, h) => {
      const p: Part[] = [B(0, 0, w, d, 0, h, '#efe9df', 'wood')];
      const n = Math.max(1, Math.round(w / 0.4));
      for (let i = 1; i < n; i++) p.push(B(-w / 2 + (w / n) * i, d / 2 + 0.002, 0.006, 0.004, 0.02, h - 0.04, '#b9b2a6'));
      return p;
    },
  },
  {
    id: 'kitchen_island', name: 'Ilha com cooktop', category: 'Cozinha', width: 1.8, depth: 0.9, height: 0.9,
    parts: (w, d, h) => [
      B(0, 0, w - 0.1, d - 0.1, 0, h - 0.04, '#efe9df', 'wood'),
      B(0, 0, w, d, h - 0.04, 0.04, '#33363a', 'ceramic'),
      B(-w / 4, 0, 0.6, 0.5, h, 0.006, BLACK, 'glass'),
      C(-w / 4 - 0.13, -0.11, 0.16, 0.16, h + 0.006, 0.004, '#555', 'metal'),
      C(-w / 4 + 0.13, 0.11, 0.16, 0.16, h + 0.006, 0.004, '#555', 'metal'),
    ],
  },
  {
    id: 'range_hood', name: 'Coifa', category: 'Cozinha', width: 0.9, depth: 0.5, height: 0.9, elevation: 1.7,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.12, STEEL, 'metal'), B(0, -d / 2 + 0.15, 0.3, 0.25, 0.12, h - 0.12, STEEL, 'metal')],
  },
  {
    id: 'dishwasher', name: 'Lava-louças', category: 'Cozinha', width: 0.6, depth: 0.6, height: 0.85,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#d9dde1', 'metal'), B(0, d / 2 + 0.01, w - 0.1, 0.02, h - 0.12, 0.03, STEEL, 'metal')],
  },
  // ---------- Lavanderia ----------
  {
    id: 'washing_machine', name: 'Máquina de lavar', category: 'Lavanderia', width: 0.6, depth: 0.65, height: 0.9,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#f2f3f4', 'metal'), C(0, d / 2 + 0.01, 0.4, 0.02, h * 0.45, 0.4, '#9fb3c8', 'glass'), B(0, -d / 2 + 0.06, w, 0.12, h, 0.0, '#ddd')],
  },
  {
    id: 'dryer', name: 'Secadora', category: 'Lavanderia', width: 0.6, depth: 0.6, height: 0.85,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#ececec', 'metal'), C(0, d / 2 + 0.01, 0.38, 0.02, h * 0.45, 0.38, '#bbb', 'glass')],
  },
  {
    id: 'laundry_sink', name: 'Tanque', category: 'Lavanderia', width: 0.6, depth: 0.55, height: 0.9,
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.3, 0.3, '#f5f5f5', 'ceramic'), B(0, 0.03, w - 0.1, d - 0.16, h - 0.05, 0.05, '#dfe7ec', 'ceramic'), C(0, 0, 0.12, 0.12, 0, h - 0.3, '#f5f5f5', 'ceramic'), C(0, -d / 2 + 0.06, 0.03, 0.03, h, 0.22, STEEL, 'metal')],
  },
  {
    id: 'clothesline', name: 'Varal de chão', category: 'Lavanderia', width: 1.5, depth: 0.6, height: 1.0,
    parts: (w, d, h) => [...legs(w, d, 0.02, 0.025, h, '#9aa0a6', 'metal'), ...[-0.2, -0.07, 0.07, 0.2].map((z) => B(0, z, w, 0.01, h - 0.02, 0.01, '#c0c4c8', 'metal'))],
  },
  // ---------- Área externa e garagem ----------
  {
    id: 'pool', name: 'Piscina', category: 'Área externa', width: 6, depth: 3, height: 0.2,
    parts: (w, d, h) => [B(0, 0, w + 0.3, d + 0.3, 0, h * 0.5, '#d9d2c3', 'ceramic'), B(0, 0, w, d, h * 0.5, 0.02, '#4fb3d9', 'glass')],
  },
  {
    id: 'lounger', name: 'Espreguiçadeira', category: 'Área externa', width: 0.65, depth: 1.9, height: 0.85,
    parts: (w, d, h) => [...legs(w, d, 0.04, 0.04, 0.3, '#e9e4dc'), B(0, 0.25, w, d - 0.5, 0.3, 0.08, '#f4f1ea', 'fabric'), B(0, -d / 2 + 0.25, w, 0.5, 0.3, h - 0.3, '#f4f1ea', 'fabric')],
  },
  {
    id: 'patio_set', name: 'Mesa externa com ombrelone', category: 'Área externa', width: 1.2, depth: 1.2, height: 2.3,
    parts: (w, d, h) => [C(0, 0, w * 0.8, d * 0.8, 0.72, 0.03, '#e9e4dc', 'wood'), C(0, 0, 0.04, 0.04, 0, h - 0.3, '#888', 'metal'), C(0, 0, w * 2, d * 2, h - 0.3, 0.25, '#e8dcc0', 'fabric')],
  },
  {
    id: 'bbq', name: 'Churrasqueira', category: 'Área externa', width: 1.2, depth: 0.7, height: 2.2,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.9, '#b5653a', 'ceramic'), B(0, 0, w, d, 0.9, 0.04, '#3b3b3b', 'ceramic'), B(0, -0.1, w * 0.8, d * 0.6, 0.94, 0.6, '#2b2b2b', 'metal'), B(0, -0.05, w * 0.5, d * 0.5, 1.54, h - 1.54, '#b5653a', 'ceramic')],
  },
  {
    id: 'tree', name: 'Árvore', category: 'Área externa', width: 3, depth: 3, height: 5,
    parts: (w, d, h) => [C(0, 0, 0.3, 0.3, 0, h * 0.45, '#6e4f33', 'wood'), S(0, 0, w, d, h * 0.35, h * 0.65, '#4f7f3a', 'matte'), S(0.4, 0.3, w * 0.6, d * 0.6, h * 0.55, h * 0.45, '#5f9446', 'matte')],
  },
  {
    id: 'shrub', name: 'Arbusto / canteiro', category: 'Área externa', width: 1.2, depth: 0.6, height: 0.8,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.3, '#9c7a5b', 'ceramic'), S(-w / 4, 0, w * 0.55, d * 0.9, 0.3, h - 0.3, '#4f7f3a', 'matte'), S(w / 4, 0, w * 0.55, d * 0.9, 0.3, h - 0.35, '#5f9446', 'matte')],
  },
  {
    id: 'car', name: 'Carro', category: 'Área externa', width: 1.8, depth: 4.4, height: 1.5,
    parts: (w, d, h) => [
      B(0, 0, w, d, 0.3, 0.6, '#3d5a80', 'metal'),
      B(0, 0.1, w * 0.9, d * 0.5, 0.9, h - 0.9, '#2b3a4a', 'glass'),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ shape: 'cyl' as const, x: sx * (w / 2 - 0.1), y: 0.32, z: sz * (d / 2 - 0.75), sx: 0.2, sy: 0.64, sz: 0.64, color: '#1b1b1b', material: 'matte' as const, ry: Math.PI / 2 })),
    ],
  },
  // ---------- Escritório ----------
  {
    id: 'tall_bookcase', name: 'Estante alta', category: 'Escritório', width: 0.9, depth: 0.35, height: 2.1,
    parts: (w, d, h) => {
      const p: Part[] = [B(-w / 2 + 0.015, 0, 0.03, d, 0, h, WHITE, 'wood'), B(w / 2 - 0.015, 0, 0.03, d, 0, h, WHITE, 'wood')];
      for (let i = 0; i <= 6; i++) p.push(B(0, 0, w - 0.06, d, (i * (h - 0.03)) / 6, 0.03, WHITE, 'wood'));
      return p;
    },
  },
  {
    id: 'file_cabinet', name: 'Gaveteiro / arquivo', category: 'Escritório', width: 0.45, depth: 0.6, height: 0.7,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#8a9097', 'metal'), B(0, d / 2 + 0.003, w - 0.04, 0.006, h / 3, 0.006, '#555'), B(0, d / 2 + 0.003, w - 0.04, 0.006, (2 * h) / 3, 0.006, '#555')],
  },
  // ---------- Banheiro ----------
  {
    id: 'bidet', name: 'Bidê', category: 'Banheiro', width: 0.38, depth: 0.55, height: 0.4,
    parts: (w, d, h) => [C(0, 0.02, w * 0.95, d * 0.85, 0, h, WHITE, 'ceramic')],
  },
  {
    id: 'mirror_cabinet', name: 'Armário com espelho', category: 'Banheiro', width: 0.6, depth: 0.15, height: 0.7, elevation: 1.2,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, WHITE, 'wood'), B(0, d / 2 + 0.003, w - 0.02, 0.006, 0.01, h - 0.02, '#cfe3ee', 'glass')],
  },
);


/** Mais escadas e móveis. */
CATALOG.push(
  {
    id: 'stair_landing', name: 'Escada reta com patamar', category: 'Escadas', width: 0.9, depth: 5.2, height: 2.95, stair: true,
    footprint: (h) => ({ width: 0.9, depth: steps(h).n * steps(h).tread + 0.9 }),
    parts: (w, d, h) => {
      const { n, rise } = steps(h);
      const n1 = Math.ceil(n / 2);
      const tread = (d - 0.9) / n;
      const parts: Part[] = [];
      let z = d / 2;
      for (let i = 0; i < n; i++) {
        if (i === n1) {
          parts.push(B(0, z - 0.45, w, 0.9, 0, n1 * rise, '#bfa98b', 'wood'));
          z -= 0.9;
        }
        parts.push(B(0, z - tread / 2, w, tread, 0, (i + 1) * rise, i % 2 ? STEP_B : STEP_A, 'wood'));
        z -= tread;
      }
      return parts;
    },
  },
  {
    id: 'stair_floating', name: 'Escada flutuante (degraus em balanço)', category: 'Escadas', width: 0.9, depth: 4.34, height: 2.95, stair: true,
    footprint: (h) => ({ width: 0.9, depth: steps(h).n * steps(h).tread }),
    parts: (w, d, h) => {
      const { n, rise } = steps(h);
      const tread = d / n;
      const parts: Part[] = [];
      for (let i = 0; i < n; i++) parts.push(B(0.03, d / 2 - (i + 0.5) * tread, w - 0.06, tread - 0.02, (i + 1) * rise - 0.06, 0.06, '#8b5e3c', 'wood'));
      parts.push(B(-w / 2 + 0.03, 0, 0.06, d, 0, h, '#2f3236', 'metal'));
      return parts;
    },
  },
  {
    id: 'stair_ladder', name: 'Escada marinheiro', category: 'Escadas', width: 0.6, depth: 0.5, height: 2.95, stair: true,
    footprint: () => ({ width: 0.6, depth: 0.5 }),
    parts: (w, _d, h) => {
      const n = Math.ceil(h / 0.3);
      const parts: Part[] = [B(-w / 2 + 0.02, 0, 0.04, 0.04, 0, h + 0.9, '#5b5f63', 'metal'), B(w / 2 - 0.02, 0, 0.04, 0.04, 0, h + 0.9, '#5b5f63', 'metal')];
      for (let i = 1; i <= n; i++) parts.push(C(0, 0, w - 0.04, 0.03, (i * h) / n, 0.03, '#7a7f84', 'metal'));
      return parts;
    },
  },
  {
    id: 'sofa_l', name: 'Sofá de canto (em L)', category: 'Sala', width: 2.6, depth: 1.8, height: 0.85,
    parts: (w, d, h) => {
      const fabric = '#7b8794';
      const back = 0.22;
      return [
        ...legs(w, 0.9, 0.06, 0.05, 0.1, WOOD_DARK).map((p) => ({ ...p, z: p.z - (d - 0.9) / 2 })),
        B(0, -d / 2 + 0.45, w, 0.9, 0.1, 0.3, fabric, 'fabric'),
        B(w / 2 - 0.45, 0.45, 0.9, d - 0.9, 0.1, 0.3, fabric, 'fabric'),
        B(0, -d / 2 + back / 2, w, back, 0.4, h - 0.4, fabric, 'fabric'),
        B(w / 2 - back / 2, 0, back, d, 0.4, h - 0.4, fabric, 'fabric'),
        B(-w / 2 + 0.1, -d / 2 + 0.45, 0.2, 0.9, 0.4, 0.22, fabric, 'fabric'),
        B(-0.2, -d / 2 + 0.55, w - 0.85, 0.66, 0.4, 0.12, shade(fabric, 12), 'fabric'),
        B(w / 2 - 0.55, 0.35, 0.66, d - 0.95, 0.4, 0.12, shade(fabric, 12), 'fabric'),
      ];
    },
  },
  {
    id: 'recliner', name: 'Poltrona reclinável', category: 'Sala', width: 0.9, depth: 1.0, height: 1.05,
    parts: (w, d, h) => [B(0, 0.05, w, d - 0.1, 0.12, 0.35, '#5a4636', 'fabric'), B(0, -d / 2 + 0.12, w, 0.24, 0.12, h - 0.12, '#5a4636', 'fabric'), B(-w / 2 + 0.09, 0, 0.18, d, 0.12, 0.55, '#4d3c2e', 'fabric'), B(w / 2 - 0.09, 0, 0.18, d, 0.12, 0.55, '#4d3c2e', 'fabric')],
  },
  {
    id: 'floating_rack', name: 'Rack suspenso', category: 'Sala', width: 1.8, depth: 0.35, height: 0.35, elevation: 0.45,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#3b3f45', 'wood'), B(0, d / 2 + 0.003, w - 0.04, 0.006, 0.02, h - 0.04, '#55595e')],
  },
  {
    id: 'fireplace', name: 'Lareira', category: 'Sala', width: 1.4, depth: 0.5, height: 1.1,
    light: { y: 0.4, color: '#ff9a3c', intensity: 3 },
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#d8d2c8', 'ceramic'), B(0, d / 2 - 0.02, w * 0.55, 0.04, 0.15, 0.55, '#1b1b1b', 'metal'), S(0, d / 2 - 0.15, 0.3, 0.15, 0.17, 0.25, '#ff8c2a', 'glass'), B(0, 0, w + 0.1, d + 0.05, h, 0.05, '#bdb6aa', 'ceramic')],
  },
  {
    id: 'round_table', name: 'Mesa redonda (4 lugares)', category: 'Cozinha', width: 1.1, depth: 1.1, height: 0.76,
    parts: (w, d, h) => [C(0, 0, w, d, h - 0.04, 0.04, WOOD, 'wood'), C(0, 0, 0.12, 0.12, 0.05, h - 0.09, WOOD_DARK, 'wood'), C(0, 0, 0.55, 0.55, 0, 0.05, WOOD_DARK, 'wood')],
  },
  {
    id: 'bar_counter', name: 'Bancada americana', category: 'Cozinha', width: 1.8, depth: 0.5, height: 1.05,
    parts: (w, d, h) => [B(0, -0.05, w, d - 0.1, 0, h - 0.04, '#efe9df', 'wood'), B(0, 0, w, d + 0.1, h - 0.04, 0.04, '#33363a', 'ceramic')],
  },
  {
    id: 'bar_stool', name: 'Banqueta alta', category: 'Cozinha', width: 0.4, depth: 0.4, height: 0.75,
    parts: (w, d, h) => [C(0, 0, w, d, h - 0.06, 0.06, '#2b2b2b', 'fabric'), C(0, 0, 0.05, 0.05, 0.03, h - 0.09, STEEL, 'metal'), C(0, 0, w * 0.85, d * 0.85, 0, 0.03, STEEL, 'metal')],
  },
  {
    id: 'wine_rack', name: 'Adega / cristaleira', category: 'Cozinha', width: 0.8, depth: 0.4, height: 1.8,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, WOOD_DARK, 'wood'), B(0, d / 2 + 0.004, w - 0.06, 0.008, 0.06, h - 0.12, '#cfe3ee', 'glass')],
  },
  {
    id: 'box_bed', name: 'Cama box queen', category: 'Quarto', width: 1.58, depth: 1.98, height: 0.62,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.38, '#d9d4cc', 'fabric'), B(0, 0, w - 0.02, d - 0.02, 0.38, h - 0.38, '#f4f1ea', 'fabric'), B(-w / 4, -d / 2 + 0.25, w / 2 - 0.1, 0.32, h, 0.1, '#ffffff', 'fabric'), B(w / 4, -d / 2 + 0.25, w / 2 - 0.1, 0.32, h, 0.1, '#ffffff', 'fabric'), B(0, d * 0.15, w, d * 0.6, h, 0.03, '#a68c74', 'fabric')],
  },
  {
    id: 'closet', name: 'Closet aberto (araras)', category: 'Quarto', width: 2.0, depth: 0.6, height: 2.2,
    parts: (w, d, h) => [B(-w / 2 + 0.015, 0, 0.03, d, 0, h, WHITE, 'wood'), B(w / 2 - 0.015, 0, 0.03, d, 0, h, WHITE, 'wood'), B(0, 0, w, d, h - 0.03, 0.03, WHITE, 'wood'), B(0, 0, w, d, 0, 0.35, WHITE, 'wood'), C(0, 0, w - 0.06, 0.025, 1.75, 0.025, STEEL, 'metal'), ...[-0.6, -0.3, 0, 0.3, 0.6].map((x) => B((x * w) / 2, 0, 0.04, d * 0.8, 0.9, 0.85, ['#6c8ebf', '#c9a27a', '#8a8f96', '#b5576b', '#e9e4dc'][Math.round((x + 0.6) / 0.3)], 'fabric'))],
  },
  {
    id: 'shoe_rack', name: 'Sapateira', category: 'Quarto', width: 0.8, depth: 0.32, height: 1.0,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, WOOD_LIGHT, 'wood'), B(0, d / 2 + 0.003, w - 0.04, 0.006, h / 2, 0.006, WOOD_DARK)],
  },
  {
    id: 'l_desk', name: 'Escrivaninha em L', category: 'Escritório', width: 1.6, depth: 1.4, height: 0.75,
    parts: (w, d, h) => [B(0, -d / 2 + 0.3, w, 0.6, h - 0.03, 0.03, WOOD_LIGHT, 'wood'), B(w / 2 - 0.3, 0.3, 0.6, d - 0.6, h - 0.03, 0.03, WOOD_LIGHT, 'wood'), B(-w / 2 + 0.02, -d / 2 + 0.3, 0.03, 0.58, 0, h - 0.03, WHITE, 'wood'), B(w / 2 - 0.3, d / 2 - 0.02, 0.58, 0.03, 0, h - 0.03, WHITE, 'wood'), B(0, -d / 2 + 0.12, 0.58, 0.03, h + 0.12, 0.34, BLACK, 'glass')],
  },
  {
    id: 'treadmill', name: 'Esteira', category: 'Escritório', width: 0.8, depth: 1.8, height: 1.4,
    parts: (w, d, h) => [B(0, 0.1, w, d - 0.2, 0, 0.18, '#2b2d30', 'metal'), B(0, 0.1, w - 0.2, d - 0.3, 0.18, 0.01, '#3c4045', 'fabric'), B(-w / 2 + 0.05, -d / 2 + 0.15, 0.05, 0.05, 0, h, '#5b5f63', 'metal'), B(w / 2 - 0.05, -d / 2 + 0.15, 0.05, 0.05, 0, h, '#5b5f63', 'metal'), B(0, -d / 2 + 0.15, w, 0.25, h - 0.1, 0.12, '#2b2d30', 'metal')],
  },
  {
    id: 'ofuro', name: 'Ofurô', category: 'Banheiro', width: 1.3, depth: 1.3, height: 0.7,
    parts: (w, d, h) => [C(0, 0, w, d, 0, h, '#a0784f', 'wood'), C(0, 0, w - 0.1, d - 0.1, h - 0.08, 0.06, '#a9d6ee', 'glass')],
  },
  {
    id: 'corner_tub', name: 'Banheira de canto', category: 'Banheiro', width: 1.4, depth: 1.4, height: 0.55,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, WHITE, 'ceramic'), S(0.1, 0.1, w * 0.85, d * 0.85, h - 0.12, 0.11, '#a9d6ee', 'glass')],
  },
  {
    id: 'ceiling_fan', name: 'Ventilador de teto', category: 'Iluminação', width: 1.2, depth: 1.2, height: 0.4, elevation: 2.35,
    light: { y: 0.0, color: '#fff3d6', intensity: 4 },
    parts: (w, _d, h) => [C(0, 0, 0.02, 0.02, h * 0.4, h * 0.6, '#d9d9d9', 'metal'), C(0, 0, 0.22, 0.22, 0, h * 0.4, '#ececec', 'metal'), ...[0, 1, 2, 3].map((k) => ({ shape: 'box' as const, x: Math.cos((k * Math.PI) / 2) * w * 0.27, y: h * 0.3, z: Math.sin((k * Math.PI) / 2) * w * 0.27, sx: w * 0.42, sy: 0.01, sz: 0.12, color: '#c9a77c', material: 'wood' as const, ry: (k * Math.PI) / 2 }))],
  },
  {
    id: 'split_ac', name: 'Ar-condicionado split', category: 'Iluminação', width: 0.9, depth: 0.22, height: 0.3, elevation: 2.2,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#f4f5f6', 'ceramic'), B(0, d / 2 + 0.003, w - 0.1, 0.006, 0.04, 0.05, '#c9ced3')],
  },
  {
    id: 'wall_mirror', name: 'Espelho de parede', category: 'Decoração', width: 0.8, depth: 0.03, height: 1.6, elevation: 0.3,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#b8860b', 'metal'), B(0, d / 2 + 0.002, w - 0.06, 0.004, 0.03, h - 0.06, '#dbe9f2', 'glass')],
  },
  {
    id: 'curtain', name: 'Cortina', category: 'Decoração', width: 2.0, depth: 0.12, height: 2.5,
    parts: (w, d, h) => [C(0, 0, w + 0.2, 0.03, h - 0.03, 0.03, '#888', 'metal'), B(-w / 2 + w * 0.18, 0, w * 0.34, d, 0.02, h - 0.06, '#e9e1d2', 'fabric'), B(w / 2 - w * 0.18, 0, w * 0.34, d, 0.02, h - 0.06, '#e9e1d2', 'fabric')],
  },
);


// =====================================================================
// Pacote de objetos v6: jardim, garagem, vidros, balcões, área gourmet
// e escadas usuais no Brasil.
// =====================================================================

const GREEN = '#4f7f3a';
const GREEN_L = '#6aa64f';
const GREEN_D = '#3b6430';
const SOIL = '#6b4a32';
const STONE = '#b8b2a7';
const CONCRETE = '#a7a9ac';
const MARBLE = '#f1efea';
const MARBLE_V = '#d9d6cf';
const GRANITE = '#2f3134';

/** Espelha as peças em X (escada virando para o outro lado). */
const mirrorX = (ps: Part[]): Part[] => ps.map((p) => ({ ...p, x: -p.x, ry: p.ry ? -p.ry : p.ry }));
/** Peça girada em planta (ângulo a). */
const R = (p: Part, a: number): Part => ({ ...p, ry: a });
const stepColor = (i: number) => (i % 2 ? STEP_B : STEP_A);

/** Folhagem: copa em camadas de esferas. */
function crown(cx: number, cz: number, w: number, d: number, y0: number, hh: number, color: string): Part[] {
  return [
    S(cx, cz, w, d, y0, hh, color, 'matte'),
    S(cx + w * 0.18, cz - d * 0.12, w * 0.6, d * 0.6, y0 + hh * 0.35, hh * 0.6, shade(color, 18), 'matte'),
    S(cx - w * 0.2, cz + d * 0.15, w * 0.55, d * 0.55, y0 + hh * 0.25, hh * 0.55, shade(color, -12), 'matte'),
  ];
}

function car(w: number, d: number, h: number, body: string, tall = false): Part[] {
  const wheel = tall ? 0.72 : 0.64;
  return [
    B(0, 0, w, d, wheel * 0.45, tall ? 0.75 : 0.6, body, 'metal'),
    B(0, tall ? 0.25 : 0.1, w * 0.92, d * (tall ? 0.7 : 0.52), wheel * 0.45 + (tall ? 0.75 : 0.6), h - wheel * 0.45 - (tall ? 0.75 : 0.6), '#2b3a4a', 'glass'),
    B(0, d / 2 - 0.02, w * 0.8, 0.04, wheel * 0.45 + 0.2, 0.12, '#e8e8e8', 'glass'),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ shape: 'cyl' as const, x: sx * (w / 2 - 0.1), y: wheel / 2, z: sz * (d / 2 - 0.8), sx: 0.22, sy: wheel, sz: wheel, color: '#1b1b1b', material: 'matte' as const, ry: Math.PI / 2 })),
  ];
}

/** Balcão com tampo de mármore que avança para os dois lados (banquetas dos dois lados). */
function marbleCounter(w: number, d: number, h: number, sink = false, cooktop = false): Part[] {
  const base = d * 0.55;
  const p: Part[] = [
    B(0, 0, w - 0.1, base, 0, h - 0.04, '#e9e4dc', 'wood'),
    B(0, 0, w, d, h - 0.04, 0.04, MARBLE, 'ceramic'),
    B(-w / 2 + 0.02, 0, 0.04, d, 0, h - 0.04, MARBLE, 'ceramic'),
    B(w / 2 - 0.02, 0, 0.04, d, 0, h - 0.04, MARBLE, 'ceramic'),
    B(0, 0, w * 0.9, 0.006, h - 0.001, 0.002, MARBLE_V, 'ceramic'),
  ];
  if (sink) p.push(B(-w / 4, 0, 0.5, 0.36, h - 0.03, 0.01, '#9aa3ab', 'metal'), C(-w / 4, -0.2, 0.03, 0.03, h, 0.3, STEEL, 'metal'));
  if (cooktop) p.push(B(w / 4, 0, 0.6, 0.5, h, 0.01, BLACK, 'glass'));
  return p;
}

function stepsRun(x: number, zStart: number, dirZ: number, width: number, tread: number, count: number, from: number, rise: number, color: (i: number) => string = stepColor): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < count; i++) out.push(B(x, zStart + dirZ * (i + 0.5) * tread, width, tread, 0, (from + i + 1) * rise, color(from + i), 'wood'));
  return out;
}

CATALOG.push(
  // ---------- Escadas brasileiras ----------
  {
    id: 'stair_l_left', name: 'Escada em L (virando à esquerda)', category: 'Escadas', width: 2.6, depth: 2.95, height: 2.95, stair: true,
    footprint: (h) => CATALOG.find((c) => c.id === 'stair_l')!.footprint!(h),
    parts: (w, d, h) => mirrorX(CATALOG.find((c) => c.id === 'stair_l')!.parts(w, d, h)),
  },
  {
    id: 'stair_l_winder', name: 'Escada em L com leque (sem patamar)', category: 'Escadas', width: 2.4, depth: 2.6, height: 2.95, stair: true,
    footprint: (h) => {
      const { n, tread } = steps(h);
      const n1 = Math.ceil((n - 3) / 2);
      return { width: 0.9 + (n - 3 - n1) * tread, depth: 0.9 + n1 * tread };
    },
    parts: (w, d, h) => {
      const { n, rise } = steps(h);
      const n1 = Math.ceil((n - 3) / 2);
      const n2 = n - 3 - n1;
      const t1 = (d - 0.9) / Math.max(1, n1);
      const t2 = (w - 0.9) / Math.max(1, n2);
      const x0 = -w / 2 + 0.45;
      const parts: Part[] = stepsRun(x0, d / 2, -1, 0.9, t1, n1, 0, rise);
      // três degraus em leque saindo do canto interno
      const cx = -w / 2 + 0.9;
      const cz = -d / 2 + 0.9;
      [195, 225, 255].forEach((deg, k) => {
        const a = (deg * Math.PI) / 180;
        const c = Math.abs(Math.cos(a));
        const s = Math.abs(Math.sin(a));
        const L = 0.9 / Math.max(c, s);
        parts.push(R(B(cx + Math.cos(a) * L * 0.5, cz + Math.sin(a) * L * 0.5, L, Math.min(0.5, L * 0.42), 0, (n1 + k + 1) * rise, stepColor(n1 + k), 'wood'), a));
      });
      for (let j = 0; j < n2; j++) parts.push(B(-w / 2 + 0.9 + (j + 0.5) * t2, -d / 2 + 0.45, t2, 0.9, 0, (n1 + 3 + j + 1) * rise, stepColor(j), 'wood'));
      return parts;
    },
  },
  {
    id: 'stair_u3', name: 'Escada em U de três lances (2 patamares)', category: 'Escadas', width: 2.6, depth: 2.4, height: 2.95, stair: true,
    footprint: (h) => {
      const { n, tread } = steps(h);
      const n1 = Math.round(n / 3);
      const n2 = n - 2 * n1;
      return { width: 1.8 + Math.max(1, n2 - 1) * tread, depth: 0.9 + n1 * tread };
    },
    parts: (w, d, h) => {
      const { n, rise } = steps(h);
      const n1 = Math.round(n / 3);
      const n2 = n - 2 * n1;
      const t1 = (d - 0.9) / Math.max(1, n1);
      const t2 = (w - 1.8) / Math.max(1, n2 - 1);
      const parts: Part[] = [];
      // lance 1: sobe pela esquerda até o patamar do fundo
      parts.push(...stepsRun(-w / 2 + 0.45, d / 2, -1, 0.9, t1, n1 - 1, 0, rise));
      parts.push(B(-w / 2 + 0.45, -d / 2 + 0.45 + (d - 0.9 - (n1 - 1) * t1) / 2, 0.9, 0.9 + (d - 0.9 - (n1 - 1) * t1), 0, n1 * rise, '#bfa98b', 'wood'));
      // lance 2: atravessa pelo fundo
      for (let j = 0; j < n2 - 1; j++) parts.push(B(-w / 2 + 0.9 + (j + 0.5) * t2, -d / 2 + 0.45, t2, 0.9, 0, (n1 + j + 1) * rise, stepColor(j), 'wood'));
      parts.push(B(w / 2 - 0.45, -d / 2 + 0.45, 0.9, 0.9, 0, (n1 + n2) * rise, '#bfa98b', 'wood'));
      // lance 3: desce para a frente pela direita
      parts.push(...stepsRun(w / 2 - 0.45, -d / 2 + 0.9, 1, 0.9, t1, n1, n1 + n2, rise));
      return parts;
    },
  },
  {
    id: 'stair_imperial', name: 'Escada imperial (1 lance que se divide em 2)', category: 'Escadas', width: 3.2, depth: 3.4, height: 2.95, stair: true,
    footprint: (h) => {
      const { n, tread } = steps(h);
      const n1 = Math.ceil(n / 2);
      return { width: 3.2, depth: 1.0 + Math.max(n1 - 1, n - n1) * tread };
    },
    parts: (w, d, h) => {
      const { n, rise } = steps(h);
      const n1 = Math.ceil(n / 2);
      const n2 = n - n1;
      const run = d - 1.0;
      const t1 = run / Math.max(1, n1 - 1);
      const t2 = run / Math.max(1, n2);
      const side = (w - 1.4) / 2;
      const parts: Part[] = stepsRun(0, d / 2, -1, 1.2, t1, n1 - 1, 0, rise);
      parts.push(B(0, -d / 2 + 0.5, w, 1.0, 0, n1 * rise, '#bfa98b', 'wood'));
      for (const s of [-1, 1]) parts.push(...stepsRun(s * (w / 2 - side / 2), -d / 2 + 1.0, 1, side, t2, n2, n1, rise));
      return parts;
    },
  },
  {
    id: 'stair_concrete', name: 'Escada de concreto armado (reta)', category: 'Escadas', width: 1.0, depth: 4.34, height: 2.95, stair: true,
    footprint: (h) => ({ width: 1.0, depth: steps(h).n * steps(h).tread }),
    parts: (w, d, h) => {
      const { n, rise } = steps(h);
      const tread = d / n;
      const parts = stepsRun(0, d / 2, -1, w, tread, n, 0, rise, (i) => (i % 2 ? '#b1b3b5' : CONCRETE));
      parts.push(...rail(w / 2 - 0.03, d, h), ...rail(-w / 2 + 0.03, d, h));
      return parts;
    },
  },
  {
    id: 'stair_steel', name: 'Escada metálica (chapa xadrez)', category: 'Escadas', width: 0.9, depth: 4.34, height: 2.95, stair: true,
    footprint: (h) => ({ width: 0.9, depth: steps(h).n * steps(h).tread }),
    parts: (w, d, h) => {
      const { n, rise } = steps(h);
      const tread = d / n;
      const parts: Part[] = [];
      for (let i = 0; i < n; i++) parts.push(B(0, d / 2 - (i + 0.5) * tread, w - 0.1, tread - 0.01, (i + 1) * rise - 0.02, 0.02, '#6d7378', 'metal'));
      for (const s of [-1, 1]) {
        // longarina inclinada (em dente de serra, acompanhando os degraus)
        for (let i = 0; i < n; i++) parts.push(B(s * (w / 2 - 0.04), d / 2 - (i + 0.5) * tread, 0.06, tread, Math.max(0, (i + 1) * rise - 0.22), Math.min(0.22, (i + 1) * rise), '#3a3f44', 'metal'));
        parts.push(...rail(s * (w / 2 - 0.04), d, h));
      }
      return parts;
    },
  },
  {
    id: 'entry_steps', name: 'Degraus de entrada (3 degraus)', category: 'Escadas', width: 1.5, depth: 0.9, height: 0.51,
    parts: (w, d, h) => [0, 1, 2].map((i) => B(0, d / 2 - (i + 0.5) * (d / 3), w, d / 3, 0, ((i + 1) * h) / 3, STONE, 'ceramic')),
  },
  {
    id: 'access_ramp', name: 'Rampa acessível (NBR 9050, 8,33%)', category: 'Escadas', width: 1.2, depth: 6.0, height: 0.5,
    parts: (w, d, h) => {
      const parts: Part[] = [];
      const k = 12;
      for (let i = 0; i < k; i++) parts.push(B(0, d / 2 - (i + 0.5) * (d / k), w, d / k, 0, Math.max(0.02, ((i + 1) * h) / k), i % 2 ? '#c7c2b8' : '#cfcac0', 'ceramic'));
      for (const s of [-1, 1]) {
        parts.push({ shape: 'box', x: s * (w / 2 - 0.03), y: h / 2 + 0.92, z: 0, sx: 0.04, sy: 0.04, sz: d, color: '#5b5f63', material: 'metal' });
        parts.push({ shape: 'box', x: s * (w / 2 - 0.03), y: h / 2 + 0.7, z: 0, sx: 0.04, sy: 0.04, sz: d, color: '#5b5f63', material: 'metal' });
      }
      return parts;
    },
  },

  // ---------- Cozinha: balcões e bancadas ----------
  {
    id: 'marble_counter', name: 'Balcão de mármore (divisória cozinha/sala)', category: 'Cozinha', width: 2.2, depth: 0.7, height: 1.05,
    parts: (w, d, h) => marbleCounter(w, d, h),
  },
  {
    id: 'marble_counter_stools', name: 'Balcão de mármore com 3 banquetas', category: 'Cozinha', width: 2.2, depth: 1.3, height: 1.05,
    parts: (w, d, h) => {
      const p = marbleCounter(w, 0.7, h).map((x) => ({ ...x, z: x.z - (d - 0.7) / 2 }));
      for (const x of [-w / 3, 0, w / 3]) {
        const z = d / 2 - 0.22;
        p.push(C(x, z, 0.4, 0.4, 0.71, 0.06, '#2b2b2b', 'fabric'), C(x, z, 0.05, 0.05, 0.03, 0.68, STEEL, 'metal'), C(x, z, 0.36, 0.36, 0, 0.03, STEEL, 'metal'));
      }
      return p;
    },
  },
  {
    id: 'marble_peninsula', name: 'Península de mármore com cooktop', category: 'Cozinha', width: 2.4, depth: 0.9, height: 0.92,
    parts: (w, d, h) => marbleCounter(w, d, h, false, true),
  },
  {
    id: 'marble_island', name: 'Ilha de mármore com cuba e cooktop', category: 'Cozinha', width: 2.6, depth: 1.1, height: 0.92,
    parts: (w, d, h) => marbleCounter(w, d, h, true, true),
  },
  {
    id: 'sink_cabinet', name: 'Pia de cozinha com gabinete (granito)', category: 'Cozinha', width: 1.8, depth: 0.6, height: 0.92,
    parts: (w, d, h) => [B(0, -0.02, w, d - 0.04, 0.1, h - 0.13, WHITE, 'wood'), B(0, -0.04, w, d - 0.08, 0, 0.1, '#cfcac2', 'wood'), B(0, 0, w, d, h - 0.03, 0.03, GRANITE, 'ceramic'), B(0, 0.02, 0.55, 0.4, h - 0.02, 0.01, '#9aa3ab', 'metal'), C(0, -d / 2 + 0.06, 0.03, 0.03, h, 0.32, STEEL, 'metal')],
  },
  {
    id: 'kitchen_l', name: 'Cozinha planejada em L (gabinetes + aéreos)', category: 'Cozinha', width: 2.8, depth: 2.2, height: 2.2,
    parts: (w, d, h) => [
      B(0, -d / 2 + 0.3, w, 0.6, 0, 0.88, WHITE, 'wood'), B(0, -d / 2 + 0.3, w, 0.62, 0.88, 0.04, GRANITE, 'ceramic'),
      B(-w / 2 + 0.3, 0.3, 0.6, d - 0.6, 0, 0.88, WHITE, 'wood'), B(-w / 2 + 0.3, 0.3, 0.62, d - 0.6, 0.88, 0.04, GRANITE, 'ceramic'),
      B(0, -d / 2 + 0.17, w, 0.34, 1.5, h - 1.5, WOOD_LIGHT, 'wood'), B(-w / 2 + 0.17, 0.17, 0.34, d - 0.34, 1.5, h - 1.5, WOOD_LIGHT, 'wood'),
      B(0.3, -d / 2 + 0.3, 0.55, 0.4, 0.91, 0.01, '#9aa3ab', 'metal'), B(w / 2 - 0.4, -d / 2 + 0.3, 0.6, 0.5, 0.92, 0.01, BLACK, 'glass'),
    ],
  },
  {
    id: 'cooktop', name: 'Cooktop 5 bocas', category: 'Cozinha', width: 0.75, depth: 0.52, height: 0.02, elevation: 0.92,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, BLACK, 'glass'), ...[[-0.22, -0.12], [0.22, -0.12], [-0.22, 0.12], [0.22, 0.12], [0, 0]].map(([x, z]) => C(x * w * 1.1, z * d * 1.4, 0.14, 0.14, h, 0.005, '#555', 'metal'))],
  },
  {
    id: 'oven_tower', name: 'Torre quente (forno + micro-ondas)', category: 'Cozinha', width: 0.7, depth: 0.6, height: 2.2,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, WHITE, 'wood'), B(0, d / 2 + 0.005, 0.6, 0.01, 0.8, 0.58, BLACK, 'glass'), B(0, d / 2 + 0.005, 0.6, 0.01, 1.45, 0.38, BLACK, 'glass')],
  },
  {
    id: 'pantry', name: 'Armário paneleiro / despensa', category: 'Cozinha', width: 0.8, depth: 0.6, height: 2.2,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, WOOD_LIGHT, 'wood'), B(0, d / 2 + 0.003, 0.006, 0.006, 0.05, h - 0.1, WOOD_DARK)],
  },
  {
    id: 'microwave', name: 'Micro-ondas', category: 'Cozinha', width: 0.5, depth: 0.4, height: 0.3, elevation: 0.92,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#d9dadb', 'metal'), B(-0.06, d / 2 + 0.004, w * 0.62, 0.008, 0.04, h - 0.08, BLACK, 'glass')],
  },
  {
    id: 'water_filter', name: 'Purificador de água', category: 'Cozinha', width: 0.25, depth: 0.3, height: 0.4, elevation: 0.92,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#f2f2f2', 'ceramic'), B(0, d / 2 + 0.003, w * 0.6, 0.006, h * 0.6, h * 0.3, '#6fa9d9', 'glass')],
  },
  {
    id: 'dining_table6', name: 'Mesa de jantar 6 lugares (com cadeiras)', category: 'Cozinha', width: 1.9, depth: 1.6, height: 0.9,
    parts: (w, d, h) => {
      const tw = w - 0.1;
      const td = d - 0.7;
      const p: Part[] = [B(0, 0, tw, td, 0.72, 0.04, WOOD, 'wood'), ...legs(tw, td, 0.06, 0.06, 0.72, WOOD_DARK)];
      for (const s of [-1, 1]) for (const x of [-tw / 3, 0, tw / 3]) {
        const z = s * (td / 2 + 0.2);
        p.push(B(x, z, 0.44, 0.42, 0.45, 0.05, '#c9b79c', 'fabric'), B(x, z + s * 0.19, 0.44, 0.04, 0.45, h - 0.45, WOOD_DARK, 'wood'));
      }
      return p;
    },
  },
  {
    id: 'dining_table8', name: 'Mesa de jantar 8 lugares', category: 'Cozinha', width: 2.4, depth: 1.0, height: 0.76,
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.05, 0.05, '#8b5e3c', 'wood'), B(-w / 2 + 0.35, 0, 0.12, d - 0.3, 0, h - 0.05, '#5a3d27', 'wood'), B(w / 2 - 0.35, 0, 0.12, d - 0.3, 0, h - 0.05, '#5a3d27', 'wood')],
  },
  {
    id: 'german_corner', name: 'Canto alemão (banco + mesa)', category: 'Cozinha', width: 1.8, depth: 1.6, height: 0.95,
    parts: (w, d, h) => [
      B(0, -d / 2 + 0.25, w, 0.5, 0, 0.45, '#b9a184', 'wood'), B(0, -d / 2 + 0.03, w, 0.06, 0.45, h - 0.45, '#b9a184', 'wood'),
      B(-w / 2 + 0.25, 0.25, 0.5, d - 0.5, 0, 0.45, '#b9a184', 'wood'), B(-w / 2 + 0.03, 0.25, 0.06, d - 0.5, 0.45, h - 0.45, '#b9a184', 'wood'),
      B(0.25, 0.2, 1.1, 0.8, 0.72, 0.04, WOOD, 'wood'), C(0.25, 0.2, 0.1, 0.1, 0, 0.72, WOOD_DARK, 'wood'),
    ],
  },

  // ---------- Área gourmet ----------
  {
    id: 'bbq_gourmet', name: 'Churrasqueira gourmet com bancada e pia', category: 'Área gourmet', width: 3.0, depth: 0.7, height: 2.4,
    parts: (w, d, h) => [
      B(-w / 2 + 0.5, 0, 1.0, d, 0, 0.9, '#b5653a', 'ceramic'), B(-w / 2 + 0.5, -0.05, 0.85, d * 0.7, 0.94, 0.65, '#2b2b2b', 'metal'), B(-w / 2 + 0.5, -0.05, 0.6, d * 0.5, 1.59, h - 1.59, '#b5653a', 'ceramic'),
      B(0.5, 0, w - 1.0, d, 0, 0.88, '#4a4d52', 'wood'), B(0.5, 0, w - 1.0, d, 0.88, 0.04, GRANITE, 'ceramic'),
      B(0.6, 0.02, 0.5, 0.38, 0.91, 0.01, '#9aa3ab', 'metal'), C(0.6, -d / 2 + 0.06, 0.03, 0.03, 0.92, 0.32, STEEL, 'metal'),
    ],
  },
  {
    id: 'pizza_oven', name: 'Forno de pizza a lenha', category: 'Área gourmet', width: 1.2, depth: 1.2, height: 1.9,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.9, '#b5653a', 'ceramic'), S(0, 0, w * 0.95, d * 0.95, 0.9, 0.7, '#c97b4a', 'ceramic'), B(0, d / 2 - 0.1, 0.45, 0.2, 0.92, 0.3, BLACK, 'matte'), C(0, -0.25, 0.18, 0.18, 1.5, h - 1.5, '#8a4d2b', 'ceramic')],
  },
  {
    id: 'wood_stove', name: 'Fogão a lenha', category: 'Área gourmet', width: 1.2, depth: 0.65, height: 1.8,
    light: { y: 0.45, color: '#ff9a3c', intensity: 2 },
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.8, '#efe9df', 'ceramic'), B(0, 0, w, d, 0.8, 0.03, BLACK, 'metal'), B(-w / 4, d / 2 + 0.005, 0.35, 0.01, 0.3, 0.3, BLACK, 'metal'), C(w / 2 - 0.15, -d / 2 + 0.15, 0.14, 0.14, 0.83, h - 0.83, '#3a3a3a', 'metal')],
  },
  {
    id: 'gourmet_table', name: 'Mesa rústica com bancos', category: 'Área gourmet', width: 2.2, depth: 1.6, height: 0.78,
    parts: (w, d, h) => [B(0, 0, w, 0.9, h - 0.06, 0.06, '#7a5233', 'wood'), ...legs(w, 0.9, 0.12, 0.1, h - 0.06, '#5a3d27'), B(0, -d / 2 + 0.15, w, 0.3, 0.42, 0.05, '#7a5233', 'wood'), B(0, d / 2 - 0.15, w, 0.3, 0.42, 0.05, '#7a5233', 'wood'), ...[-1, 1].flatMap((s) => [B(-w / 2 + 0.2, s * (d / 2 - 0.15), 0.08, 0.25, 0, 0.42, '#5a3d27', 'wood'), B(w / 2 - 0.2, s * (d / 2 - 0.15), 0.08, 0.25, 0, 0.42, '#5a3d27', 'wood')])],
  },
  {
    id: 'beer_fridge', name: 'Cervejeira', category: 'Área gourmet', width: 0.6, depth: 0.65, height: 1.5,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#2b2d30', 'metal'), B(0, d / 2 + 0.004, w - 0.08, 0.008, 0.1, h - 0.2, '#3b5a6e', 'glass')],
  },
  {
    id: 'hammock', name: 'Rede de descanso', category: 'Área gourmet', width: 0.9, depth: 3.0, height: 1.6,
    parts: (w, d, h) => [S(0, 0, w * 0.9, d * 0.75, 0.45, 0.35, '#d9534f', 'fabric'), C(0, -d / 2, 0.08, 0.08, 0, h, '#5a3d27', 'wood'), C(0, d / 2, 0.08, 0.08, 0, h, '#5a3d27', 'wood')],
  },
  {
    id: 'jacuzzi', name: 'Spa / hidromassagem', category: 'Área gourmet', width: 2.1, depth: 2.1, height: 0.9,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#8b6b4a', 'wood'), B(0, 0, w - 0.25, d - 0.25, h - 0.06, 0.04, '#4fb3d9', 'glass')],
  },
  {
    id: 'pool_small', name: 'Piscina pequena (prainha)', category: 'Área gourmet', width: 4, depth: 2.5, height: 0.2,
    parts: (w, d, h) => [B(0, 0, w + 0.4, d + 0.4, 0, h * 0.5, '#e3dccb', 'ceramic'), B(0, 0.25, w, d - 0.5, h * 0.5, 0.02, '#4fb3d9', 'glass'), B(0, -d / 2 + 0.25, w, 0.5, h * 0.5, 0.03, '#8fd3ec', 'glass')],
  },
  {
    id: 'outdoor_shower', name: 'Ducha externa', category: 'Área gourmet', width: 0.6, depth: 0.6, height: 2.2,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.03, STONE, 'ceramic'), C(0, -d / 2 + 0.05, 0.05, 0.05, 0, h, STEEL, 'metal'), C(0, -d / 2 + 0.25, 0.25, 0.25, h - 0.05, 0.03, STEEL, 'metal')],
  },

  // ---------- Jardim ----------
  {
    id: 'palm', name: 'Palmeira', category: 'Jardim', width: 3.5, depth: 3.5, height: 7,
    parts: (w, d, h) => [C(0, 0, 0.3, 0.3, 0, h * 0.85, '#8a7a66', 'wood'), ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => R(B(Math.cos((k * Math.PI) / 4) * w * 0.25, Math.sin((k * Math.PI) / 4) * d * 0.25, w * 0.5, 0.35, h * 0.83 - (k % 2) * 0.15, 0.06, k % 2 ? GREEN : GREEN_L, 'matte'), (k * Math.PI) / 4))],
  },
  {
    id: 'ipe', name: 'Ipê-amarelo', category: 'Jardim', width: 4, depth: 4, height: 6,
    parts: (w, d, h) => [C(0, 0, 0.3, 0.3, 0, h * 0.5, '#5a4636', 'wood'), ...crown(0, 0, w, d, h * 0.42, h * 0.58, '#e6c229')],
  },
  {
    id: 'ipe_roxo', name: 'Ipê-roxo', category: 'Jardim', width: 4, depth: 4, height: 6,
    parts: (w, d, h) => [C(0, 0, 0.3, 0.3, 0, h * 0.5, '#5a4636', 'wood'), ...crown(0, 0, w, d, h * 0.42, h * 0.58, '#b05fa8')],
  },
  {
    id: 'fruit_tree', name: 'Árvore frutífera (laranjeira)', category: 'Jardim', width: 2.5, depth: 2.5, height: 3.5,
    parts: (w, d, h) => [C(0, 0, 0.18, 0.18, 0, h * 0.4, '#5a4636', 'wood'), ...crown(0, 0, w, d, h * 0.3, h * 0.7, GREEN_D), ...[[0.5, 0.4], [-0.6, 0.2], [0.1, -0.7], [-0.3, -0.4], [0.7, -0.2]].map(([x, z]) => S((x * w) / 2, (z * d) / 2, 0.12, 0.12, h * 0.55, 0.12, '#f08a24', 'matte'))],
  },
  {
    id: 'cypress', name: 'Cipreste / tuia', category: 'Jardim', width: 1.0, depth: 1.0, height: 3.5,
    parts: (w, d, h) => [C(0, 0, 0.12, 0.12, 0, 0.4, '#5a4636', 'wood'), ...[0, 1, 2, 3].map((k) => C(0, 0, w * (1 - k * 0.2), d * (1 - k * 0.2), 0.3 + k * (h - 0.3) * 0.24, (h - 0.3) * 0.3, shade(GREEN_D, k * 6), 'matte'))],
  },
  {
    id: 'bamboo', name: 'Bambu (touceira)', category: 'Jardim', width: 1.2, depth: 1.2, height: 4,
    parts: (w, d, h) => [...[[0, 0], [0.3, 0.2], [-0.3, 0.15], [0.15, -0.3], [-0.2, -0.25], [0.35, -0.1]].map(([x, z], i) => C((x * w) / 1.2, (z * d) / 1.2, 0.06, 0.06, 0, h * (0.8 + (i % 3) * 0.1), '#9fb64a', 'wood')), ...crown(0, 0, w, d, h * 0.6, h * 0.4, GREEN_L)],
  },
  {
    id: 'banana_tree', name: 'Bananeira / helicônia', category: 'Jardim', width: 2.0, depth: 2.0, height: 3.0,
    parts: (w, d, h) => [C(0, 0, 0.22, 0.22, 0, h * 0.6, '#7d8f4a', 'wood'), ...[0, 1, 2, 3, 4].map((k) => R(B(Math.cos((k * 2 * Math.PI) / 5) * w * 0.25, Math.sin((k * 2 * Math.PI) / 5) * d * 0.25, w * 0.5, 0.3, h * 0.6 + (k % 2) * 0.2, 0.05, k % 2 ? GREEN : GREEN_L, 'matte'), (k * 2 * Math.PI) / 5))],
  },
  {
    id: 'hedge', name: 'Cerca viva (podada)', category: 'Jardim', width: 2.0, depth: 0.5, height: 1.2,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, GREEN_D, 'matte'), B(0, 0, w - 0.06, d + 0.02, h * 0.3, h * 0.6, shade(GREEN_D, 10), 'matte')],
  },
  {
    id: 'flower_bed', name: 'Canteiro de flores', category: 'Jardim', width: 2.0, depth: 0.8, height: 0.45,
    parts: (w, d, h) => {
      const p: Part[] = [B(0, 0, w, d, 0, 0.2, '#c8bfb0', 'ceramic'), B(0, 0, w - 0.08, d - 0.08, 0.2, 0.01, SOIL, 'matte')];
      const cols = ['#e05570', '#f2c14e', '#ffffff', '#b05fa8', '#ef8a3a'];
      const nx = Math.max(2, Math.round(w / 0.3));
      for (let i = 0; i < nx; i++) for (const z of [-0.2, 0.2]) {
        const x = -w / 2 + 0.15 + ((i + 0.5) * (w - 0.3)) / nx;
        p.push(S(x, z * d, 0.22, 0.22, 0.2, h - 0.2, GREEN, 'matte'), S(x, z * d, 0.1, 0.1, h - 0.06, 0.08, cols[(i + (z > 0 ? 2 : 0)) % cols.length], 'matte'));
      }
      return p;
    },
  },
  {
    id: 'vegetable_bed', name: 'Horta / canteiro elevado', category: 'Jardim', width: 2.4, depth: 1.0, height: 0.6,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.4, '#8b6b4a', 'wood'), B(0, 0, w - 0.08, d - 0.08, 0.4, 0.01, SOIL, 'matte'), ...[-0.35, -0.1, 0.15, 0.4].flatMap((x) => [-0.2, 0.2].map((z) => S(x * w, z * d, 0.2, 0.2, 0.4, h - 0.4, GREEN_L, 'matte')))],
  },
  {
    id: 'lawn', name: 'Gramado (placa de grama)', category: 'Jardim', width: 4, depth: 4, height: 0.03,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#7fb24a', 'matte')],
  },
  {
    id: 'gravel', name: 'Área de pedrisco / brita', category: 'Jardim', width: 2, depth: 2, height: 0.04,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#cfc8bb', 'matte')],
  },
  {
    id: 'stepping_stones', name: 'Caminho de pisantes', category: 'Jardim', width: 0.6, depth: 3.0, height: 0.04,
    parts: (w, d, h) => {
      const n = Math.max(2, Math.round(d / 0.6));
      return Array.from({ length: n }, (_, i) => B((i % 2 ? 0.06 : -0.06) * w, -d / 2 + ((i + 0.5) * d) / n, w * 0.75, (d / n) * 0.7, 0, h, STONE, 'ceramic'));
    },
  },
  {
    id: 'garden_path', name: 'Caminho de pedra (calçada)', category: 'Jardim', width: 1.2, depth: 4.0, height: 0.03,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#d6cfc2', 'ceramic')],
  },
  {
    id: 'deck', name: 'Deck de madeira', category: 'Jardim', width: 3, depth: 3, height: 0.12,
    parts: (w, d, h) => {
      const n = Math.max(3, Math.round(w / 0.15));
      return Array.from({ length: n }, (_, i) => B(-w / 2 + ((i + 0.5) * w) / n, 0, w / n - 0.01, d, 0, h, i % 2 ? '#9b6b43' : '#8b5e3c', 'wood'));
    },
  },
  {
    id: 'pot_large', name: 'Vaso grande com planta', category: 'Jardim', width: 0.6, depth: 0.6, height: 1.4,
    parts: (w, d, h) => [C(0, 0, w, d, 0, 0.55, '#7d7f82', 'ceramic'), ...crown(0, 0, w * 1.2, d * 1.2, 0.5, h - 0.5, GREEN)],
  },
  {
    id: 'pot_palm', name: 'Vaso com palmeira-ráfis', category: 'Jardim', width: 0.5, depth: 0.5, height: 1.7,
    parts: (w, d, h) => [C(0, 0, w, d, 0, 0.45, '#efe9df', 'ceramic'), ...[0, 1, 2, 3, 4].map((k) => C(Math.cos(k * 1.25) * 0.08, Math.sin(k * 1.25) * 0.08, 0.03, 0.03, 0.45, h - 0.6 - k * 0.08, '#6b5a3a', 'wood')), ...crown(0, 0, w * 1.4, d * 1.4, h - 0.6, 0.6, GREEN_L)],
  },
  {
    id: 'cactus', name: 'Cactos e suculentas', category: 'Jardim', width: 0.8, depth: 0.5, height: 0.9,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.25, '#c97b4a', 'ceramic'), C(-w / 4, 0, 0.14, 0.14, 0.25, h - 0.25, '#5f8f4e', 'matte'), C(-w / 4 + 0.1, 0, 0.08, 0.08, 0.45, 0.25, '#5f8f4e', 'matte'), S(w / 6, 0, 0.18, 0.18, 0.25, 0.12, '#8fb8a0', 'matte'), S(w / 3, 0.05, 0.14, 0.14, 0.25, 0.1, '#a7c49a', 'matte')],
  },
  {
    id: 'vertical_garden', name: 'Jardim vertical (parede verde)', category: 'Jardim', width: 2.0, depth: 0.15, height: 2.2,
    parts: (w, d, h) => {
      const p: Part[] = [B(0, -d / 4, w, d / 2, 0, h, '#5a4636', 'wood')];
      const nx = Math.max(2, Math.round(w / 0.3));
      const ny = Math.max(2, Math.round(h / 0.3));
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) p.push(S(-w / 2 + ((i + 0.5) * w) / nx, d / 4, w / nx + 0.06, d, ((j + 0.1) * h) / ny, h / ny + 0.05, [GREEN, GREEN_L, GREEN_D][(i + j) % 3], 'matte'));
      return p;
    },
  },
  {
    id: 'fountain', name: 'Fonte de água', category: 'Jardim', width: 1.4, depth: 1.4, height: 1.3,
    parts: (w, d, h) => [C(0, 0, w, d, 0, 0.45, STONE, 'ceramic'), C(0, 0, w - 0.15, d - 0.15, 0.42, 0.02, '#4fb3d9', 'glass'), C(0, 0, 0.18, 0.18, 0.45, h - 0.6, STONE, 'ceramic'), C(0, 0, 0.6, 0.6, h - 0.2, 0.12, STONE, 'ceramic')],
  },
  {
    id: 'water_mirror', name: 'Espelho d\'água / lago', category: 'Jardim', width: 3, depth: 1.5, height: 0.15,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#7d7f82', 'ceramic'), B(0, 0, w - 0.15, d - 0.15, h - 0.03, 0.02, '#3d8fbf', 'glass'), S(w / 4, 0, 0.3, 0.3, h - 0.02, 0.03, GREEN_L, 'matte')],
  },
  {
    id: 'pergola', name: 'Pergolado de madeira', category: 'Jardim', width: 3.5, depth: 3.0, height: 2.7,
    parts: (w, d, h) => {
      const p: Part[] = [...legs(w, d, 0.1, 0.14, h - 0.2, '#7a5233')];
      for (const s of [-1, 1]) p.push(B(0, s * (d / 2 - 0.1), w, 0.08, h - 0.2, 0.2, '#7a5233', 'wood'));
      const n = Math.max(4, Math.round(w / 0.35));
      for (let i = 0; i <= n; i++) p.push(B(-w / 2 + (i * w) / n, 0, 0.05, d + 0.3, h - 0.12, 0.12, '#8b5e3c', 'wood'));
      return p;
    },
  },
  {
    id: 'gazebo', name: 'Quiosque / gazebo', category: 'Jardim', width: 3.5, depth: 3.5, height: 3.2,
    parts: (w, d, h) => [C(0, 0, w, d, 0, 0.1, STONE, 'ceramic'), ...legs(w * 0.85, d * 0.85, 0.05, 0.12, h - 0.9, '#7a5233'), B(0, 0, w + 0.4, d + 0.4, h - 0.9, 0.1, '#7a5233', 'wood'), C(0, 0, (w + 0.4) * 1.1, (d + 0.4) * 1.1, h - 0.8, 0.5, '#a0522d', 'ceramic'), C(0, 0, w * 0.4, d * 0.4, h - 0.3, 0.3, '#8b4513', 'ceramic')],
  },
  {
    id: 'garden_bench', name: 'Banco de jardim', category: 'Jardim', width: 1.5, depth: 0.6, height: 0.85,
    parts: (w, d, h) => [B(0, 0.05, w, d - 0.15, 0.42, 0.05, '#8b5e3c', 'wood'), B(0, -d / 2 + 0.04, w, 0.05, 0.5, h - 0.5, '#8b5e3c', 'wood'), ...legs(w, d - 0.1, 0.08, 0.06, 0.42, '#2f3236', 'metal')],
  },
  {
    id: 'swing', name: 'Balanço', category: 'Jardim', width: 2.0, depth: 1.4, height: 2.2,
    parts: (w, d, h) => [B(0, 0, w, 0.1, h - 0.1, 0.1, '#7a5233', 'wood'), ...[-1, 1].flatMap((s) => [R(B(s * (w / 2 - 0.05), -d / 4, 0.08, 0.08, 0, h, '#7a5233', 'wood'), 0), R(B(s * (w / 2 - 0.05), d / 4, 0.08, 0.08, 0, h, '#7a5233', 'wood'), 0)]), B(0, 0, 0.6, 0.25, 0.45, 0.04, '#d9534f', 'wood'), B(-0.28, 0, 0.02, 0.02, 0.49, h - 0.59, '#9aa0a6', 'metal'), B(0.28, 0, 0.02, 0.02, 0.49, h - 0.59, '#9aa0a6', 'metal')],
  },
  {
    id: 'playground', name: 'Playground infantil', category: 'Jardim', width: 3.0, depth: 2.5, height: 2.6,
    parts: (w, _d, h) => [...legs(1.4, 1.4, 0.05, 0.1, 1.2, '#7a5233').map((p) => ({ ...p, x: p.x - w / 2 + 0.7 })), B(-w / 2 + 0.7, 0, 1.4, 1.4, 1.2, 0.06, '#8b5e3c', 'wood'), B(-w / 2 + 0.7, 0, 1.5, 1.5, h - 0.15, 0.15, '#d9534f', 'ceramic'), ...legs(1.4, 1.4, 0.05, 0.08, h - 0.15, '#7a5233').map((p) => ({ ...p, x: p.x - w / 2 + 0.7, y: (h - 0.15) / 2 })), B(0.6, 0, w - 1.4, 0.5, 0, 0.6, '#f2c14e', 'ceramic')],
  },
  {
    id: 'garden_light', name: 'Balizador de jardim', category: 'Jardim', width: 0.15, depth: 0.15, height: 0.6,
    light: { y: 0.55, color: '#ffe2a8', intensity: 1.5 },
    parts: (w, d, h) => [C(0, 0, w, d, 0, h - 0.1, '#2f3236', 'metal'), C(0, 0, w, d, h - 0.1, 0.1, '#fff4d6', 'glass')],
  },
  {
    id: 'lamp_post', name: 'Poste de jardim', category: 'Jardim', width: 0.3, depth: 0.3, height: 2.6,
    light: { y: 2.4, color: '#ffe2a8', intensity: 3 },
    parts: (w, d, h) => [C(0, 0, 0.08, 0.08, 0, h - 0.3, '#2f3236', 'metal'), S(0, 0, w, d, h - 0.35, 0.35, '#fff4d6', 'glass')],
  },
  {
    id: 'wood_fence', name: 'Cerca de madeira', category: 'Jardim', width: 2.0, depth: 0.08, height: 1.2,
    parts: (w, d, h) => {
      const n = Math.max(3, Math.round(w / 0.12));
      const p: Part[] = Array.from({ length: n }, (_, i) => B(-w / 2 + ((i + 0.5) * w) / n, 0, w / n - 0.03, d * 0.5, 0, h, '#9b7653', 'wood'));
      p.push(B(0, -d / 2 + 0.01, w, 0.02, h * 0.2, 0.08, '#7a5233', 'wood'), B(0, -d / 2 + 0.01, w, 0.02, h * 0.75, 0.08, '#7a5233', 'wood'));
      return p;
    },
  },
  {
    id: 'water_tank_garden', name: 'Cisterna / reservatório de chuva', category: 'Jardim', width: 1.2, depth: 1.2, height: 1.5,
    parts: (w, d, h) => [C(0, 0, w, d, 0, h, '#3f6f9a', 'matte'), C(0, 0, w * 0.4, d * 0.4, h, 0.06, '#2f3236', 'matte')],
  },

  // ---------- Garagem ----------
  {
    id: 'parking_space', name: 'Vaga de garagem demarcada (2,50 × 5,00)', category: 'Garagem', width: 2.5, depth: 5.0, height: 0.01,
    parts: (w, d, h) => [B(-w / 2 + 0.05, 0, 0.1, d, 0, h, '#f2c14e', 'matte'), B(w / 2 - 0.05, 0, 0.1, d, 0, h, '#f2c14e', 'matte'), B(0, -d / 2 + 0.05, w, 0.1, 0, h, '#f2c14e', 'matte'), B(0, -d / 2 + 0.6, w * 0.6, 0.12, 0, h + 0.1, '#5b5f63', 'ceramic')],
  },
  {
    id: 'car_suv', name: 'Carro SUV / caminhonete', category: 'Garagem', width: 1.9, depth: 4.7, height: 1.75,
    parts: (w, d, h) => car(w, d, h, '#7a8288', true),
  },
  {
    id: 'car_hatch', name: 'Carro compacto (hatch)', category: 'Garagem', width: 1.7, depth: 3.9, height: 1.5,
    parts: (w, d, h) => car(w, d, h, '#b53a3a'),
  },
  {
    id: 'motorcycle', name: 'Moto', category: 'Garagem', width: 0.8, depth: 2.1, height: 1.15,
    parts: (w, d, h) => [
      S(0, d / 2 - 0.32, 0.12, 0.6, 0, 0.6, '#1b1b1b', 'matte'),
      S(0, -d / 2 + 0.32, 0.14, 0.6, 0, 0.6, '#1b1b1b', 'matte'),
      B(0, 0, 0.3, d * 0.55, 0.45, 0.35, '#c0392b', 'metal'), B(0, -0.2, 0.28, 0.6, 0.8, 0.08, '#222', 'fabric'), B(0, d / 2 - 0.45, w, 0.04, h - 0.1, 0.04, '#5b5f63', 'metal'),
    ],
  },
  {
    id: 'bicycle', name: 'Bicicleta', category: 'Garagem', width: 0.6, depth: 1.75, height: 1.05,
    parts: (w, d, h) => [
      S(0, d / 2 - 0.35, 0.04, 0.7, 0, 0.7, '#1b1b1b', 'matte'),
      S(0, -d / 2 + 0.35, 0.04, 0.7, 0, 0.7, '#1b1b1b', 'matte'),
      B(0, 0, 0.04, d - 0.7, 0.55, 0.04, '#2f7cf6', 'metal'), B(0, -0.15, 0.1, 0.25, 0.9, 0.05, '#222', 'fabric'), B(0, d / 2 - 0.4, w, 0.03, h - 0.03, 0.03, '#5b5f63', 'metal'),
    ],
  },
  {
    id: 'bike_rack', name: 'Suporte de bicicletas (parede)', category: 'Garagem', width: 1.5, depth: 0.5, height: 1.8,
    parts: (w, d, h) => [B(0, -d / 2 + 0.02, w, 0.04, 0.6, h - 0.6, '#5b5f63', 'metal'), ...[-0.3, 0, 0.3].map((x) => B(x * w, 0, 0.04, d, h - 0.3, 0.04, '#5b5f63', 'metal'))],
  },
  {
    id: 'workbench', name: 'Bancada de ferramentas', category: 'Garagem', width: 1.8, depth: 0.7, height: 1.9,
    parts: (w, d, h) => [B(0, 0, w, d, 0.85, 0.05, '#a0784f', 'wood'), ...legs(w, d, 0.05, 0.06, 0.85, '#3a3f44', 'metal'), B(0, 0, w - 0.1, d - 0.1, 0.15, 0.03, '#a0784f', 'wood'), B(0, -d / 2 + 0.02, w, 0.03, 0.9, h - 0.9, '#c9ced3', 'metal'), ...[-0.5, -0.2, 0.15, 0.45].map((x, i) => B(x * w, -d / 2 + 0.05, 0.04, 0.03, 1.3 + (i % 2) * 0.2, 0.25, ['#c0392b', '#2f7cf6', '#f2c14e', '#27ae60'][i], 'metal'))],
  },
  {
    id: 'steel_shelf', name: 'Estante de aço (5 prateleiras)', category: 'Garagem', width: 0.9, depth: 0.4, height: 2.0,
    parts: (w, d, h) => [...legs(w, d, 0.02, 0.03, h, '#8a9097', 'metal'), ...[0, 1, 2, 3, 4].map((i) => B(0, 0, w, d, 0.1 + (i * (h - 0.15)) / 4, 0.02, '#a3a9af', 'metal')), B(-0.2, 0, 0.35, 0.3, 0.12, 0.25, '#b5653a', 'matte'), B(0.2, 0, 0.3, 0.3, 0.12 + (h - 0.15) / 4, 0.2, '#2f7cf6', 'matte')],
  },
  {
    id: 'garage_cabinet', name: 'Armário de garagem', category: 'Garagem', width: 1.2, depth: 0.5, height: 2.0,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#4a4d52', 'metal'), B(0, d / 2 + 0.003, 0.006, 0.006, 0.05, h - 0.1, '#222')],
  },
  {
    id: 'tool_panel', name: 'Painel de ferramentas (parede)', category: 'Garagem', width: 1.2, depth: 0.05, height: 0.9, elevation: 1.1,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#d7c7a8', 'wood'), ...[-0.4, -0.15, 0.1, 0.35].map((x, i) => B(x * w, d / 2 + 0.01, 0.05, 0.02, 0.2, 0.4, ['#c0392b', '#5b5f63', '#f2c14e', '#2f7cf6'][i], 'metal'))],
  },
  {
    id: 'ev_charger', name: 'Carregador de carro elétrico', category: 'Garagem', width: 0.3, depth: 0.15, height: 0.4, elevation: 1.1,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#f4f5f6', 'ceramic'), B(0, d / 2 + 0.003, w * 0.5, 0.006, h * 0.6, 0.05, '#27ae60', 'glass')],
  },
  {
    id: 'trash_bins', name: 'Lixeiras de coleta seletiva', category: 'Garagem', width: 1.6, depth: 0.55, height: 1.0,
    parts: (w, _d, h) => ['#2f7cf6', '#c0392b', '#f2c14e', '#27ae60'].map((c, i) => B(-w / 2 + ((i + 0.5) * w) / 4, 0, w / 4 - 0.04, 0.5, 0, h, c, 'matte')),
  },
  {
    id: 'car_lift', name: 'Elevador automotivo', category: 'Garagem', width: 3.2, depth: 1.2, height: 2.8,
    parts: (w, d, h) => [B(-w / 2 + 0.15, 0, 0.3, 0.5, 0, h, '#c0392b', 'metal'), B(w / 2 - 0.15, 0, 0.3, 0.5, 0, h, '#c0392b', 'metal'), B(0, 0, w, 0.3, h - 0.15, 0.15, '#c0392b', 'metal'), B(0, 0, w - 0.6, d, 0, 0.06, '#5b5f63', 'metal')],
  },

  // ---------- Vidros e divisórias ----------
  {
    id: 'glass_partition', name: 'Divisória de vidro temperado', category: 'Vidros e divisórias', width: 1.5, depth: 0.05, height: 2.6,
    parts: (w, d, h) => [B(0, 0, w, 0.01, 0.02, h - 0.04, GLASS, 'glass'), B(0, 0, w, d, 0, 0.03, '#2f3236', 'metal'), B(0, 0, w, d, h - 0.03, 0.03, '#2f3236', 'metal')],
  },
  {
    id: 'glass_wall_framed', name: 'Parede de vidro com caixilhos (estilo industrial)', category: 'Vidros e divisórias', width: 3.0, depth: 0.06, height: 2.6,
    parts: (w, d, h) => {
      const p: Part[] = [B(0, 0, w, 0.01, 0, h, GLASS, 'glass')];
      const n = Math.max(2, Math.round(w / 0.75));
      for (let i = 0; i <= n; i++) p.push(B(-w / 2 + (i * w) / n, 0, 0.04, d, 0, h, BLACK, 'metal'));
      for (const y of [0, h * 0.35, h * 0.7, h - 0.04]) p.push(B(0, 0, w, d, y, 0.04, BLACK, 'metal'));
      return p;
    },
  },
  {
    id: 'shower_glass', name: 'Box de vidro (blindex) em L', category: 'Vidros e divisórias', width: 1.2, depth: 0.9, height: 1.9,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.02, '#e6e1d8', 'ceramic'), B(0, d / 2 - 0.01, w, 0.01, 0.02, h, GLASS, 'glass'), B(w / 2 - 0.01, 0, 0.01, d, 0.02, h, GLASS, 'glass'), B(0, d / 2 - 0.01, w, 0.03, h, 0.03, STEEL, 'metal'), B(w / 2 - 0.01, 0, 0.03, d, h, 0.03, STEEL, 'metal')],
  },
  {
    id: 'shower_glass_straight', name: 'Box de vidro reto (frontal)', category: 'Vidros e divisórias', width: 1.4, depth: 0.05, height: 1.9,
    parts: (w, d, h) => [B(-w / 4, -0.01, w / 2, 0.01, 0.02, h, GLASS, 'glass'), B(w / 4, 0.01, w / 2, 0.01, 0.02, h, GLASS, 'glass'), B(0, 0, w, d, h, 0.03, STEEL, 'metal')],
  },
  {
    id: 'glass_railing', name: 'Guarda-corpo de vidro (1,10 m)', category: 'Vidros e divisórias', width: 2.0, depth: 0.06, height: 1.1,
    parts: (w, d, h) => [B(0, 0, w, 0.012, 0.05, h - 0.1, GLASS, 'glass'), B(0, 0, w, d, h - 0.05, 0.05, STEEL, 'metal'), B(0, 0, w, d, 0, 0.05, STEEL, 'metal')],
  },
  {
    id: 'steel_railing', name: 'Guarda-corpo metálico', category: 'Vidros e divisórias', width: 2.0, depth: 0.05, height: 1.1,
    parts: (w, d, h) => {
      const n = Math.max(3, Math.round(w / 0.11));
      const p: Part[] = [B(0, 0, w, d, h - 0.04, 0.04, '#2f3236', 'metal'), B(0, 0, w, d, 0.05, 0.03, '#2f3236', 'metal')];
      for (let i = 0; i <= n; i++) p.push(B(-w / 2 + (i * w) / n, 0, 0.015, 0.015, 0.05, h - 0.09, '#2f3236', 'metal'));
      return p;
    },
  },
  {
    id: 'cobogo', name: 'Parede de cobogó', category: 'Vidros e divisórias', width: 2.0, depth: 0.1, height: 2.6,
    parts: (w, d, h) => {
      const p: Part[] = [];
      const nx = Math.max(2, Math.round(w / 0.25));
      const ny = Math.max(2, Math.round(h / 0.25));
      for (let i = 0; i <= nx; i++) p.push(B(-w / 2 + (i * w) / nx, 0, 0.03, d, 0, h, '#ece7df', 'ceramic'));
      for (let j = 0; j <= ny; j++) p.push(B(0, 0, w, d, Math.min(h - 0.03, (j * h) / ny), 0.03, '#ece7df', 'ceramic'));
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) p.push(C(-w / 2 + ((i + 0.5) * w) / nx, 0, 0.08, d * 0.8, ((j + 0.5) * h) / ny - 0.04, 0.08, '#e2dbcf', 'ceramic'));
      return p;
    },
  },
  {
    id: 'slatted_panel', name: 'Painel ripado de madeira (divisória)', category: 'Vidros e divisórias', width: 1.8, depth: 0.05, height: 2.6,
    parts: (w, d, h) => {
      const n = Math.max(3, Math.round(w / 0.08));
      return Array.from({ length: n }, (_, i) => B(-w / 2 + ((i + 0.5) * w) / n, 0, (w / n) * 0.55, d, 0, h, '#8b5e3c', 'wood'));
    },
  },
  {
    id: 'glass_shelf_wall', name: 'Nicho / estante com vidro', category: 'Vidros e divisórias', width: 1.2, depth: 0.35, height: 2.2,
    parts: (w, d, h) => [B(-w / 2 + 0.015, 0, 0.03, d, 0, h, WOOD_DARK, 'wood'), B(w / 2 - 0.015, 0, 0.03, d, 0, h, WOOD_DARK, 'wood'), ...[0, 1, 2, 3, 4].map((i) => B(0, 0, w - 0.06, d, (i * (h - 0.02)) / 4, 0.02, GLASS, 'glass'))],
  },

  // ---------- Sala ----------
  {
    id: 'sofa_retractable', name: 'Sofá retrátil e reclinável 4 lugares', category: 'Sala', width: 2.6, depth: 1.05, height: 0.95,
    parts: (w, d, h) => sofa(w, d, h, 4, '#5f6b77'),
  },
  {
    id: 'sofa_chaise', name: 'Sofá com chaise', category: 'Sala', width: 2.4, depth: 1.6, height: 0.85,
    parts: (w, d, h) => [...sofa(w, 0.9, h, 3, '#a39282').map((p) => ({ ...p, z: p.z - (d - 0.9) / 2 })), B(w / 2 - 0.4, 0.45, 0.8, d - 0.9, 0.1, 0.42, '#a39282', 'fabric')],
  },
  {
    id: 'tv_panel', name: 'Painel de TV com rack', category: 'Sala', width: 2.2, depth: 0.45, height: 2.2,
    parts: (w, d, h) => [B(0, -d / 2 + 0.02, w, 0.04, 0, h, '#8b5e3c', 'wood'), B(0, 0, w * 0.9, d - 0.05, 0.25, 0.45, '#3b3f45', 'wood'), B(0, -d / 2 + 0.06, 1.25, 0.04, 1.0, 0.72, BLACK, 'glass')],
  },
  {
    id: 'aparador', name: 'Aparador', category: 'Sala', width: 1.4, depth: 0.4, height: 0.8,
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.04, 0.04, '#8b5e3c', 'wood'), ...legs(w, d, 0.04, 0.04, h - 0.04, BLACK, 'metal')],
  },
  {
    id: 'bean_bag', name: 'Puff pera', category: 'Sala', width: 0.8, depth: 0.8, height: 0.9,
    parts: (w, d, h) => [S(0, 0, w, d, 0, h * 0.65, '#d98c3a', 'fabric'), S(0, -0.12, w * 0.7, d * 0.5, h * 0.35, h * 0.65, '#d98c3a', 'fabric')],
  },
  {
    id: 'pool_table', name: 'Mesa de sinuca', category: 'Sala', width: 1.4, depth: 2.5, height: 0.8,
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.15, 0.15, '#5a3d27', 'wood'), B(0, 0, w - 0.2, d - 0.2, h, 0.01, '#2e7d4f', 'fabric'), ...legs(w, d, 0.15, 0.14, h - 0.15, '#5a3d27')],
  },
  {
    id: 'aquarium', name: 'Aquário', category: 'Sala', width: 1.2, depth: 0.45, height: 1.4,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.8, BLACK, 'wood'), B(0, 0, w, d, 0.8, h - 0.85, '#7cc6e6', 'glass'), B(0, 0, w, d, h - 0.05, 0.05, BLACK, 'wood')],
  },
  {
    id: 'bar_cart', name: 'Carrinho bar', category: 'Sala', width: 0.7, depth: 0.45, height: 0.85,
    parts: (w, d, h) => [...legs(w, d, 0.02, 0.025, h, '#b8860b', 'metal'), B(0, 0, w, d, 0.15, 0.02, GLASS, 'glass'), B(0, 0, w, d, h - 0.02, 0.02, GLASS, 'glass')],
  },

  // ---------- Quarto ----------
  {
    id: 'wardrobe_sliding', name: 'Guarda-roupa 3 portas de correr', category: 'Quarto', width: 2.4, depth: 0.6, height: 2.3,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#e9e4dc', 'wood'), ...[-1, 0, 1].map((i) => B((i * w) / 3, d / 2 + 0.01 + (i === 0 ? 0.02 : 0), w / 3, 0.02, 0.03, h - 0.06, i === 0 ? '#cfe3ee' : '#ddd5c8', i === 0 ? 'glass' : 'wood'))],
  },
  {
    id: 'trundle_bed', name: 'Bicama', category: 'Quarto', width: 0.95, depth: 2.0, height: 0.75,
    parts: (w, d, h) => [B(0, 0, w, d, 0, 0.42, '#e9e4dc', 'wood'), B(0, 0.02, w - 0.04, d - 0.06, 0.42, 0.15, '#f4f1ea', 'fabric'), B(0, -d / 2 + 0.03, w, 0.06, 0, h, '#e9e4dc', 'wood'), B(0, -d / 2 + 0.3, w - 0.2, 0.3, 0.57, 0.1, '#ffffff', 'fabric')],
  },
  {
    id: 'changing_dresser', name: 'Cômoda com trocador', category: 'Quarto', width: 1.0, depth: 0.55, height: 1.0,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h - 0.1, WHITE, 'wood'), B(0, 0, w, d, h - 0.1, 0.1, '#bfe0f2', 'fabric')],
  },
  {
    id: 'headboard', name: 'Cabeceira estofada (painel)', category: 'Quarto', width: 2.0, depth: 0.1, height: 1.3,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#b9a99a', 'fabric'), ...[-1, 0, 1].map((i) => B((i * w) / 3, d / 2 + 0.002, 0.004, 0.004, 0.1, h - 0.2, '#a39282'))],
  },
  {
    id: 'kids_desk', name: 'Escrivaninha infantil', category: 'Quarto', width: 1.0, depth: 0.5, height: 0.6,
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.03, 0.03, '#f2c14e', 'wood'), ...legs(w, d, 0.03, 0.04, h - 0.03, WHITE)],
  },
  {
    id: 'toy_chest', name: 'Baú de brinquedos', category: 'Quarto', width: 0.8, depth: 0.45, height: 0.5,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#7fb2e5', 'wood'), B(0, 0, w + 0.02, d + 0.02, h - 0.04, 0.04, '#f2c14e', 'wood')],
  },

  // ---------- Banheiro ----------
  {
    id: 'double_vanity', name: 'Bancada com 2 cubas', category: 'Banheiro', width: 1.6, depth: 0.5, height: 0.85,
    parts: (w, d, h) => [B(0, -0.03, w, d - 0.06, 0.25, h - 0.28, '#8b6b4a', 'wood'), B(0, 0, w, d, h - 0.03, 0.03, MARBLE, 'ceramic'), C(-w / 4, 0.03, 0.4, 0.32, h, 0.12, WHITE, 'ceramic'), C(w / 4, 0.03, 0.4, 0.32, h, 0.12, WHITE, 'ceramic')],
  },
  {
    id: 'pcd_toilet', name: 'Bacia acessível com barras (NBR 9050)', category: 'Banheiro', width: 0.8, depth: 0.7, height: 0.8,
    parts: (w, d, h) => [B(0, -d / 2 + 0.1, 0.38, 0.2, 0.36, 0.4, WHITE, 'ceramic'), C(0, 0.08, 0.38, 0.5, 0, 0.46, WHITE, 'ceramic'), B(w / 2 - 0.03, 0, 0.04, 0.8, h - 0.05, 0.04, STEEL, 'metal'), B(0, -d / 2 + 0.03, 0.8, 0.04, h - 0.05, 0.04, STEEL, 'metal')],
  },
  {
    id: 'towel_rail', name: 'Toalheiro térmico', category: 'Banheiro', width: 0.5, depth: 0.08, height: 0.9, elevation: 0.6,
    parts: (w, d, h) => [B(-w / 2 + 0.02, 0, 0.03, d, 0, h, STEEL, 'metal'), B(w / 2 - 0.02, 0, 0.03, d, 0, h, STEEL, 'metal'), ...[0.1, 0.3, 0.5, 0.7, 0.85].map((y) => C(0, 0, w, 0.025, y * h, 0.025, STEEL, 'metal'))],
  },
  {
    id: 'washbasin_column', name: 'Lavatório de coluna', category: 'Banheiro', width: 0.5, depth: 0.45, height: 0.85,
    parts: (w, d, h) => [C(0, 0, 0.2, 0.2, 0, h - 0.15, WHITE, 'ceramic'), B(0, 0, w, d, h - 0.15, 0.15, WHITE, 'ceramic')],
  },

  // ---------- Lavanderia ----------
  {
    id: 'tanque_inox', name: 'Tanque com bancada e armário', category: 'Lavanderia', width: 1.2, depth: 0.6, height: 0.9,
    parts: (w, d, h) => [B(0, -0.02, w, d - 0.04, 0, h - 0.03, WHITE, 'wood'), B(0, 0, w, d, h - 0.03, 0.03, GRANITE, 'ceramic'), B(-w / 4, 0.02, 0.5, 0.42, h - 0.02, 0.01, '#9aa3ab', 'metal')],
  },
  {
    id: 'ironing_board', name: 'Tábua de passar', category: 'Lavanderia', width: 1.3, depth: 0.4, height: 0.9,
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.03, 0.03, '#7fb2e5', 'fabric'), B(0, 0, 0.03, d * 0.6, 0, h - 0.03, STEEL, 'metal')],
  },
  {
    id: 'gas_heater', name: 'Aquecedor a gás de passagem', category: 'Lavanderia', width: 0.4, depth: 0.2, height: 0.65, elevation: 1.4,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#f4f5f6', 'ceramic'), C(0, 0, 0.1, 0.1, h, 0.3, STEEL, 'metal')],
  },
  {
    id: 'clothesline_ceiling', name: 'Varal de teto', category: 'Lavanderia', width: 1.2, depth: 0.6, height: 0.1, elevation: 2.2,
    parts: (w, d, h) => [...[-0.25, -0.08, 0.08, 0.25].map((z) => C(0, z, w, 0.02, h / 2, 0.02, STEEL, 'metal')), B(-w / 2, 0, 0.04, d, 0, h, '#888', 'metal'), B(w / 2, 0, 0.04, d, 0, h, '#888', 'metal')],
  },

  // ---------- Escritório ----------
  {
    id: 'meeting_table', name: 'Mesa de reunião (6 pessoas)', category: 'Escritório', width: 2.0, depth: 1.0, height: 0.75,
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.03, 0.03, WHITE, 'wood'), B(-w / 2 + 0.3, 0, 0.06, d - 0.2, 0, h - 0.03, BLACK, 'metal'), B(w / 2 - 0.3, 0, 0.06, d - 0.2, 0, h - 0.03, BLACK, 'metal')],
  },
  {
    id: 'gamer_chair', name: 'Cadeira gamer', category: 'Escritório', width: 0.7, depth: 0.7, height: 1.35,
    parts: (w, d, h) => [C(0, 0, w, d, 0, 0.08, BLACK, 'metal'), C(0, 0, 0.06, 0.06, 0.08, 0.35, '#555', 'metal'), B(0, 0.05, 0.55, 0.5, 0.43, 0.1, BLACK, 'fabric'), B(0, -d / 2 + 0.12, 0.55, 0.12, 0.5, h - 0.5, '#c0392b', 'fabric')],
  },
  {
    id: 'drafting_table', name: 'Prancheta de desenho', category: 'Escritório', width: 1.2, depth: 0.8, height: 1.0,
    parts: (w, d, h) => [{ ...B(0, 0, w, d, h - 0.05, 0.03, '#f4f1ea', 'wood'), ry: 0 }, ...legs(w, d, 0.05, 0.04, h - 0.05, '#3a3f44', 'metal')],
  },

  // ---------- Iluminação ----------
  {
    id: 'pendant', name: 'Pendente', category: 'Iluminação', width: 0.4, depth: 0.4, height: 0.9, elevation: 1.7,
    light: { y: 0.1, color: '#ffe2a8', intensity: 2.5 },
    parts: (w, d, h) => [C(0, 0, 0.01, 0.01, 0.25, h - 0.25, BLACK, 'metal'), C(0, 0, w, d, 0, 0.25, BLACK, 'metal')],
  },
  {
    id: 'pendant_trio', name: 'Pendentes em trio (balcão)', category: 'Iluminação', width: 1.6, depth: 0.25, height: 0.9, elevation: 1.75,
    light: { y: 0.1, color: '#ffe2a8', intensity: 3 },
    parts: (w, d, h) => [-1, 0, 1].flatMap((i) => [C((i * w) / 3, 0, 0.01, 0.01, 0.2, h - 0.2, BLACK, 'metal'), S((i * w) / 3, 0, d, d, 0, 0.25, '#e6c27a', 'glass')]),
  },
  {
    id: 'spot_rail', name: 'Trilho de spots', category: 'Iluminação', width: 1.5, depth: 0.08, height: 0.15, elevation: 2.5,
    light: { y: 0, color: '#fff3d6', intensity: 2 },
    parts: (w, d, h) => [B(0, 0, w, d, h - 0.04, 0.04, BLACK, 'metal'), ...[-0.35, -0.12, 0.12, 0.35].map((x) => C(x * w, 0, 0.07, 0.07, 0, h - 0.04, BLACK, 'metal'))],
  },
  {
    id: 'wall_sconce', name: 'Arandela', category: 'Iluminação', width: 0.2, depth: 0.12, height: 0.25, elevation: 1.8,
    light: { y: 0.1, color: '#ffe2a8', intensity: 1.2 },
    parts: (w, d, h) => [B(0, -d / 2 + 0.01, 0.08, 0.02, 0.05, 0.15, BLACK, 'metal'), C(0, 0, w * 0.6, d, 0, h, '#f4e3c3', 'glass')],
  },

  // ---------- Decoração ----------
  {
    id: 'painting', name: 'Quadro', category: 'Decoração', width: 1.0, depth: 0.03, height: 0.7, elevation: 1.3,
    parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#2f3236', 'wood'), B(-w * 0.1, d / 2 + 0.002, w * 0.5, 0.004, h * 0.2, h * 0.6, '#d98c3a'), B(w * 0.2, d / 2 + 0.002, w * 0.4, 0.004, h * 0.15, h * 0.5, '#2f7cf6')],
  },
  {
    id: 'rug_round', name: 'Tapete redondo', category: 'Decoração', width: 2.0, depth: 2.0, height: 0.01,
    parts: (w, d, h) => [C(0, 0, w, d, 0, h, '#c8b89d', 'fabric'), C(0, 0, w * 0.75, d * 0.75, 0.001, h, '#b3a084', 'fabric')],
  },
  {
    id: 'floor_vase', name: 'Vaso decorativo de chão', category: 'Decoração', width: 0.35, depth: 0.35, height: 0.9,
    parts: (w, d, h) => [S(0, 0, w, d, 0, h * 0.6, '#3e5f73', 'ceramic'), C(0, 0, w * 0.4, d * 0.4, h * 0.5, h * 0.25, '#3e5f73', 'ceramic'), ...[-0.05, 0.05].map((x) => C(x, 0, 0.01, 0.01, h * 0.7, h * 0.3, '#8b6b4a', 'wood'))],
  },
  {
    id: 'wall_niches', name: 'Nichos de parede', category: 'Decoração', width: 1.2, depth: 0.25, height: 0.9, elevation: 1.2,
    parts: (w, d, h) => [B(-w / 4, 0, w / 2 - 0.05, d, h / 2, h / 2, WOOD_LIGHT, 'wood'), B(w / 4, 0, w / 2 - 0.05, d, 0, h / 2, WOOD_LIGHT, 'wood')],
  },
);

// ---------- Escadas vazadas (espaço livre embaixo) e curva ----------
/** Converte degraus maciços em placa fina + laje dentada: libera o espaço sob a escada. */
function hollow(ps: Part[], t = 0.18): Part[] {
  return ps.map((p) => {
    const bottom = p.y - p.sy / 2;
    if (p.shape !== 'box' || Math.abs(bottom) > 1e-6 || p.sy <= t + 0.05 || p.material === 'metal') return p;
    const top = p.y + p.sy / 2;
    return { ...p, y: top - t / 2, sy: t };
  });
}
const stairById = (id: string) => CATALOG.find((c) => c.id === id)!;
CATALOG.push(
  {
    id: 'stair_open', name: 'Escada reta vazada (espaço útil embaixo)', category: 'Escadas', width: 0.9, depth: 4.34, height: 2.95, stair: true,
    footprint: (h) => stairById('stair').footprint!(h),
    parts: (w, d, h) => hollow(stairById('stair').parts(w, d, h)),
  },
  {
    id: 'stair_open_l', name: 'Escada em L vazada (espaço útil embaixo)', category: 'Escadas', width: 2.6, depth: 2.95, height: 2.95, stair: true,
    footprint: (h) => stairById('stair_l').footprint!(h),
    parts: (w, d, h) => hollow(stairById('stair_l').parts(w, d, h)),
  },
  {
    id: 'stair_open_u', name: 'Escada em U vazada (espaço útil embaixo)', category: 'Escadas', width: 1.9, depth: 2.95, height: 2.95, stair: true,
    footprint: (h) => stairById('stair_u').footprint!(h),
    parts: (w, d, h) => hollow(stairById('stair_u').parts(w, d, h)),
  },
  {
    id: 'stair_curved', name: 'Escada curva em meia-lua (vazada)', category: 'Escadas', width: 3.8, depth: 2.0, height: 2.95, stair: true,
    footprint: () => ({ width: 3.8, depth: 2.0 }),
    parts: (w, d, h) => {
      const { n, rise } = steps(h);
      const R = Math.min(w / 2, d - 0.05);
      const r0 = Math.max(0.5, R - 1.1);
      const rm = (R + r0) / 2;
      const cz = d / 2 - 0.05;
      const da = Math.PI / n;
      const parts: Part[] = [];
      for (let i = 0; i < n; i++) {
        const a = Math.PI + (i + 0.5) * da;
        const top = (i + 1) * rise;
        const at = (r: number) => ({ x: Math.cos(a) * r, z: cz + Math.sin(a) * r });
        const m = at(rm);
        parts.push({ shape: 'box', x: m.x, y: top - 0.03, z: m.z, sx: R - r0, sy: 0.06, sz: Math.max(0.2, rm * da * 1.08), color: stepColor(i), material: 'wood', ry: a });
        // longarinas curvas (externa e interna), logo abaixo dos degraus
        for (const r of [R - 0.04, r0 + 0.04]) {
          const q = at(r);
          parts.push({ shape: 'box', x: q.x, y: top - 0.2, z: q.z, sx: 0.08, sy: 0.28, sz: r * da * 1.12, color: '#3a3f44', material: 'metal', ry: a });
        }
        if (i % 2 === 0) {
          const q = at(R - 0.04);
          parts.push(C(q.x, q.z, 0.03, 0.03, top, 0.9, '#5b5f63', 'metal'));
        }
      }
      return parts;
    },
  },
);

// reorganiza itens antigos nas novas categorias
for (const c of CATALOG) {
  if (c.id === 'tree' || c.id === 'shrub') c.category = 'Jardim';
  if (c.id === 'car') {
    c.category = 'Garagem';
    c.name = 'Carro sedã';
  }
  if (['bbq', 'pool', 'lounger', 'patio_set'].includes(c.id)) c.category = 'Área gourmet';
  if (c.id === 'tree') c.name = 'Árvore (copa larga)';
  if (c.id === 'stair_u') c.name = 'Escada em U, lance duplo (2 lances + patamar)';
  if (c.id === 'bar_counter') c.name = 'Bancada americana (granito)';
}


// =====================================================================
// Muros, muretas, cercas e portões (v7). São desenhados em trechos pela
// ferramenta "Muro/cerca": cada trecho é um item cuja largura = comprimento.
// =====================================================================

const PLASTER = '#e8e2d6';
const COPING = '#cfc8bb';
const BRICK = '#a9583b';
const IRON = '#2f3236';

/** Posições de pilaretes/mourões ao longo do trecho (espaçamento máximo s). */
const posts = (w: number, s: number) => {
  const n = Math.max(1, Math.ceil(w / s));
  return Array.from({ length: n + 1 }, (_, i) => Math.max(-w / 2 + 0.08, Math.min(w / 2 - 0.08, -w / 2 + (i * w) / n)));
};
function blockWall(w: number, d: number, h: number, color = PLASTER, pier = shade(PLASTER, -10)): Part[] {
  return [B(0, 0, w, d, 0, h - 0.05, color, 'ceramic'), B(0, 0, w, d + 0.06, h - 0.05, 0.05, COPING, 'ceramic'), ...posts(w, 3).map((x) => B(x, 0, 0.2, d + 0.06, 0, h - 0.05, pier, 'ceramic'))];
}
function railing(w: number, y0: number, hh: number, gap = 0.11, color = IRON): Part[] {
  const n = Math.max(2, Math.round(w / gap));
  const p: Part[] = [B(0, 0, w, 0.04, y0, 0.04, color, 'metal'), B(0, 0, w, 0.04, y0 + hh - 0.04, 0.04, color, 'metal')];
  for (let i = 0; i <= n; i++) p.push(B(-w / 2 + 0.01 + (i * (w - 0.02)) / n, 0, 0.018, 0.018, y0, hh, color, 'metal'));
  return p;
}
function wires(w: number, y0: number, y1: number, k: number, color = '#9aa0a6'): Part[] {
  return Array.from({ length: k }, (_, i) => B(0, 0, w, 0.006, y0 + ((i + 0.5) * (y1 - y0)) / k, 0.006, color, 'metal'));
}

export type FenceQty = 'bloco' | 'tijolo' | 'pedra' | 'premoldado' | 'mureta' | 'mureta_gradil' | 'mureta_vidro' | 'gradil' | 'alambrado' | 'madeira' | 'arame' | 'viva' | 'bambu';

const FENCE = (item: Omit<CatalogItem, 'category' | 'fence'> & { qty: FenceQty }): CatalogItem => ({ ...item, category: 'Muros e cercas', fence: true, fenceQty: item.qty });
const GATE = (item: Omit<CatalogItem, 'category' | 'gate'>): CatalogItem => ({ ...item, category: 'Muros e cercas', gate: true });

CATALOG.push(
  FENCE({ id: 'muro_bloco', qty: 'bloco', name: 'Muro de bloco rebocado (2,00 m)', width: 3, depth: 0.15, height: 2.0, parts: (w, d, h) => blockWall(w, d, h) }),
  FENCE({ id: 'muro_alto', qty: 'bloco', name: 'Muro alto de divisa (2,50 m)', width: 3, depth: 0.15, height: 2.5, parts: (w, d, h) => blockWall(w, d, h, '#ddd6c8') }),
  FENCE({ id: 'muro_tijolo', qty: 'tijolo', name: 'Muro de tijolo aparente', width: 3, depth: 0.15, height: 1.8, parts: (w, d, h) => blockWall(w, d, h, BRICK, shade(BRICK, -15)) }),
  FENCE({ id: 'muro_pedra', qty: 'pedra', name: 'Muro de pedra', width: 3, depth: 0.35, height: 1.0, parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#8d8578', 'ceramic'), ...posts(w, 0.45).map((x, i) => S(x, (i % 2 ? 0.5 : -0.5) * d, 0.35, 0.12, h * (0.2 + (i % 3) * 0.25), 0.22, i % 2 ? '#7b7366' : '#a39a8b', 'ceramic'))] }),
  FENCE({
    id: 'muro_premoldado', qty: 'premoldado', name: 'Muro de placas pré-moldadas', width: 4, depth: 0.12, height: 2.0,
    parts: (w, d, h) => [B(0, 0, w, d * 0.6, 0, h, '#b9bbbd', 'ceramic'), ...posts(w, 2).map((x) => B(x, 0, 0.15, d + 0.04, 0, h + 0.05, '#a7a9ac', 'ceramic')), ...[0.5, 1.0, 1.5].filter((y) => y < h).map((y) => B(0, 0, w, d * 0.62, y, 0.015, '#9ea0a3', 'ceramic'))],
  }),
  FENCE({
    id: 'muro_eletrica', qty: 'bloco', name: 'Muro com cerca elétrica', width: 3, depth: 0.15, height: 2.6,
    parts: (w, d, h) => [...blockWall(w, d, h - 0.6), ...posts(w, 2.5).map((x) => B(x, 0, 0.02, 0.02, h - 0.65, 0.65, '#555', 'metal')), ...wires(w, h - 0.55, h, 5, '#c9ced3')],
  }),
  FENCE({
    id: 'muro_concertina', qty: 'bloco', name: 'Muro com concertina', width: 3, depth: 0.15, height: 2.45,
    parts: (w, d, h) => [...blockWall(w, d, h - 0.45), ...posts(w, 0.25).map((x) => C(x, 0, 0.02, 0.4, h - 0.45, 0.4, '#b9c0c7', 'metal'))],
  }),
  FENCE({ id: 'mureta', qty: 'mureta', name: 'Mureta (0,90 m)', width: 3, depth: 0.15, height: 0.9, parts: (w, d, h) => [B(0, 0, w, d, 0, h - 0.04, PLASTER, 'ceramic'), B(0, 0, w, d + 0.08, h - 0.04, 0.04, COPING, 'ceramic')] }),
  FENCE({ id: 'mureta_jardineira', qty: 'mureta', name: 'Mureta com jardineira', width: 3, depth: 0.45, height: 0.75, parts: (w, d, h) => [B(0, -d / 2 + 0.06, w, 0.12, 0, h, PLASTER, 'ceramic'), B(0, d / 2 - 0.06, w, 0.12, 0, h - 0.25, PLASTER, 'ceramic'), B(0, 0, w - 0.1, d - 0.24, 0, h - 0.3, SOIL, 'matte'), ...posts(w, 0.4).map((x, i) => S(x, 0, 0.32, 0.26, h - 0.3, 0.35, i % 2 ? GREEN : GREEN_L, 'matte'))] }),
  FENCE({ id: 'mureta_gradil', qty: 'mureta_gradil', name: 'Mureta com gradil (0,60 + 1,40 m)', width: 3, depth: 0.15, height: 2.0, parts: (w, d, h) => [B(0, 0, w, d, 0, 0.6, PLASTER, 'ceramic'), B(0, 0, w, d + 0.06, 0.6, 0.04, COPING, 'ceramic'), ...railing(w, 0.64, h - 0.64), ...posts(w, 3).map((x) => B(x, 0, 0.2, d + 0.06, 0, h, shade(PLASTER, -10), 'ceramic'))] }),
  FENCE({ id: 'mureta_vidro', qty: 'mureta_vidro', name: 'Mureta com vidro', width: 3, depth: 0.15, height: 1.6, parts: (w, d, h) => [B(0, 0, w, d, 0, 0.6, PLASTER, 'ceramic'), B(0, 0, w, d + 0.04, 0.6, 0.04, COPING, 'ceramic'), B(0, 0, w, 0.012, 0.64, h - 0.64, GLASS, 'glass'), B(0, 0, w, 0.05, h - 0.03, 0.03, STEEL, 'metal')] }),
  FENCE({ id: 'gradil', qty: 'gradil', name: 'Gradil metálico', width: 3, depth: 0.06, height: 1.8, parts: (w, _d, h) => [...railing(w, 0.05, h - 0.05), ...posts(w, 2).map((x) => B(x, 0, 0.05, 0.05, 0, h + 0.05, IRON, 'metal'))] }),
  FENCE({ id: 'gradil_lanca', qty: 'gradil', name: 'Gradil com ponta de lança', width: 3, depth: 0.06, height: 2.0, parts: (w, _d, h) => [...railing(w, 0.05, h - 0.2, 0.12), ...posts(w, 0.12).map((x) => B(x, 0, 0.03, 0.03, h - 0.18, 0.15, IRON, 'metal')), ...posts(w, 2).map((x) => B(x, 0, 0.06, 0.06, 0, h, IRON, 'metal'))] }),
  FENCE({ id: 'alambrado', qty: 'alambrado', name: 'Alambrado (tela + mourões)', width: 3, depth: 0.1, height: 2.0, parts: (w, _d, h) => [B(0, 0, w, 0.01, 0.05, h - 0.1, '#8a949c', 'glass'), ...posts(w, 2.5).map((x) => B(x, 0, 0.1, 0.1, 0, h, '#a7a9ac', 'ceramic')), B(0, 0, w, 0.02, h - 0.05, 0.03, '#7a8288', 'metal')] }),
  FENCE({ id: 'cerca_madeira', qty: 'madeira', name: 'Cerca de madeira (estacas)', width: 3, depth: 0.08, height: 1.1, parts: (w, _d, h) => [...posts(w, 0.14).map((x) => B(x, 0, 0.09, 0.025, 0, h, '#e9e4dc', 'wood')), B(0, -0.03, w, 0.02, h * 0.25, 0.07, '#d8d2c8', 'wood'), B(0, -0.03, w, 0.02, h * 0.7, 0.07, '#d8d2c8', 'wood')] }),
  FENCE({ id: 'cerca_ripada', qty: 'madeira', name: 'Cerca ripada de madeira (privacidade)', width: 3, depth: 0.08, height: 1.8, parts: (w, _d, h) => [...posts(w, 2).map((x) => B(x, 0, 0.08, 0.08, 0, h, '#5a3d27', 'wood')), ...Array.from({ length: Math.round(h / 0.12) }, (_, i) => B(0, 0.02, w, 0.02, i * 0.12 + 0.02, 0.09, i % 2 ? '#8b5e3c' : '#9b6b43', 'wood'))] }),
  FENCE({ id: 'cerca_bambu', qty: 'bambu', name: 'Cerca de bambu', width: 3, depth: 0.08, height: 1.8, parts: (w, _d, h) => posts(w, 0.06).map((x, i) => C(x, 0, 0.05, 0.05, 0, h - (i % 3) * 0.05, i % 2 ? '#c2b067' : '#b3a25a', 'wood')) }),
  FENCE({ id: 'cerca_arame', qty: 'arame', name: 'Cerca de arame (rural)', width: 5, depth: 0.1, height: 1.4, parts: (w, _d, h) => [...posts(w, 2.5).map((x) => C(x, 0, 0.1, 0.1, 0, h, '#7a5233', 'wood')), ...wires(w, 0.2, h, 4)] }),
  FENCE({ id: 'cerca_viva_trecho', qty: 'viva', name: 'Cerca viva (trecho)', width: 3, depth: 0.6, height: 1.5, parts: (w, d, h) => [B(0, 0, w, d, 0, h, GREEN_D, 'matte'), ...posts(w, 0.6).map((x, i) => S(x, 0, 0.7, d + 0.08, h * 0.4, h * 0.65, i % 2 ? GREEN : shade(GREEN_D, 10), 'matte'))] }),

  GATE({ id: 'portao_social', name: 'Portão social (pedestre)', width: 1.0, depth: 0.15, height: 2.0, parts: (w, _d, h) => [B(-w / 2 + 0.03, 0, 0.06, 0.06, 0, h, IRON, 'metal'), B(w / 2 - 0.03, 0, 0.06, 0.06, 0, h, IRON, 'metal'), ...railing(w - 0.1, 0.05, h - 0.1, 0.1)] }),
  GATE({
    id: 'portao_correr_muro', name: 'Portão de garagem de correr (no muro)', width: 3.0, depth: 0.15, height: 2.0,
    parts: (w, _d, h) => [...railing(w, 0.08, h - 0.1, 0.1), B(0, 0, w, 0.08, 0, 0.05, '#555', 'metal'), B(w * 0.75, 0.12, w * 0.5, 0.03, 0, 0.03, '#777', 'metal')],
  }),
  GATE({
    id: 'portao_basculante_muro', name: 'Portão basculante (no muro)', width: 2.8, depth: 0.15, height: 2.2,
    parts: (w, _d, h) => [B(0, 0, w, 0.05, 0.03, h - 0.05, '#4a4d52', 'metal'), ...Array.from({ length: Math.round(h / 0.25) }, (_, i) => B(0, 0.03, w - 0.06, 0.01, 0.15 + i * 0.25, 0.03, '#3a3d42', 'metal'))],
  }),
  GATE({
    id: 'portao_2folhas', name: 'Portão de 2 folhas (abrir)', width: 3.0, depth: 0.15, height: 2.0,
    parts: (w, _d, h) => [...railing(w / 2 - 0.02, 0.05, h - 0.1, 0.1).map((p) => ({ ...p, x: p.x - w / 4 })), ...railing(w / 2 - 0.02, 0.05, h - 0.1, 0.1).map((p) => ({ ...p, x: p.x + w / 4 }))],
  }),
  GATE({ id: 'portao_madeira', name: 'Portão de madeira', width: 1.0, depth: 0.1, height: 1.8, parts: (w, _d, h) => [...Array.from({ length: Math.round(w / 0.1) }, (_, i) => B(-w / 2 + 0.05 + i * 0.1, 0, 0.08, 0.03, 0.05, h - 0.05, '#8b5e3c', 'wood')), B(0, -0.03, w, 0.02, 0.3, 0.1, '#6e4f33', 'wood'), B(0, -0.03, w, 0.02, h - 0.4, 0.1, '#6e4f33', 'wood')] }),
  GATE({ id: 'porteira', name: 'Porteira (rural)', width: 3.0, depth: 0.12, height: 1.3, parts: (w, _d, h) => [...[0.2, 0.5, 0.8, 1.1].filter((y) => y < h).map((y) => B(0, 0, w, 0.05, y, 0.1, '#9b7653', 'wood')), B(-w / 2 + 0.05, 0, 0.1, 0.06, 0, h, '#7a5233', 'wood'), B(w / 2 - 0.05, 0, 0.1, 0.06, 0, h, '#7a5233', 'wood'), R(B(0, 0, Math.hypot(w, h) * 0.95, 0.05, h / 2 - 0.05, 0.1, '#9b7653', 'wood'), 0)] }),

  // ---------- Fachada e entrada ----------
  { id: 'mailbox', name: 'Caixa de correio', category: 'Fachada e entrada', width: 0.4, depth: 0.15, height: 0.3, elevation: 1.1, parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#c0392b', 'metal'), B(0, d / 2 + 0.003, w * 0.6, 0.006, h * 0.7, 0.02, '#222')] },
  { id: 'trash_hanging', name: 'Lixeira suspensa de calçada', category: 'Fachada e entrada', width: 0.8, depth: 0.5, height: 1.4, parts: (w, d, h) => [C(0, 0, 0.06, 0.06, 0, h - 0.4, IRON, 'metal'), ...railing(w, h - 0.45, 0.45, 0.05).map((p) => ({ ...p, z: p.z })), B(0, 0, w, d, h - 0.45, 0.02, IRON, 'metal')] },
  { id: 'intercom', name: 'Interfone / videoporteiro', category: 'Fachada e entrada', width: 0.12, depth: 0.05, height: 0.2, elevation: 1.4, parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#2f3236', 'metal'), B(0, d / 2 + 0.002, w * 0.6, 0.004, h * 0.55, h * 0.3, '#5b8fb9', 'glass')] },
  { id: 'power_entry', name: 'Padrão de entrada de energia', category: 'Fachada e entrada', width: 0.6, depth: 0.35, height: 6.0, parts: (w, d, h) => [C(0, -0.05, 0.18, 0.18, 0, h, '#a7a9ac', 'ceramic'), B(0, d / 2 - 0.1, w, 0.2, 1.2, 0.5, '#d9d9d9', 'metal'), B(0, d / 2 - 0.1, w * 0.5, 0.21, 1.3, 0.25, '#bfe3f5', 'glass')] },
  { id: 'water_meter', name: 'Cavalete / hidrômetro', category: 'Fachada e entrada', width: 0.6, depth: 0.3, height: 0.8, parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#ece7df', 'ceramic'), B(0, d / 2 + 0.003, w * 0.7, 0.006, 0.1, h - 0.2, '#555', 'metal')] },
  { id: 'gas_cabinet', name: 'Abrigo de gás (botijões P13)', category: 'Fachada e entrada', width: 1.0, depth: 0.5, height: 1.0, parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#ece7df', 'ceramic'), ...[-1, 1].map((s) => C(s * w * 0.22, 0, 0.32, 0.32, 0.02, 0.6, '#d64545', 'metal')), B(0, d / 2 + 0.003, w - 0.06, 0.006, 0.05, h - 0.1, '#9aa0a6', 'metal')] },
  { id: 'house_number', name: 'Número da casa (placa)', category: 'Fachada e entrada', width: 0.3, depth: 0.02, height: 0.2, elevation: 1.8, parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#2f3236', 'metal'), B(0, d / 2 + 0.002, w * 0.6, 0.004, h * 0.2, h * 0.6, '#f2f2f2')] },
  { id: 'awning', name: 'Toldo / marquise', category: 'Fachada e entrada', width: 2.0, depth: 1.0, height: 0.15, elevation: 2.3, parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#3f6f9a', 'fabric'), B(0, -d / 2 + 0.02, w, 0.04, -0.2, 0.2, '#555', 'metal')] },
  { id: 'carport', name: 'Cobertura de garagem (policarbonato)', category: 'Fachada e entrada', width: 3.2, depth: 5.5, height: 2.6, parts: (w, d, h) => [...legs(w, d, 0.1, 0.1, h - 0.1, '#3a3f44', 'metal'), B(0, 0, w, d, h - 0.1, 0.03, '#cfe8f5', 'glass'), B(-w / 2 + 0.1, 0, 0.08, d, h - 0.15, 0.12, '#3a3f44', 'metal'), B(w / 2 - 0.1, 0, 0.08, d, h - 0.15, 0.12, '#3a3f44', 'metal')] },
  { id: 'driveway', name: 'Calçada / acesso de garagem (piso)', category: 'Fachada e entrada', width: 3.0, depth: 5.0, height: 0.03, parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#c9c4ba', 'ceramic'), ...posts(d, 1).map((z) => B(0, z, w, 0.02, h, 0.002, '#b5afa3'))] },
  { id: 'concregrama', name: 'Piso concregrama (permeável)', category: 'Fachada e entrada', width: 3.0, depth: 5.0, height: 0.03, permeable: true, parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#8fae5a', 'matte'), ...posts(w, 0.4).flatMap((x) => posts(d, 0.4).map((z) => B(x, z, 0.22, 0.22, h, 0.005, '#c9c4ba', 'ceramic')))] },
  { id: 'sidewalk_tree', name: 'Árvore de calçada (com canteiro)', category: 'Fachada e entrada', width: 1.2, depth: 1.2, height: 4.5, parts: (w, d, h) => [B(0, 0, w, d, 0, 0.1, SOIL, 'matte'), C(0, 0, 0.18, 0.18, 0, h * 0.5, '#5a4636', 'wood'), ...crown(0, 0, w * 2.2, d * 2.2, h * 0.45, h * 0.55, GREEN)] },
  { id: 'water_tank', name: "Caixa d'água 1.000 L", category: 'Fachada e entrada', width: 1.45, depth: 1.45, height: 0.97, parts: (w, d, h) => [C(0, 0, w * 0.85, d * 0.85, 0, h * 0.9, '#3f6f9a', 'matte'), C(0, 0, w, d, h * 0.88, h * 0.12, '#3f6f9a', 'matte')] },
  { id: 'solar_panels', name: 'Placas solares fotovoltaicas', category: 'Fachada e entrada', width: 3.4, depth: 2.1, height: 0.5, parts: (w, d, h) => [...legs(w, d, 0.1, 0.05, h * 0.6, '#9aa0a6', 'metal'), ...[0, 1].flatMap((r) => [0, 1, 2].map((c) => B(-w / 2 + (c + 0.5) * (w / 3), -d / 2 + (r + 0.5) * (d / 2), w / 3 - 0.04, d / 2 - 0.04, h * 0.6, 0.04, '#1f3a5f', 'glass')))] },
  { id: 'solar_heater', name: 'Aquecedor solar (placas + boiler)', category: 'Fachada e entrada', width: 2.2, depth: 2.0, height: 1.0, parts: (w, d, h) => [B(-w / 4, 0.2, w / 2 - 0.05, d - 0.6, 0.2, 0.06, '#253445', 'glass'), B(w / 4, 0.2, w / 2 - 0.05, d - 0.6, 0.2, 0.06, '#253445', 'glass'), C(0, -d / 2 + 0.25, 0.5, 0.5, 0, h, '#c9ced3', 'metal')] },
  { id: 'ac_condenser', name: 'Condensadora de ar-condicionado', category: 'Fachada e entrada', width: 0.8, depth: 0.3, height: 0.55, elevation: 0.3, parts: (w, d, h) => [B(0, 0, w, d, 0, h, '#f4f5f6', 'metal'), C(-w * 0.15, d / 2 + 0.005, 0.38, 0.01, h * 0.15, 0.38, '#555', 'metal')] },
  { id: 'window_planter', name: 'Floreira de janela', category: 'Fachada e entrada', width: 1.0, depth: 0.25, height: 0.35, elevation: 0.9, parts: (w, d, h) => [B(0, 0, w, d, 0, 0.18, '#8b5e3c', 'wood'), ...posts(w, 0.2).map((x, i) => S(x, 0, 0.18, 0.2, 0.15, h - 0.15, ['#e05570', '#f2c14e', GREEN][i % 3], 'matte'))] },

  // ---------- Pets e lazer ----------
  { id: 'dog_house', name: 'Casinha de cachorro', category: 'Pets e lazer', width: 0.9, depth: 1.1, height: 0.95, parts: (w, d, h) => [B(0, 0, w, d, 0, h * 0.65, '#b98a5a', 'wood'), R(B(-w / 4, 0, w * 0.6, d + 0.1, h * 0.6, 0.04, '#a0522d', 'wood'), 0), B(0, 0, w + 0.1, d + 0.1, h * 0.63, 0.02, '#a0522d', 'wood'), B(0, 0, 0.12, d + 0.1, h * 0.65, h * 0.35, '#a0522d', 'wood'), B(0, d / 2 + 0.002, w * 0.4, 0.004, 0.02, h * 0.45, '#2b2b2b')] },
  { id: 'kennel', name: 'Canil (com tela)', category: 'Pets e lazer', width: 2.0, depth: 1.5, height: 1.8, parts: (w, d, h) => [B(0, 0, w, d, 0, 0.05, CONCRETE, 'ceramic'), ...legs(w, d, 0.03, 0.05, h, IRON, 'metal'), B(0, d / 2 - 0.01, w, 0.01, 0.05, h - 0.05, '#8a949c', 'glass'), B(-w / 2 + 0.01, 0, 0.01, d, 0.05, h - 0.05, '#8a949c', 'glass'), B(w / 2 - 0.01, 0, 0.01, d, 0.05, h - 0.05, '#8a949c', 'glass'), B(0, 0, w, d, h - 0.03, 0.03, '#a7a9ac', 'ceramic')] },
  { id: 'trampoline', name: 'Cama elástica', category: 'Pets e lazer', width: 3.0, depth: 3.0, height: 2.4, parts: (w, d, h) => [C(0, 0, w, d, 0.65, 0.05, '#1f4e79', 'fabric'), ...[0, 1, 2, 3, 4, 5].map((k) => C(Math.cos((k * Math.PI) / 3) * w * 0.48, Math.sin((k * Math.PI) / 3) * d * 0.48, 0.05, 0.05, 0, h, '#555', 'metal')), C(0, 0, w, d, 0.7, h - 0.7, '#8a949c', 'glass')] },
  { id: 'ping_pong', name: 'Mesa de ping-pong', category: 'Pets e lazer', width: 2.74, depth: 1.525, height: 0.76, parts: (w, d, h) => [B(0, 0, w, d, h - 0.03, 0.03, '#1f6e4a', 'wood'), B(0, 0, 0.02, d + 0.1, h, 0.15, '#f2f2f2', 'fabric'), ...legs(w, d, 0.2, 0.06, h - 0.03, '#2f3236', 'metal')] },
  { id: 'fire_pit', name: 'Fogo de chão (fire pit)', category: 'Pets e lazer', width: 1.0, depth: 1.0, height: 0.4, light: { y: 0.4, color: '#ff9a3c', intensity: 2 }, parts: (w, d, h) => [C(0, 0, w, d, 0, h, STONE, 'ceramic'), C(0, 0, w * 0.7, d * 0.7, h - 0.05, 0.06, '#2b2b2b', 'matte'), S(0, 0, 0.35, 0.35, h, 0.25, '#ff8c2a', 'glass')] },
  { id: 'outdoor_sofa', name: 'Sofá de área externa (corda/alumínio)', category: 'Pets e lazer', width: 2.0, depth: 0.85, height: 0.75, parts: (w, d, h) => sofa(w, d, h, 3, '#d8d2c8') },
  { id: 'sun_umbrella', name: 'Guarda-sol', category: 'Pets e lazer', width: 2.4, depth: 2.4, height: 2.4, parts: (w, d, h) => [C(0, 0, 0.4, 0.4, 0, 0.08, '#555', 'metal'), C(0, 0, 0.04, 0.04, 0, h - 0.2, '#ddd', 'metal'), C(0, 0, w, d, h - 0.3, 0.2, '#e8b04a', 'fabric')] },
  { id: 'hammock_stand', name: 'Rede com suporte', category: 'Pets e lazer', width: 0.9, depth: 3.2, height: 1.3, parts: (w, d, h) => [B(0, 0, 0.1, d, 0, 0.08, '#7a5233', 'wood'), B(0, -d / 2 + 0.1, 0.08, 0.08, 0, h, '#7a5233', 'wood'), B(0, d / 2 - 0.1, 0.08, 0.08, 0, h, '#7a5233', 'wood'), S(0, 0, w * 0.9, d * 0.7, 0.4, 0.3, '#3f8fbf', 'fabric')] },
);
for (const id of ['lawn', 'gravel', 'flower_bed', 'vegetable_bed', 'stepping_stones', 'hedge', 'shrub']) {
  const c = CATALOG.find((x) => x.id === id);
  if (c) c.permeable = true;
}

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export const CATEGORIES = [...new Set(CATALOG.map((c) => c.category))];
