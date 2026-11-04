import { usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import { NumberField, TextField } from './Fields';
import { fmtNumber } from './format';
import { CEILINGS, type CeilingType, ceilingHeight } from '../model/ceiling';

/** Lista de pavimentos: escolher o ativo, adicionar, renomear, altura e excluir. */
export function LevelBar({ foundation = false }: { foundation?: boolean }) {
  const building = usePlan((s) => s.building);
  const levelId = usePlan((s) => s.levelId);
  const setLevel = usePlan((s) => s.setLevel);
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const select = useUI((s) => s.select);
  const foundationView = useUI((s) => s.foundationView);
  const setUI = useUI((s) => s.set);
  const active = building.levels.find((l) => l.id === levelId) ?? building.levels[0];

  const choose = (id: string) => {
    setLevel(id);
    setUI({ foundationView: false });
    select(null);
  };

  return (
    <section>
      <h3>Andares</h3>
      <div className="levels">
        {[...building.levels].reverse().map((l) => (
          <button key={l.id} className={!foundationView && l.id === active.id ? 'active' : ''} onClick={() => choose(l.id)}>
            <span>
              {l.name}
              {!foundationView && l.id === active.id && <em className="editing">editando</em>}
            </span>
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
          {!foundation && (
            <>
              <label className="select-field">
                <span>Forro deste andar</span>
                <select
                  value={active.ceiling?.type ?? ''}
                  onChange={(e) =>
                    updateBuilding((b) => {
                      const l = b.levels.find((x) => x.id === active.id)!;
                      if (!e.target.value) delete l.ceiling;
                      else l.ceiling = { ...l.ceiling, type: e.target.value as CeilingType };
                    })
                  }
                >
                  <option value="">Sem forro</option>
                  {CEILINGS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {active.ceiling && (
                <NumberField
                  label="Altura do forro"
                  value={active.ceiling.height ?? ceilingHeight(active)}
                  min={2.2}
                  max={active.height}
                  onCommit={(v) => updateBuilding((b) => void (b.levels.find((l) => l.id === active.id)!.ceiling!.height = v))}
                />
              )}
            </>
          )}
        </div>
      )}
      <div className="row">
        <button className="primary-soft" onClick={() => setUI({ addingLevel: true })}>
          + Adicionar andar
        </button>
        {building.levels.length > 1 && !foundationView && (
          <button
            title={`Excluir o ${active.name}`}
            onClick={() => {
              if (!confirm(`Excluir o "${active.name}" e tudo o que está nele (paredes, móveis e estrutura)?`)) return;
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
    </section>
  );
}
