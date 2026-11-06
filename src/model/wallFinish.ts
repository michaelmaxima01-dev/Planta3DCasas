/**
 * Acabamentos de parede e muro: aparência no 3D (textura procedural) e consumo de materiais.
 * `tint` = a cor escolhida tinge a textura (pinturas, cerâmicas); senão a textura tem cor própria.
 */
export type WallFinish = 'pintura' | 'grafiato' | 'textura' | 'tijolinho' | 'madeira' | 'ripado' | 'pedra' | 'ceramica' | 'porcelanato' | 'concreto' | 'marmore';

export interface WallFinishDef {
  key: WallFinish;
  name: string;
  tint: boolean;
  /** Cor sugerida (quando escolhido sem cor definida). */
  color: string;
  roughness: number;
  /** Relevo (intensidade do bump). */
  bump: number;
  /** Materiais por m² de parede (por face). */
  materials: { item: string; unit: string; perM2: number }[];
}

const SEALER = { item: 'Selador acrílico (galões 3,6 L)', unit: 'un', perM2: 0.1 / 3.6 };

export const WALL_FINISHES: WallFinishDef[] = [
  { key: 'pintura', name: 'Pintura lisa (acrílica)', tint: true, color: '#f1ede6', roughness: 0.9, bump: 0, materials: [SEALER, { item: 'Massa acrílica/corrida (latas 25 kg)', unit: 'un', perM2: 0.5 / 25 }, { item: 'Tinta acrílica (latas 18 L, 2 demãos)', unit: 'un', perM2: 0.25 / 18 }] },
  { key: 'grafiato', name: 'Textura grafiato', tint: true, color: '#e8dcc4', roughness: 0.95, bump: 0.035, materials: [SEALER, { item: 'Textura grafiato (barricas 25 kg)', unit: 'un', perM2: 2.0 / 25 }] },
  { key: 'textura', name: 'Textura rústica (massa)', tint: true, color: '#efe3c2', roughness: 0.95, bump: 0.025, materials: [SEALER, { item: 'Textura acrílica rústica (barricas 25 kg)', unit: 'un', perM2: 1.5 / 25 }] },
  { key: 'tijolinho', name: 'Tijolinho aparente (plaqueta)', tint: false, color: '#b0603e', roughness: 0.85, bump: 0.04, materials: [{ item: 'Plaquetas de tijolinho', unit: 'm²', perM2: 1.1 }, { item: 'Argamassa colante AC-II (sacos 20 kg)', unit: 'sc', perM2: 4 / 20 }, { item: 'Rejunte para plaqueta (kg)', unit: 'kg', perM2: 3 }, { item: 'Resina acrílica para tijolo (galões 3,6 L)', unit: 'un', perM2: 0.15 / 3.6 }] },
  { key: 'madeira', name: 'Painel de madeira (lambri)', tint: false, color: '#a8754a', roughness: 0.6, bump: 0.01, materials: [{ item: 'Lambri / painel de madeira', unit: 'm²', perM2: 1.1 }, { item: 'Sarrafos de fixação 2,5×5 cm', unit: 'm', perM2: 2.5 }, { item: 'Verniz / stain (galões 3,6 L)', unit: 'un', perM2: 0.12 / 3.6 }] },
  { key: 'ripado', name: 'Ripado de madeira', tint: false, color: '#8b5e3c', roughness: 0.6, bump: 0.05, materials: [{ item: 'Ripas de madeira 2×5 cm', unit: 'm', perM2: 14 }, { item: 'Sarrafos de fixação 2,5×5 cm', unit: 'm', perM2: 2.5 }, { item: 'Verniz / stain (galões 3,6 L)', unit: 'un', perM2: 0.2 / 3.6 }] },
  { key: 'pedra', name: 'Pedra (canjiquinha / filete)', tint: false, color: '#9a8f80', roughness: 0.95, bump: 0.06, materials: [{ item: 'Pedra canjiquinha / filete', unit: 'm²', perM2: 1.12 }, { item: 'Argamassa colante AC-III (sacos 20 kg)', unit: 'sc', perM2: 6 / 20 }] },
  { key: 'ceramica', name: 'Revestimento cerâmico (azulejo)', tint: true, color: '#f4f4f2', roughness: 0.3, bump: 0.01, materials: [{ item: 'Revestimento cerâmico de parede', unit: 'm²', perM2: 1.1 }, { item: 'Argamassa colante AC-I (sacos 20 kg)', unit: 'sc', perM2: 5 / 20 }, { item: 'Rejunte (kg)', unit: 'kg', perM2: 0.4 }] },
  { key: 'porcelanato', name: 'Porcelanato (placas grandes)', tint: true, color: '#d9d6cf', roughness: 0.25, bump: 0.005, materials: [{ item: 'Porcelanato de parede', unit: 'm²', perM2: 1.1 }, { item: 'Argamassa colante AC-III (sacos 20 kg)', unit: 'sc', perM2: 6 / 20 }, { item: 'Rejunte (kg)', unit: 'kg', perM2: 0.3 }] },
  { key: 'concreto', name: 'Concreto aparente', tint: false, color: '#a7a9ac', roughness: 0.9, bump: 0.015, materials: [{ item: 'Hidrofugante / verniz para concreto (galões 3,6 L)', unit: 'un', perM2: 0.2 / 3.6 }] },
  { key: 'marmore', name: 'Mármore / granito', tint: false, color: '#ece9e4', roughness: 0.15, bump: 0, materials: [{ item: 'Placas de mármore/granito', unit: 'm²', perM2: 1.1 }, { item: 'Argamassa colante AC-III (sacos 20 kg)', unit: 'sc', perM2: 6 / 20 }] },
];

export const wallFinishDef = (k: WallFinish | undefined) => WALL_FINISHES.find((f) => f.key === (k ?? 'pintura')) ?? WALL_FINISHES[0];
