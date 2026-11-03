import { create } from 'zustand';
import type { OpeningStyle, Selection } from '../model/types';

export type Tool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'furniture' | 'pencil' | 'arrow' | 'text' | 'measure';
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
  /** Mostra o telhado no 3D. */
  showRoof: boolean;
  /** Aba principal: arquitetura ou estrutura. */
  mode: 'arch' | 'struct';
  /** Pinta a estrutura no 3D pela verificação (verde/amarelo/vermelho). */
  colorByStatus: boolean;
  /** Mostra as paredes em transparência na aba de estrutura. */
  ghostWalls: boolean;
  /** Aba de estrutura mostrando o nível da fundação. */
  foundationView: boolean;
  structTool: StructTool;
  /** Janela de adicionar andar aberta. */
  addingLevel: boolean;
  /** Cor das marcações. */
  annotColor: string;
  /** Tipo padrão de porta e de janela ao inserir. */
  doorStyle: OpeningStyle;
  windowStyle: OpeningStyle;
  /** Aviso temporário. */
  toast: string | null;
  /** Plano pronto (garagem, quarto…) aguardando o clique na planta. */
  roomPreset: string | null;
  /** Incrementado para pedir que as vistas reenquadrem a planta. */
  fitToken: number;
  setTool: (tool: Tool) => void;
  select: (sel: Selection) => void;
  setViewMode: (m: ViewMode) => void;
  pickCatalog: (id: string) => void;
  setWallDefaults: (p: { thickness?: number; height?: number }) => void;
  toggleCutWalls: () => void;
  set: (p: Partial<Pick<UIState, 'showAllLevels' | 'showRoof' | 'mode' | 'colorByStatus' | 'ghostWalls' | 'foundationView' | 'structTool' | 'addingLevel' | 'annotColor' | 'toast' | 'doorStyle' | 'windowStyle' | 'roomPreset'>>) => void;
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
  showRoof: true,
  mode: 'arch',
  colorByStatus: true,
  ghostWalls: true,
  foundationView: false,
  structTool: 'select',
  addingLevel: false,
  annotColor: '#e03131',
  doorStyle: 'giro',
  windowStyle: 'janela_correr',
  toast: null,
  roomPreset: null,
  fitToken: 0,
  setTool: (tool) => set((s) => ({ tool, catalogId: tool === 'furniture' ? s.catalogId : null, roomPreset: tool === 'room' ? s.roomPreset : null })),
  select: (selection) => set({ selection }),
  setViewMode: (viewMode) => set({ viewMode }),
  pickCatalog: (id) => set({ tool: 'furniture', catalogId: id, selection: null, roomPreset: null }),
  setWallDefaults: (p) =>
    set((s) => ({ wallThickness: p.thickness ?? s.wallThickness, wallHeight: p.height ?? s.wallHeight })),
  toggleCutWalls: () => set((s) => ({ cutWalls: !s.cutWalls })),
  set: (p) => set(p),
  requestFit: () => set((s) => ({ fitToken: s.fitToken + 1 })),
}));
