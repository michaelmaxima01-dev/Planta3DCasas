/** Tipos de forro, com cor (3D), peso (kN/m²) e consumo para o quantitativo. */
export type CeilingType = 'gesso' | 'drywall' | 'pvc' | 'madeira' | 'mineral' | 'laje_aparente';

export interface CeilingDef {
  key: CeilingType;
  name: string;
  color: string;
  load: number;
  /** Itens de material por m² de forro. */
  materials: { item: string; unit: string; perM2: number }[];
}

export const CEILINGS: CeilingDef[] = [
  { key: 'gesso', name: 'Gesso em placas 60×60 (estruturado)', color: '#f7f6f2', load: 0.25, materials: [{ item: 'Placas de gesso 60×60 cm', unit: 'un', perM2: 2.9 }, { item: 'Arame galvanizado nº 18 e tirantes', unit: 'kg', perM2: 0.08 }, { item: 'Sisal e gesso cola (sacos 20 kg)', unit: 'sc', perM2: 0.08 }] },
  { key: 'drywall', name: 'Gesso acartonado (drywall) liso', color: '#f4f3ef', load: 0.2, materials: [{ item: 'Chapas de gesso acartonado 1,20×2,40', unit: 'un', perM2: 0.37 }, { item: 'Perfis F530 e canaletas', unit: 'm', perM2: 3.2 }, { item: 'Massa e fita para juntas', unit: 'kg', perM2: 0.5 }] },
  { key: 'pvc', name: 'PVC em réguas', color: '#fbfbfb', load: 0.1, materials: [{ item: 'Réguas de PVC 20 cm', unit: 'm²', perM2: 1.08 }, { item: 'Metalon / sarrafos para estrutura do forro', unit: 'm', perM2: 2.0 }, { item: 'Perfil de acabamento (roda-forro PVC)', unit: 'm', perM2: 0.5 }] },
  { key: 'madeira', name: 'Madeira (lambri)', color: '#c79a6a', load: 0.15, materials: [{ item: 'Lambri de madeira 10 cm', unit: 'm²', perM2: 1.1 }, { item: 'Sarrafos 2,5×5 cm (estrutura)', unit: 'm', perM2: 2.2 }, { item: 'Verniz (galões 3,6 L)', unit: 'un', perM2: 0.05 }] },
  { key: 'mineral', name: 'Fibra mineral (modular 62,5×62,5)', color: '#ececea', load: 0.08, materials: [{ item: 'Placas de fibra mineral', unit: 'un', perM2: 2.6 }, { item: 'Perfis T clicados', unit: 'm', perM2: 3.2 }] },
  { key: 'laje_aparente', name: 'Laje aparente (só pintura)', color: '#d9d6cf', load: 0, materials: [{ item: 'Massa corrida e pintura de teto', unit: 'm²', perM2: 1 }] },
];

export const ceilingDef = (k: CeilingType) => CEILINGS.find((c) => c.key === k) ?? CEILINGS[0];

/** Altura padrão do forro: altura das paredes do andar (ou piso a piso − 15 cm). */
export function ceilingHeight(l: { height: number; plan: { walls: Record<string, { height: number }> } }): number {
  const hs = Object.values(l.plan.walls).map((w) => w.height);
  return hs.length ? Math.min(...hs) : l.height - 0.15;
}
