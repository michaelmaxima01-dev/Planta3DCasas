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
  {
    id: 'stair', name: 'Escada reta', category: 'Circulação', width: 0.9, depth: 3.2, height: 2.95,
    parts: (w, d, h) => {
      const steps = Math.max(2, Math.round(h / 0.18));
      const rise = h / steps;
      const tread = d / steps;
      const parts: Part[] = [];
      for (let i = 0; i < steps; i++) {
        parts.push(B(0, d / 2 - (i + 0.5) * tread, w, tread, 0, (i + 1) * rise, i % 2 ? '#c9b59a' : '#d4c2a8', 'wood'));
      }
      parts.push(B(w / 2 - 0.02, 0, 0.03, d, h * 0.5, 0.9, '#5b5f63', 'metal'));
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

export const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export const CATEGORIES = [...new Set(CATALOG.map((c) => c.category))];
