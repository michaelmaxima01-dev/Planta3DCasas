import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { buildExampleBuilding, createBuilding, migrate } from '../model/building';
import type { Building } from '../model/types';
import { clearHistory, redo, undo, usePlan } from '../store/planStore';
import { type ViewMode, useUI } from '../store/uiStore';
import { ExportDialog } from './ExportDialog';
import { APP_COMMIT, APP_VERSION } from '../version';
import { logout } from './Login';
import { Icon } from './icons';
import { UsersPanel } from './UsersPanel';
import { getSession } from '../auth/session';

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
  const [usersOpen, setUsersOpen] = useState(false);
  const session = getSession();
  const mode = useUI((s) => s.mode);
  const setUI = useUI((s) => s.set);
  const showAllLevels = useUI((s) => s.showAllLevels);
  const showRoof = useUI((s) => s.showRoof);
  const showCeiling = useUI((s) => s.showCeiling);
  const hasCeiling = usePlan((s) => s.building.levels.some((l) => !!l.ceiling));

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
        <span className="logo"><Icon name="logo" size={18} /></span>
        <b>Planta3D</b> <span>Casas</span>
        <small className="version" title={`Versão ${APP_VERSION} (commit ${APP_COMMIT})`}>
          v{APP_VERSION}
        </small>
      </div>
      <div className="group tabs">
        <button className={mode === 'arch' ? 'active' : ''} onClick={() => { setUI({ mode: 'arch' }); useUI.getState().select(null); }}>
          <Icon name="arch" /> Arquitetura
        </button>
        <button className={mode === 'struct' ? 'active' : ''} onClick={() => { setUI({ mode: 'struct' }); useUI.getState().select(null); }}>
          <Icon name="struct" /> Estrutura
        </button>
      </div>
      <div className="group">
        <button onClick={() => confirm('Começar um projeto em branco? O atual será substituído.') && replace(createBuilding())}><Icon name="plus" /> Novo</button>
        <button onClick={() => confirm('Carregar o sobrado de exemplo? O projeto atual será substituído.') && replace(buildExampleBuilding())} title="Carregar o sobrado de exemplo"><Icon name="sparkle" /> <span className="lbl">Exemplo</span></button>
        <button onClick={() => fileRef.current?.click()} title="Abrir projeto (.json)"><Icon name="folder" /> <span className="lbl">Abrir</span></button>
        <button onClick={save} title="Salva o arquivo do projeto (.json), que pode ser aberto de novo aqui"><Icon name="save" /> Salvar</button>
        <button className="export-btn" onClick={() => setExporting(true)} title="PDF, AutoCAD (DXF) e outros formatos">
          <Icon name="export" /> Exportar
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && open(e.target.files[0])} />
      </div>
      <div className="group">
        <button onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)"><Icon name="undo" /> <span className="lbl">Desfazer</span></button>
        <button onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Y)"><Icon name="redo" /> <span className="lbl">Refazer</span></button>
      </div>
      <div className="group segmented">
        {views.map((v) => (
          <button key={v.id} className={viewMode === v.id ? 'active' : ''} onClick={() => setViewMode(v.id)}>
            <Icon name={v.id === '2d' ? 'plan' : v.id === '3d' ? 'cube' : 'split'} /> {v.label}
          </button>
        ))}
      </div>
      <div className="group">
        <button className={showAllLevels ? 'active' : ''} onClick={() => setUI({ showAllLevels: !showAllLevels })} title="No 3D, mostra também os pavimentos acima do que está sendo editado">
          <Icon name="layers" /> <span className="lbl">Ver andares de cima</span>
        </button>
        <button className={showRoof ? 'active' : ''} onClick={() => setUI({ showRoof: !showRoof })} title={showRoof ? 'Ocultar o telhado (ver paredes e cômodos por cima)' : 'Mostrar o telhado'}>
          <Icon name="roof" /> <span className="lbl">Telhado</span>
        </button>
        {hasCeiling && (
          <button className={showCeiling ? 'active' : ''} onClick={() => setUI({ showCeiling: !showCeiling })} title={showCeiling ? 'Ocultar o forro' : 'Mostrar o forro'}>
            <Icon name="ceiling" /> <span className="lbl">Forro</span>
          </button>
        )}
        <button className={cutWalls ? 'active' : ''} onClick={toggleCutWalls} title="Corta as paredes a 1,2 m no 3D">
          <Icon name="cut" /> <span className="lbl">Paredes baixas</span>
        </button>
        <button onClick={requestFit} title="Enquadrar o projeto nas vistas"><Icon name="fit" /> <span className="lbl">Enquadrar</span></button>
      </div>
      <div className="group group-end">
        <span className="user-chip" title={session ? `${session.name} (${session.user})${session.expires ? ` • licença até ${new Date(session.expires).toLocaleDateString('pt-BR')}` : ''}` : ''}>
          <Icon name="user" /> <span className="lbl">{session?.name ?? 'Usuário'}</span>
        </span>
        {session?.role === 'owner' && (
          <button onClick={() => setUsersOpen(true)} title="Usuários e licenças (somente o proprietário)">
            <Icon name="users" /> <span className="lbl">Usuários</span>
          </button>
        )}
        <button onClick={() => confirm('Sair do sistema? Salve o projeto antes, se precisar.') && logout()} title="Sair do sistema" className="logout-btn"><Icon name="power" /> <span className="lbl">Sair</span></button>
      </div>
      {exporting && createPortal(<ExportDialog onClose={() => setExporting(false)} />, document.body)}
      {usersOpen && createPortal(<UsersPanel onClose={() => setUsersOpen(false)} />, document.body)}
    </header>
  );
}
