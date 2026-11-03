import { create } from 'zustand';
import type { Selection } from '../model/types';

export type Tool = 'select' | 'wall' | 'door' | 'window' | 'furniture';
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
  /** Incrementado para pedir que as vistas reenquadrem a planta. */
  fitToken: number;
  setTool: (tool: Tool) => void;
  select: (sel: Selection) => void;
  setViewMode: (m: ViewMode) => void;
  pickCatalog: (id: string) => void;
  setWallDefaults: (p: { thickness?: number; height?: number }) => void;
  toggleCutWalls: () => void;
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
  fitToken: 0,
  setTool: (tool) => set((s) => ({ tool, catalogId: tool === 'furniture' ? s.catalogId : null })),
  select: (selection) => set({ selection }),
  setViewMode: (viewMode) => set({ viewMode }),
  pickCatalog: (id) => set({ tool: 'furniture', catalogId: id, selection: null }),
  setWallDefaults: (p) =>
    set((s) => ({ wallThickness: p.thickness ?? s.wallThickness, wallHeight: p.height ?? s.wallHeight })),
  toggleCutWalls: () => set((s) => ({ cutWalls: !s.cutWalls })),
  requestFit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
}));
