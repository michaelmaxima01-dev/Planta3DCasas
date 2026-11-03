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

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export const CATEGORIES = [...new Set(CATALOG.map((c) => c.category))];
