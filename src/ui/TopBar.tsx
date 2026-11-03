import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { buildExamplePlan } from '../model/example';
import { createEmptyPlan } from '../model/ops';
import type { Plan } from '../model/types';
import { clearHistory, redo, undo, usePlan } from '../store/planStore';
import { type ViewMode, useUI } from '../store/uiStore';
import { ExportDialog } from './ExportDialog';

export function TopBar() {
  const canUndo = useStore(usePlan.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(usePlan.temporal, (s) => s.futureStates.length > 0);
  const viewMode = useUI((s) => s.viewMode);
  const setViewMode = useUI((s) => s.setViewMode);
  const cutWalls = useUI((s) => s.cutWalls);
  const toggleCutWalls = useUI((s) => s.toggleCutWalls);
  const requestFit = useUI((s) => s.requestFit);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);

  const replace = (plan: Plan) => {
    usePlan.getState().setPlan(plan);
    clearHistory();
    useUI.getState().select(null);
    setTimeout(requestFit, 0);
  };

  const save = () => {
    const blob = new Blob([JSON.stringify(usePlan.getState().plan, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'planta.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const open = async (file: File) => {
    try {
      const plan = JSON.parse(await file.text()) as Plan;
      if (plan?.version !== 1 || !plan.nodes || !plan.walls) throw new Error('formato');
      replace({ ...createEmptyPlan(), ...plan });
    } catch {
      alert('Arquivo inválido: escolha um .json salvo pelo Planta3D.');
    }
  };

  const views: { id: ViewMode; label: string }[] = [
    { id: '2d', label: '2D' },
    { id: 'split', label: '2D + 3D' },
    { id: '3d', label: '3D' },
  ];

  return (
    <header className="topbar">
      <div className="brand">
        <b>Planta3D</b> <span>Casas</span>
      </div>
      <div className="group">
        <button onClick={() => confirm('Começar um projeto em branco? O atual será substituído.') && replace(createEmptyPlan())}>Novo</button>
        <button onClick={() => confirm('Carregar a casa de exemplo? O projeto atual será substituído.') && replace(buildExamplePlan())}>Exemplo</button>
        <button onClick={() => fileRef.current?.click()}>Abrir</button>
        <button onClick={save} title="Salva o arquivo do projeto (.json), que pode ser aberto de novo aqui">Salvar</button>
        <button className="export-btn" onClick={() => setExporting(true)} title="PDF, AutoCAD (DXF) e outros formatos">
          Exportar
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
      </div>
      <div className="group">
        <button onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">↶ Desfazer</button>
        <button onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Y)">↷ Refazer</button>
      </div>
      <div className="group segmented">
        {views.map((v) => (
          <button key={v.id} className={viewMode === v.id ? 'active' : ''} onClick={() => setViewMode(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <div className="group">
        <button className={cutWalls ? 'active' : ''} onClick={toggleCutWalls} title="Corta as paredes a 1,2 m no 3D">
          Paredes baixas
        </button>
        <button onClick={requestFit} title="Enquadrar o projeto nas vistas">Enquadrar</button>
      </div>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </header>
  );
}
