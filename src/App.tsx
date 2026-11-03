import { useEffect } from 'react';
import './App.css';
import { Plan2D } from './editor2d/Plan2D';
import { deleteSelection, duplicateFurniture } from './model/ops';
import { redo, undo, usePlan } from './store/planStore';
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

const HINTS: Record<Tool, string> = {
  select:
    'Clique para selecionar • arraste para mover • Delete exclui • R gira o móvel • arraste o fundo (ou botão direito) para mover a vista • roda do mouse = zoom',
  wall: 'Clique para começar e clique em cada canto • duplo clique, Enter ou Esc termina • encaixa em cantos (verde), paredes (laranja), 45° e grade de 5 cm • Alt desliga o encaixe',
  door: 'Clique sobre uma parede para inserir a porta • Esc volta para Selecionar',
  window: 'Clique sobre uma parede para inserir a janela • Esc volta para Selecionar',
  furniture: 'Clique na planta para posicionar • perto da parede ele encosta sozinho (Alt solta livre) • Esc cancela',
};

const STRUCT_HINTS: Record<'select' | 'pillar' | 'beam', string> = {
  select: 'Clique em pilar, viga, laje ou sapata para ver a memória de cálculo • arraste um pilar para mover o eixo em todos os pavimentos • Delete exclui',
  pillar: 'Clique para lançar um pilar (ele desce até a fundação) • encaixa em cantos e paredes • Esc volta',
  beam: 'Clique em dois pilares para criar a viga entre eles • Esc volta',
};

const KEY_TOOLS: Record<string, Tool> = { v: 'select', w: 'wall', d: 'door', j: 'window' };

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
      if (mod || e.altKey) return;
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
      <footer className="statusbar">{mode === 'arch' ? HINTS[tool] : STRUCT_HINTS[structTool]}</footer>
    </div>
  );
}
