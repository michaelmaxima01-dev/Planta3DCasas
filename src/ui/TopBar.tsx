import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { buildExampleBuilding, createBuilding, migrate } from '../model/building';
import type { Building } from '../model/types';
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
  const mode = useUI((s) => s.mode);
  const setUI = useUI((s) => s.set);
  const showAllLevels = useUI((s) => s.showAllLevels);

  const replace = (b: Building) => {
    usePlan.getState().setBuilding(b);
    clearHistory();
    useUI.getState().select(null);
    setTimeout(requestFit, 0);
  };

  const save = () => {
    const blob = new Blob([JSON.stringify(usePlan.getState().building, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'projeto.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const open = async (file: File) => {
    try {
      const b = migrate(JSON.parse(await file.text()));
      if (!b) throw new Error('formato');
      replace(b);
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
      <div className="group tabs">
        <button className={mode === 'arch' ? 'active' : ''} onClick={() => { setUI({ mode: 'arch' }); useUI.getState().select(null); }}>
          Arquitetura
        </button>
        <button className={mode === 'struct' ? 'active' : ''} onClick={() => { setUI({ mode: 'struct' }); useUI.getState().select(null); }}>
          Estrutura
        </button>
      </div>
      <div className="group">
        <button onClick={() => confirm('Começar um projeto em branco? O atual será substituído.') && replace(createBuilding())}>Novo</button>
        <button onClick={() => confirm('Carregar o sobrado de exemplo? O projeto atual será substituído.') && replace(buildExampleBuilding())}>Exemplo</button>
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
        <button className={showAllLevels ? 'active' : ''} onClick={() => setUI({ showAllLevels: !showAllLevels })} title="No 3D, mostra também os pavimentos acima do que está sendo editado">
          Todos os pavimentos
        </button>
        <button className={cutWalls ? 'active' : ''} onClick={toggleCutWalls} title="Corta as paredes a 1,2 m no 3D">
          Paredes baixas
        </button>
        <button onClick={requestFit} title="Enquadrar o projeto nas vistas">Enquadrar</button>
      </div>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </header>
  );
}
