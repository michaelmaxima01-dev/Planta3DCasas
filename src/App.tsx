import { useEffect } from 'react';
import './App.css';
import { Plan2D } from './editor2d/Plan2D';
import { addFurniture, deleteSelection, duplicateFurniture } from './model/ops';
import type { FurnitureItem } from './model/types';
import { redo, selectPlan, undo, usePlan } from './store/planStore';
import { type Tool, useUI } from './store/uiStore';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { Sidebar } from './ui/Sidebar';
import { TopBar } from './ui/TopBar';
import { Scene3D } from './view3d/Scene3D';
import { StructPanel } from './structure/StructPanel';
import { StructPlan2D } from './structure/StructPlan2D';
import { StructScene3D } from './structure/StructScene3D';
import { StructSidebar } from './structure/StructSidebar';
import { removePillar } from './structure/ops';
import { AddLevelDialog, FloorSwitcher, Toast } from './ui/Levels';

const HINTS: Record<Tool, string> = {
  select:
    'Clique para selecionar • arraste para mover • setas movem 1 cm (Shift = 10 cm) • Ctrl+C/Ctrl+V copia (até para outro andar) • Delete exclui • R gira • arraste o fundo (ou botão direito) para mover a vista • roda do mouse = zoom',
  wall: 'Clique para começar e em cada canto • DIGITE a medida (ex.: 3,5) + Enter para parede exata • Shift trava 0°/90° • Esc termina • encaixa em cantos (verde), paredes (laranja), 45° e grade • Alt desliga o encaixe',
  fence: 'Muro/cerca: clique em cada ponto • DIGITE a medida + Enter • Shift trava 0°/90° • encaixa nos cantos do terreno e nas pontas dos muros • Esc termina • portões: escolha no catálogo e clique sobre o muro',
  room: 'Clique em um canto e no canto oposto (ou digite 4x3 + Enter) para criar um cômodo retangular com 4 paredes • Esc cancela',
  door: 'Clique sobre uma parede para inserir a porta • Esc volta para Selecionar',
  window: 'Clique sobre uma parede para inserir a janela • Esc volta para Selecionar',
  pencil: 'Lápis: arraste para desenhar à mão livre • escolha a cor na barra lateral • Esc volta',
  arrow: 'Seta: arraste do início até a ponta • Shift trava 0°/90°',
  text: 'Texto: clique onde quer a nota, digite e aperte Enter',
  measure: 'Medir: arraste entre dois pontos (encaixa em cantos e paredes) • a medida fica marcada na planta',
  furniture: 'Clique na planta para posicionar • perto da parede ele encosta sozinho (Alt solta livre) • Esc cancela',
};

const STRUCT_HINTS: Record<'select' | 'pillar' | 'beam', string> = {
  select: 'Clique em pilar, viga, laje ou sapata para ver a memória de cálculo • arraste um pilar para mover o eixo em todos os pavimentos • Delete exclui',
  pillar: 'Clique para lançar um pilar (ele desce até a fundação) • encaixa em cantos e paredes • Esc volta',
  beam: 'Clique em dois pilares para criar a viga entre eles • Esc volta',
};

/** Área de transferência de objetos (Ctrl+C / Ctrl+V). */
let clipboard: FurnitureItem | null = null;

const KEY_TOOLS: Record<string, Tool> = { v: 'select', w: 'wall', u: 'fence', c: 'room', d: 'door', j: 'window', l: 'pencil', a: 'arrow', t: 'text', m: 'measure' };

