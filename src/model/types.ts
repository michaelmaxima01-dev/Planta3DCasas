import type { Vec2 } from '../geometry/vec';

export type { Vec2 };

/** Canto/vértice do grafo de paredes. Coordenadas em metros. */
export interface PlanNode {
  id: string;
  x: number;
  y: number;
}

/** Parede: segmento entre dois nós (linha central) com espessura e altura. */
export interface Wall {
  id: string;
  a: string;
  b: string;
  thickness: number;
  height: number;
}

export type OpeningKind = 'door' | 'window';
export type OpeningStyle = 'giro' | 'correr' | 'dupla' | 'pivotante' | 'janela_correr' | 'basculante' | 'maxim_ar' | 'porta_janela'
  | 'portao_basculante' | 'portao_correr' | 'porta_vidro' | 'camarao' | 'vidro_fixo' | 'pele_vidro' | 'veneziana';

/** Porta ou janela hospedada em uma parede. */
export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Tipo da esquadria (porta de giro, de correr, basculante…). */
  style?: OpeningStyle;
  /** Distância do nó `a` da parede até o centro da abertura, ao longo da linha central. */
  offset: number;
  width: number;
  height: number;
  /** Altura do peitoril (0 para portas). */
  sill: number;
  /** Dobradiça na outra ponta. */
  flip: boolean;
  /** Abre para o outro lado da parede. */
  side: boolean;
}

/** Instância de um item do catálogo posicionada na planta. */
export interface FurnitureItem {
  id: string;
  catalogId: string;
  x: number;
  y: number;
  /** Rotação em radianos no plano da planta. */
  rotation: number;
  width: number;
  depth: number;
  height: number;
  elevation: number;
}

/**
 * Nome/cor de um cômodo. Cômodos são detectados automaticamente a partir das paredes;
 * o rótulo fica "preso" ao cômodo que contém o ponto (x, y).
 */
export interface RoomLabel {
  id: string;
  x: number;
  y: number;
  name: string;
  floorColor: string;
}

/** Dados do projeto usados no carimbo e na capa do PDF. */
export interface ProjectMeta {
  title: string;
  client: string;
  address: string;
  author: string;
  registry: string;
  notes: string;
  /** Responsável técnico pela estrutura (engenheiro civil). */
  engineer?: string;
  /** Registro CREA do engenheiro. */
  engineerRegistry?: string;
  /** Número da ART. */
  art?: string;
}

/** Marcação livre na planta (rabisco, seta, texto ou medida). */
export interface Annotation {
  id: string;
  kind: 'free' | 'arrow' | 'text' | 'measure';
  pts: Vec2[];
  text?: string;
  color: string;
  /** Altura do texto em metros (escala da planta). */
  size?: number;
}

export interface Plan {
  version: 1;
  annotations?: Record<string, Annotation>;
  meta?: ProjectMeta;
  nodes: Record<string, PlanNode>;
  walls: Record<string, Wall>;
  openings: Record<string, Opening>;
  furniture: Record<string, FurnitureItem>;
  rooms: Record<string, RoomLabel>;
}

/** Pavimento: cada um tem sua própria planta. */
export interface Level {
  id: string;
  name: string;
  /** Cota do piso acabado (m). */
  elevation: number;
  /** Altura piso a piso (m): pé-direito + espessura da laje. */
  height: number;
  plan: Plan;
}

/** Documento completo: pavimentos + estrutura. */
export interface Building {
  version: 2;
  meta?: ProjectMeta;
  levels: Level[];
  structure: import('../structure/types').StructureModel;
  roof?: import('../roof/roof').RoofModel;
}

export type SelectionKind = 'wall' | 'node' | 'opening' | 'furniture' | 'room' | 'pillar' | 'beam' | 'slab' | 'footing' | 'annotation';
export type Selection = { kind: SelectionKind; id: string } | null;
