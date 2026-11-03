import { create } from 'zustand';
import { temporal } from 'zundo';
import { buildExamplePlan } from '../model/example';
import type { Plan } from '../model/types';

const STORAGE_KEY = 'planta3d:plan:v1';

interface PlanState {
  plan: Plan;
  /** Aplica uma edição sobre um clone da planta (vira um passo do desfazer). */
  update: (fn: (draft: Plan) => void) => void;
  setPlan: (plan: Plan) => void;
}

function loadInitial(): Plan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Plan;
      if (p && p.version === 1 && p.nodes && p.walls) return p;
    }
  } catch {
    // sem localStorage (testes) ou JSON inválido: começa pelo exemplo
  }
  return buildExamplePlan();
}

export const usePlan = create<PlanState>()(
  temporal(
    (set) => ({
      plan: loadInitial(),
      update: (fn) =>
        set((s) => {
          const draft = structuredClone(s.plan);
          fn(draft);
          return { plan: draft };
        }),
      setPlan: (plan) => set({ plan }),
    }),
    { partialize: (s) => ({ plan: s.plan }), limit: 200 },
  ),
);

export const undo = () => usePlan.temporal.getState().undo();
export const redo = () => usePlan.temporal.getState().redo();
export const clearHistory = () => usePlan.temporal.getState().clear();

/**
 * Gestos de arrastar: durante o arraste a planta muda a cada movimento do mouse, mas
 * no histórico entra um único passo (estado antes → estado depois).
 */
let gestureStart: Plan | null = null;
export function beginGesture() {
  if (gestureStart) return;
  gestureStart = usePlan.getState().plan;
  usePlan.temporal.getState().pause();
}
export function endGesture() {
  if (!gestureStart) return;
  const start = gestureStart;
  gestureStart = null;
  const final = usePlan.getState().plan;
  usePlan.setState({ plan: start });
  usePlan.temporal.getState().resume();
  if (final !== start) usePlan.setState({ plan: final });
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
usePlan.subscribe((s) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s.plan));
    } catch {
      // armazenamento indisponível ou cheio
    }
  }, 400);
});
