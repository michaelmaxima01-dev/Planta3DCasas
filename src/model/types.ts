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

/** Porta ou janela hospedada em uma parede. */
export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
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

export interface Plan {
  version: 1;
  nodes: Record<string, PlanNode>;
  walls: Record<string, Wall>;
  openings: Record<string, Opening>;
  furniture: Record<string, FurnitureItem>;
  rooms: Record<string, RoomLabel>;
}

export type SelectionKind = 'wall' | 'node' | 'opening' | 'furniture' | 'room';
export type Selection = { kind: SelectionKind; id: string } | null;
