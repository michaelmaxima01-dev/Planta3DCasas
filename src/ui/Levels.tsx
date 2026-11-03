import { useEffect, useState } from 'react';
import { type NewLevelMode, addLevelOnTop } from '../model/building';
import { usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';

/** Troca de andar (mantém a seleção limpa e sai da vista de fundação). */
export function useGoToLevel() {
  const setLevel = usePlan((s) => s.setLevel);
  const setUI = useUI((s) => s.set);
  const select = useUI((s) => s.select);
  return (id: string) => {
    setLevel(id);
    setUI({ foundationView: false });
    select(null);
  };
}

/** Seletor de andares sempre visível sobre a planta, no estilo "elevador". */
export function FloorSwitcher() {
  const building = usePlan((s) => s.building);
  const levelId = usePlan((s) => s.levelId);
  const mode = useUI((s) => s.mode);
  const foundationView = useUI((s) => s.foundationView);
  const setUI = useUI((s) => s.set);
  const select = useUI((s) => s.select);
  const go = useGoToLevel();
  const levels = [...building.levels].reverse();
  return (
    <div className="floor-switcher" role="tablist" aria-label="Andares">
      <span className="fs-title">Andar</span>
      {levels.map((l) => (
        <button key={l.id} role="tab" aria-selected={!foundationView && l.id === levelId} className={!foundationView && l.id === levelId ? 'active' : ''} onClick={() => go(l.id)} title={`Editar ${l.name} (PageUp/PageDown)`}>
          {l.name}
        </button>
      ))}
      {mode === 'struct' && (
        <button
          className={foundationView ? 'active' : ''}
          onClick={() => {
            setUI({ foundationView: true });
            select(null);
          }}
        >
          Fundação
        </button>
      )}
      <button className="fs-add" onClick={() => setUI({ addingLevel: true })} title="Adicionar andar acima do último">
        + Andar
      </button>
    </div>
  );
}

const OPTIONS: { mode: NewLevelMode; title: string; text: string; icon: string }[] = [
  { mode: 'outer', title: 'Contorno da casa', text: 'Copia só as paredes externas. Você desenha as divisões internas.', icon: '⬚' },
  { mode: 'all', title: 'Repetir a planta', text: 'Copia todas as paredes do andar de baixo (bom para alinhar a estrutura).', icon: '⊞' },
  { mode: 'empty', title: 'Andar vazio', text: 'Só o piso (laje). Desenhe tudo do zero.', icon: '▢' },
];

/** Janela "Adicionar andar". */
export function AddLevelDialog() {
  const open = useUI((s) => s.addingLevel);
  const setUI = useUI((s) => s.set);
  const building = usePlan((s) => s.building);
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const go = useGoToLevel();
  const [mode, setMode] = useState<NewLevelMode>('outer');
  const [stair, setStair] = useState(true);
  const top = building.levels[building.levels.length - 1];
  const n = building.levels.length;
  const [name, setName] = useState('');
  useEffect(() => {
    if (open) setName(n === 1 ? '1º andar' : `${n}º andar`);
  }, [open, n]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setUI({ addingLevel: false });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setUI]);
  if (!open) return null;
  const hasStair = Object.values(top.plan.furniture).some((f) => f.catalogId === 'stair');

  const create = () => {
    let id = '';
    let message = '';
    updateBuilding((b) => {
      const r = addLevelOnTop(b, mode, { stair, name: name.trim() || undefined });
      id = r.id;
      message = r.message;
    });
    setUI({ addingLevel: false, showAllLevels: false, toast: message + ' O piso do novo andar já está pronto: desenhe as paredes por cima do tracejado.' });
    go(id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setUI({ addingLevel: false })}>
      <div className="modal add-level-modal" role="dialog" aria-modal="true" aria-label="Adicionar andar">
        <header>
          <h2>Adicionar andar acima do {top.name}</h2>
          <button className="close" onClick={() => setUI({ addingLevel: false })} aria-label="Fechar">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <label className="meta-field">
            <span>Nome do andar</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <h3 style={{ marginTop: 14 }}>Como começar</h3>
          <div className="level-options">
            {OPTIONS.map((o) => (
              <button key={o.mode} className={`level-option ${mode === o.mode ? 'active' : ''}`} onClick={() => setMode(o.mode)}>
                <span className="lo-icon">{o.icon}</span>
                <b>{o.title}</b>
                <small>{o.text}</small>
              </button>
            ))}
          </div>
          <label className="check-row" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={stair} disabled={hasStair} onChange={(e) => setStair(e.target.checked)} />
            {hasStair ? `O ${top.name} já tem escada: o vão no piso do novo andar é criado automaticamente.` : `Criar a escada no ${top.name} automaticamente (com vão e guarda-corpo no novo andar)`}
          </label>
          <p className="hint">
            O novo andar fica a +{(top.elevation + top.height).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m, com a mesma altura piso a piso ({top.height.toLocaleString('pt-BR')} m). O piso é a laje sobre os
            cômodos do {top.name}.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setUI({ addingLevel: false })}>Cancelar</button>
            <button className="primary-btn" style={{ marginTop: 0, flex: 'none', padding: '8px 18px' }} onClick={create}>
              Criar andar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Aviso temporário no canto da tela. */
export function Toast() {
  const toast = useUI((s) => s.toast);
  const setUI = useUI((s) => s.set);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setUI({ toast: null }), 9000);
    return () => clearTimeout(t);
  }, [toast, setUI]);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast}</span>
      <button onClick={() => setUI({ toast: null })} aria-label="Fechar aviso">
        ✕
      </button>
    </div>
  );
}
