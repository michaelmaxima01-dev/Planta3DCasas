import { useState } from 'react';
import { type NewLevelMode, addLevelOnTop } from '../model/building';
import { usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import { NumberField, TextField } from './Fields';
import { fmtNumber } from './format';

/** Lista de pavimentos: escolher o ativo, adicionar, renomear, altura e excluir. */
export function LevelBar({ foundation = false }: { foundation?: boolean }) {
  const building = usePlan((s) => s.building);
  const levelId = usePlan((s) => s.levelId);
  const setLevel = usePlan((s) => s.setLevel);
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const select = useUI((s) => s.select);
  const foundationView = useUI((s) => s.foundationView);
  const setUI = useUI((s) => s.set);
  const [adding, setAdding] = useState(false);
  const active = building.levels.find((l) => l.id === levelId) ?? building.levels[0];

  const choose = (id: string) => {
    setLevel(id);
    setUI({ foundationView: false });
    select(null);
  };
  const add = (mode: NewLevelMode) => {
    let id = '';
    updateBuilding((b) => {
      id = addLevelOnTop(b, mode);
    });
    setAdding(false);
    choose(id);
  };

  return (
    <section>
      <h3>Pavimentos</h3>
      <div className="levels">
        {[...building.levels].reverse().map((l) => (
          <button key={l.id} className={!foundationView && l.id === active.id ? 'active' : ''} onClick={() => choose(l.id)}>
            <span>{l.name}</span>
            <small>+{fmtNumber(l.elevation)} m</small>
          </button>
        ))}
        {foundation && (
          <button
            className={foundationView ? 'active' : ''}
            onClick={() => {
              setUI({ foundationView: true });
              select(null);
            }}
          >
            <span>Fundação</span>
            <small>sapatas e baldrames</small>
          </button>
        )}
      </div>
      {!foundationView && (
        <div className="level-edit">
          <TextField label="Nome" value={active.name} onCommit={(v) => updateBuilding((b) => void (b.levels.find((l) => l.id === active.id)!.name = v))} />
          <NumberField
            label="Piso a piso"
            value={active.height}
            min={2.2}
            max={8}
            onCommit={(v) => updateBuilding((b) => void (b.levels.find((l) => l.id === active.id)!.height = v))}
          />
        </div>
      )}
      {adding ? (
        <div className="add-level">
          <p className="hint">Novo pavimento acima de "{building.levels[building.levels.length - 1].name}":</p>
          <button onClick={() => add('outer')}>Copiar paredes externas</button>
          <button onClick={() => add('all')}>Copiar todas as paredes</button>
          <button onClick={() => add('empty')}>Vazio</button>
          <button onClick={() => setAdding(false)}>Cancelar</button>
        </div>
      ) : (
        <div className="row">
          <button onClick={() => setAdding(true)}>+ Pavimento</button>
          {building.levels.length > 1 && !foundationView && (
            <button
              onClick={() => {
                if (!confirm(`Excluir o pavimento "${active.name}" e tudo o que está nele?`)) return;
                updateBuilding((b) => {
                  b.levels = b.levels.filter((l) => l.id !== active.id);
                  for (const p of Object.values(b.structure.pillars)) if (p.levelId === active.id) delete b.structure.pillars[p.id];
                  for (const v of Object.values(b.structure.beams)) if (v.levelId === active.id) delete b.structure.beams[v.id];
                });
                select(null);
              }}
            >
              Excluir
            </button>
          )}
        </div>
      )}
    </section>
  );
}
