import { create } from 'zustand';
import { temporal } from 'zundo';
import { buildExampleBuilding, migrate, restack } from '../model/building';
import { syncStairHeights } from '../model/stairs';
import type { Building, Level, Plan } from '../model/types';

const STORAGE_KEY = 'planta3d:building:v2';
const LEGACY_KEY = 'planta3d:plan:v1';

interface PlanState {
  building: Building;
  /** Pavimento sendo editado (não entra no histórico). */
  levelId: string;
  /** Edita a planta do pavimento ativo (vira um passo do desfazer). */
  update: (fn: (draft: Plan) => void) => void;
  /** Edita o edifício inteiro: pavimentos, estrutura, dados do projeto. */
  updateBuilding: (fn: (draft: Building) => void) => void;
  setBuilding: (b: Building) => void;
  setLevel: (id: string) => void;
}

export const selectLevel = (s: Pick<PlanState, 'building' | 'levelId'>): Level =>
  s.building.levels.find((l) => l.id === s.levelId) ?? s.building.levels[0];
export const selectPlan = (s: Pick<PlanState, 'building' | 'levelId'>): Plan => selectLevel(s).plan;

function loadInitial(): Building {
  try {
    for (const key of [STORAGE_KEY, LEGACY_KEY]) {
      const raw = localStorage.getItem(key);
      const b = raw ? migrate(JSON.parse(raw)) : null;
      if (b) return b;
    }
  } catch {
    // sem localStorage (testes) ou JSON inválido: começa pelo exemplo
  }
  return buildExampleBuilding();
}

const initial = loadInitial();

export const usePlan = create<PlanState>()(
  temporal(
    (set) => ({
      building: initial,
      levelId: initial.levels[0].id,
      update: (fn) =>
        set((s) => {
          const level = selectLevel(s);
          const draft = structuredClone(level.plan);
          fn(draft);
          return { building: { ...s.building, levels: s.building.levels.map((l) => (l.id === level.id ? { ...l, plan: draft } : l)) } };
        }),
      updateBuilding: (fn) =>
        set((s) => {
          const draft = structuredClone(s.building);
          fn(draft);
          restack(draft);
          syncStairHeights(draft);
          const levelId = draft.levels.some((l) => l.id === s.levelId) ? s.levelId : draft.levels[0].id;
          return { building: draft, levelId };
        }),
      setBuilding: (building) => set({ building, levelId: building.levels[0].id }),
      setLevel: (levelId) => set({ levelId }),
    }),
    {
      partialize: (s) => ({ building: s.building }),
      equality: (a, b) => a.building === b.building,
      limit: 200,
    },
  ),
);

export const undo = () => usePlan.temporal.getState().undo();
export const redo = () => usePlan.temporal.getState().redo();
export const clearHistory = () => usePlan.temporal.getState().clear();

/**
 * Gestos de arrastar: durante o arraste a planta muda a cada movimento do mouse, mas
 * no histórico entra um único passo (estado antes → estado depois).
 */
let gestureStart: Building | null = null;
export function beginGesture() {
  if (gestureStart) return;
  gestureStart = usePlan.getState().building;
  usePlan.temporal.getState().pause();
}
export function endGesture() {
  if (!gestureStart) return;
  const start = gestureStart;
  gestureStart = null;
  const final = usePlan.getState().building;
  usePlan.setState({ building: start });
  usePlan.temporal.getState().resume();
  if (final !== start) usePlan.setState({ building: final });
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
usePlan.subscribe((s) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s.building));
    } catch {
      // armazenamento indisponível ou cheio
    }
  }, 400);
});
