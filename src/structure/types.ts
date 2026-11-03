/**
 * Modelo estrutural (concreto armado convencional + alvenaria de vedação).
 * Pilares e vigas são editáveis; lajes e fundações são derivadas na análise.
 */

export type SoilKey = 'rocha' | 'areia_compacta' | 'areia_media' | 'argila_rija' | 'argila_media' | 'areia_fofa' | 'argila_mole' | 'custom';
export type FoundationKind = 'sapata' | 'radier' | 'estaca';
export type SlabKind = 'macica' | 'trelicada';
export type RoofKind = 'ceramica' | 'fibrocimento' | 'metalica' | 'laje';

export interface StructureSettings {
  /** Resistência característica do concreto (MPa). */
  fck: number;
  /** Aço CA-50: fyk (MPa). */
  fyk: number;
  soil: SoilKey;
  /** Tensão admissível do solo (kPa = kN/m²). */
  soilStress: number;
  foundation: FoundationKind;
  /** Profundidade de assentamento da fundação (m). */
  foundationDepth: number;
  /** Carga admissível por estaca (kN). */
  pileCapacity: number;
  slab: SlabKind;
  roof: RoofKind;
  /** Sobrecarga de uso nos pisos (kN/m²) - NBR 6120: residencial 1,5. */
  liveLoad: number;
  /** Sobrecarga na cobertura sem acesso (kN/m²). */
  roofLiveLoad: number;
  /** Contrapiso + revestimento de piso (kN/m²). */
  finishLoad: number;
  /** Peso específico da alvenaria (kN/m³). */
  wallUnitWeight: number;
  /** Revestimento das duas faces da parede (kN/m²). */
  wallFinishLoad: number;
  /** Vão máximo entre pilares na geração automática (m). */
  maxSpan: number;
}

export interface Pillar {
  id: string;
  /** Pavimento em que o pilar nasce (vai do piso deste pavimento até o piso do próximo). */
  levelId: string;
  x: number;
  y: number;
  /** Seção em cm: b (menor) × h (maior). */
  b: number;
  h: number;
  /** Rotação da seção (rad) - o lado h acompanha a parede. */
  rotation: number;
}

/** Viga entre dois pilares. levelId = pavimento sob a viga; 'baldrame' = viga de fundação. */
export interface Beam {
  id: string;
  levelId: string;
  a: string;
  b: string;
  /** Largura e altura em cm. */
  bw: number;
  h: number;
}

export interface StructureModel {
  settings: StructureSettings;
  pillars: Record<string, Pillar>;
  beams: Record<string, Beam>;
}

export const BALDRAME = 'baldrame';

/**
 * Tensões admissíveis típicas para PRÉ-DIMENSIONAMENTO (ordem de grandeza da antiga tabela
 * da NBR 6122 e da prática). O valor real exige sondagem SPT e engenheiro geotécnico.
 */
export const SOILS: { key: SoilKey; name: string; stress: number }[] = [
  { key: 'rocha', name: 'Rocha sã', stress: 1000 },
  { key: 'areia_compacta', name: 'Areia compacta', stress: 400 },
  { key: 'argila_rija', name: 'Argila rija', stress: 300 },
  { key: 'areia_media', name: 'Areia medianamente compacta', stress: 200 },
  { key: 'argila_media', name: 'Argila média', stress: 150 },
  { key: 'areia_fofa', name: 'Areia fofa', stress: 100 },
  { key: 'argila_mole', name: 'Argila mole', stress: 50 },
  { key: 'custom', name: 'Informado (sondagem)', stress: 200 },
];

/** Peso da cobertura sobre a laje do último pavimento (kN/m² em projeção), valores típicos. */
export const ROOFS: { key: RoofKind; name: string; load: number }[] = [
  { key: 'ceramica', name: 'Telhado cerâmico (telha + madeiramento)', load: 0.9 },
  { key: 'fibrocimento', name: 'Telhado de fibrocimento', load: 0.4 },
  { key: 'metalica', name: 'Telha metálica / sanduíche', load: 0.3 },
  { key: 'laje', name: 'Laje impermeabilizada (sem telhado)', load: 1.0 },
];

export const DEFAULT_SETTINGS: StructureSettings = {
  fck: 25,
  fyk: 500,
  soil: 'areia_media',
  soilStress: 200,
  foundation: 'sapata',
  foundationDepth: 1.2,
  pileCapacity: 120,
  slab: 'trelicada',
  roof: 'ceramica',
  liveLoad: 1.5,
  roofLiveLoad: 0.5,
  finishLoad: 1.0,
  wallUnitWeight: 13,
  wallFinishLoad: 0.8,
  maxSpan: 4.5,
};

export function emptyStructure(): StructureModel {
  return { settings: { ...DEFAULT_SETTINGS }, pillars: {}, beams: {} };
}
