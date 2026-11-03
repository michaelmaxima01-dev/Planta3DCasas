import { create } from 'zustand';
import type { Selection } from '../model/types';

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'furniture';
export type StructTool = 'select' | 'pillar' | 'beam';
export type ViewMode = '2d' | 'split' | '3d';

interface UIState {
  tool: Tool;
  selection: Selection;
  viewMode: ViewMode;
  /** Item do catálogo aguardando ser posicionado. */
  catalogId: string | null;
  wallThickness: number;
  wallHeight: number;
  /** Corta as paredes na altura de 1,2 m no 3D (vista "casa de bonecas"). */
  cutWalls: boolean;
  /** No 3D, mostra também os pavimentos acima do pavimento ativo. */
  showAllLevels: boolean;
  /** Aba principal: arquitetura ou estrutura. */
  mode: 'arch' | 'struct';
  /** Pinta a estrutura no 3D pela verificação (verde/amarelo/vermelho). */
  colorByStatus: boolean;
  /** Mostra as paredes em transparência na aba de estrutura. */
  ghostWalls: boolean;
  /** Aba de estrutura mostrando o nível da fundação. */
  foundationView: boolean;
  structTool: StructTool;
  /** Incrementado para pedir que as vistas reenquadrem a planta. */
  fitToken: number;
  setTool: (tool: Tool) => void;
  select: (sel: Selection) => void;
  setViewMode: (m: ViewMode) => void;
  pickCatalog: (id: string) => void;
  setWallDefaults: (p: { thickness?: number; height?: number }) => void;
  toggleCutWalls: () => void;
  set: (p: Partial<Pick<UIState, 'showAllLevels' | 'mode' | 'colorByStatus' | 'ghostWalls' | 'foundationView' | 'structTool'>>) => void;
  requestFit: () => void;
}

export const useUI = create<UIState>()((set) => ({
  tool: 'select',
  selection: null,
  viewMode: 'split',
  catalogId: null,
  wallThickness: 0.15,
  wallHeight: 2.8,
  cutWalls: false,
  showAllLevels: false,
  mode: 'arch',
  colorByStatus: true,
  ghostWalls: true,
  foundationView: false,
  structTool: 'select',
  fitToken: 0,
  setTool: (tool) => set((s) => ({ tool, catalogId: tool === 'furniture' ? s.catalogId : null })),
  select: (selection) => set({ selection }),
  setViewMode: (viewMode) => set({ viewMode }),
  pickCatalog: (id) => set({ tool: 'furniture', catalogId: id, selection: null }),
  setWallDefaults: (p) =>
    set((s) => ({ wallThickness: p.thickness ?? s.wallThickness, wallHeight: p.height ?? s.wallHeight })),
  toggleCutWalls: () => set((s) => ({ cutWalls: !s.cutWalls })),
  set: (p) => set(p),
  requestFit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
}));
