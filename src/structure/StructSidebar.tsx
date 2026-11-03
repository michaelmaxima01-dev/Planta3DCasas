import { NumberField } from '../ui/Fields';
import { LevelBar } from '../ui/LevelBar';
import { usePlan } from '../store/planStore';
import { type StructTool, useUI } from '../store/uiStore';
import { autoSize } from './analyze';
import { generateStructure } from './generate';
import { type FoundationKind, ROOFS, type RoofKind, SOILS, type SlabKind, type SoilKey, type StructureSettings } from './types';

const TOOLS: { id: StructTool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Selecionar', key: 'V', icon: '➤' },
  { id: 'pillar', label: 'Pilar', key: 'P', icon: '■' },
  { id: 'beam', label: 'Viga', key: 'G', icon: '═' },
];

export function StructSidebar() {
  const building = usePlan((s) => s.building);
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const tool = useUI((s) => s.structTool);
  const setUI = useUI((s) => s.set);
  const colorByStatus = useUI((s) => s.colorByStatus);
  const ghostWalls = useUI((s) => s.ghostWalls);
  const select = useUI((s) => s.select);
  const st = building.structure.settings;
  const hasStructure = Object.keys(building.structure.pillars).length > 0;
  const set = (patch: Partial<StructureSettings>) => updateBuilding((b) => void Object.assign(b.structure.settings, patch));

  return (
    <aside className="sidebar">
      <LevelBar foundation />

      <section>
        <h3>Concepção estrutural</h3>
        <div className="tools">
          <button
            className="primary-soft"
            onClick={() => {
              if (hasStructure && !confirm('Gerar de novo substitui os pilares e vigas atuais (inclusive ajustes manuais). Continuar?')) return;
              updateBuilding((b) => {
                b.structure = generateStructure(b);
                autoSize(b);
              });
              select(null);
            }}
          >
            ⚙ {hasStructure ? 'Gerar novamente' : 'Gerar estrutura'}
          </button>
          <button disabled={!hasStructure} onClick={() => updateBuilding((b) => void autoSize(b))} title="Aumenta as seções que não passaram na verificação">
            ⇧ Dimensionar seções
          </button>
        </div>
      </section>

      <section>
        <h3>Ferramentas</h3>
        <div className="tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={tool === t.id ? 'active' : ''} onClick={() => setUI({ structTool: t.id })} title={`${t.label} (${t.key})`}>
              <span className="icon">{t.icon}</span>
              {t.label}
              <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
      </section>

      <section className="params">
        <h3>Solo e fundação</h3>
        <label className="select-field">
          <span>Tipo de solo</span>
          <select
            value={st.soil}
            onChange={(e) => {
              const soil = SOILS.find((x) => x.key === e.target.value)!;
              set({ soil: soil.key as SoilKey, ...(soil.key !== 'custom' ? { soilStress: soil.stress } : {}) });
            }}
          >
            {SOILS.map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
                {x.key !== 'custom' ? ` (~${x.stress} kPa)` : ''}
              </option>
            ))}
          </select>
        </label>
        <NumberField label="σ admissível" value={st.soilStress} suffix="kPa" digits={0} min={20} max={3000} onCommit={(v) => set({ soilStress: v, soil: 'custom' })} />
        <label className="select-field">
          <span>Fundação</span>
          <select value={st.foundation} onChange={(e) => set({ foundation: e.target.value as FoundationKind })}>
            <option value="sapata">Sapatas isoladas + baldrame</option>
            <option value="radier">Radier</option>
            <option value="estaca">Estacas + blocos</option>
          </select>
        </label>
        {st.foundation === 'estaca' && <NumberField label="Carga por estaca" value={st.pileCapacity} suffix="kN" digits={0} min={10} max={3000} onCommit={(v) => set({ pileCapacity: v })} />}
        <NumberField label="Profundidade" value={st.foundationDepth} min={0.3} max={5} onCommit={(v) => set({ foundationDepth: v })} />
      </section>

      <section className="params">
        <h3>Materiais e cargas</h3>
        <label className="select-field">
          <span>Concreto</span>
          <select value={st.fck} onChange={(e) => set({ fck: Number(e.target.value) })}>
            {[20, 25, 30, 35, 40].map((f) => (
              <option key={f} value={f}>
                C{f} (fck {f} MPa)
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>Laje</span>
          <select value={st.slab} onChange={(e) => set({ slab: e.target.value as SlabKind })}>
            <option value="trelicada">Pré-moldada treliçada</option>
            <option value="macica">Maciça</option>
          </select>
        </label>
        <label className="select-field">
          <span>Cobertura</span>
          <select value={st.roof} onChange={(e) => set({ roof: e.target.value as RoofKind })}>
            {ROOFS.map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <NumberField label="Sobrecarga uso" value={st.liveLoad} suffix="kN/m²" min={0.5} max={10} onCommit={(v) => set({ liveLoad: v })} />
        <NumberField label="Revestimento piso" value={st.finishLoad} suffix="kN/m²" min={0} max={5} onCommit={(v) => set({ finishLoad: v })} />
        <NumberField label="Peso alvenaria" value={st.wallUnitWeight} suffix="kN/m³" min={5} max={25} onCommit={(v) => set({ wallUnitWeight: v })} />
        <NumberField label="Vão máx. pilares" value={st.maxSpan} min={2} max={8} onCommit={(v) => set({ maxSpan: v })} />
      </section>

      <section>
        <h3>Visualização</h3>
        <label className="check-row">
          <input type="checkbox" checked={colorByStatus} onChange={(e) => setUI({ colorByStatus: e.target.checked })} /> Colorir pela verificação
        </label>
        <label className="check-row">
          <input type="checkbox" checked={ghostWalls} onChange={(e) => setUI({ ghostWalls: e.target.checked })} /> Paredes transparentes no 3D
        </label>
        <div className="legend">
          <span><i style={{ background: '#2f9e44' }} /> atende</span>
          <span><i style={{ background: '#e8a317' }} /> atenção</span>
          <span><i style={{ background: '#e03131' }} /> não atende</span>
        </div>
      </section>
    </aside>
  );
}
