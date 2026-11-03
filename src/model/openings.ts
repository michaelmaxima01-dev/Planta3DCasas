import type { Opening, OpeningKind, OpeningStyle } from './types';

export interface OpeningStyleDef {
  key: OpeningStyle;
  kind: OpeningKind;
  name: string;
  width: number;
  height: number;
  sill: number;
}

/** Tipos de esquadria com medidas padrão (alturas e peitoris usuais em residências). */
export const OPENING_STYLES: OpeningStyleDef[] = [
  { key: 'giro', kind: 'door', name: 'Porta de giro', width: 0.8, height: 2.1, sill: 0 },
  { key: 'correr', kind: 'door', name: 'Porta de correr', width: 1.0, height: 2.1, sill: 0 },
  { key: 'dupla', kind: 'door', name: 'Porta dupla', width: 1.4, height: 2.1, sill: 0 },
  { key: 'pivotante', kind: 'door', name: 'Porta pivotante (entrada)', width: 1.2, height: 2.4, sill: 0 },
  { key: 'janela_correr', kind: 'window', name: 'Janela de correr', width: 1.2, height: 1.2, sill: 1.0 },
  { key: 'basculante', kind: 'window', name: 'Basculante (banheiro)', width: 0.6, height: 0.6, sill: 1.5 },
  { key: 'maxim_ar', kind: 'window', name: 'Maxim-ar', width: 0.8, height: 0.6, sill: 1.4 },
  { key: 'porta_janela', kind: 'window', name: 'Porta-janela (sacada)', width: 1.6, height: 2.1, sill: 0 },
];

export const styleOf = (op: Pick<Opening, 'kind' | 'style'>): OpeningStyle => op.style ?? (op.kind === 'door' ? 'giro' : 'janela_correr');
export const styleDef = (key: OpeningStyle) => OPENING_STYLES.find((s) => s.key === key)!;
export const styleName = (op: Pick<Opening, 'kind' | 'style'>) => styleDef(styleOf(op)).name;