export default function App() {
  const viewMode = useUI((s) => s.viewMode);
  const tool = useUI((s) => s.tool);
  const mode = useUI((s) => s.mode);
  const structTool = useUI((s) => s.structTool);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      const ui = useUI.getState();
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && key === 'd' && ui.selection?.kind === 'furniture') {
        e.preventDefault();
        let id: string | null = null;
        usePlan.getState().update((d) => {
          id = duplicateFurniture(d, ui.selection!.id);
        });
        if (id) ui.select({ kind: 'furniture', id });
        return;
      }
      if (mod && key === 'c' && ui.selection?.kind === 'furniture') {
        const f = selectPlan(usePlan.getState()).furniture[ui.selection.id];
        if (f) clipboard = { ...f };
        ui.set({ toast: 'Copiado. Ctrl+V cola (também em outro andar).' });
        return;
      }
      if (mod && key === 'v' && clipboard) {
        e.preventDefault();
        const src = clipboard;
        let id: string | null = null;
        usePlan.getState().update((d) => {
          const same = d.furniture[src.id];
          id = addFurniture(d, src.catalogId, same ? { x: src.x + 0.3, y: src.y + 0.3 } : { x: src.x, y: src.y }, src.rotation, { width: src.width, depth: src.depth, height: src.height, elevation: src.elevation });
        });
        if (id) {
          ui.setTool('select');
          ui.select({ kind: 'furniture', id });
        }
        return;
      }
      if (mod || e.altKey) return;
      if (e.key.startsWith('Arrow') && ui.mode === 'arch' && ui.selection?.kind === 'furniture') {
        e.preventDefault();
        const step = e.shiftKey ? 0.1 : 0.01;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const id = ui.selection.id;
        usePlan.getState().update((d) => {
          const f = d.furniture[id];
          if (f) {
            f.x = Math.round((f.x + dx) * 1000) / 1000;
            f.y = Math.round((f.y + dy) * 1000) / 1000;
          }
        });
        return;
      }
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        const ps = usePlan.getState();
        const levels = ps.building.levels;
        const i = levels.findIndex((l) => l.id === ps.levelId);
        const j = Math.max(0, Math.min(levels.length - 1, i + (e.key === 'PageUp' ? 1 : -1)));
        if (j !== i || ui.foundationView) {
          ps.setLevel(levels[j].id);
          ui.set({ foundationView: false });
          ui.select(null);
        }
        return;
      }
      if (ui.mode === 'struct') {
        const st: Record<string, 'select' | 'pillar' | 'beam'> = { v: 'select', p: 'pillar', g: 'beam' };
        if (st[key]) ui.set({ structTool: st[key] });
        else if (e.key === 'Escape') {
          if (ui.structTool !== 'select') ui.set({ structTool: 'select' });
          else ui.select(null);
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selection) {
          e.preventDefault();
          const sel = ui.selection;
          if (sel.kind === 'pillar') usePlan.getState().updateBuilding((b) => removePillar(b, sel.id));
          if (sel.kind === 'beam') usePlan.getState().updateBuilding((b) => void delete b.structure.beams[sel.id]);
          ui.select(null);
        }
        return;
      }
      if (KEY_TOOLS[key]) {
        ui.setTool(KEY_TOOLS[key]);
        return;
      }
      if (e.key === 'Escape') {
        if (ui.tool !== 'select') ui.setTool('select');
        else ui.select(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selection) {
        e.preventDefault();
        usePlan.getState().update((d) => deleteSelection(d, ui.selection));
        ui.select(null);
        return;
      }
      if (key === 'r' && ui.selection?.kind === 'furniture') {
        const id = ui.selection.id;
        usePlan.getState().update((d) => {
          if (d.furniture[id]) d.furniture[id].rotation += Math.PI / 2;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        {mode === 'arch' ? <Sidebar /> : <StructSidebar />}
        <div className={`views views-${viewMode}`}>
          <FloorSwitcher />
          {viewMode !== '3d' && (
            <div className="view">
              {mode === 'arch' ? <Plan2D /> : <StructPlan2D />}
              <span className="view-label">{mode === 'arch' ? 'Planta 2D' : 'Planta de fôrmas'}</span>
            </div>
          )}
          {viewMode !== '2d' && (
            <div className="view">
              {mode === 'arch' ? <Scene3D /> : <StructScene3D />}
              <span className="view-label">3D • arraste para girar, botão direito para mover</span>
            </div>
          )}
        </div>
        {mode === 'arch' ? <PropertiesPanel /> : <StructPanel />}
      </div>
      <AddLevelDialog />
      <Toast />
      <footer className="statusbar">{mode === 'arch' ? HINTS[tool] : STRUCT_HINTS[structTool]}</footer>
    </div>
  );
}
