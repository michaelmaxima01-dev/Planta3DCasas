import { useState } from 'react';
import { CATALOG, CATEGORIES } from '../catalog/catalog';
import { type Tool, useUI } from '../store/uiStore';
import { selectPlan, usePlan } from '../store/planStore';
import { NumberField } from './Fields';
import { LevelBar } from './LevelBar';
import { OPENING_STYLES } from '../model/openings';
import { RoofPanel } from './RoofPanel';
import { fmtNumber } from './format';

const ANNOT_TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'pencil', label: 'Lápis', key: 'L', icon: '✎' },
  { id: 'arrow', label: 'Seta', key: 'A', icon: '➚' },
  { id: 'text', label: 'Texto', key: 'T', icon: 'T' },
  { id: 'measure', label: 'Medir', key: 'M', icon: '↔' },
];
const ANNOT_COLORS = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#7048e8', '#212529'];

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Selecionar', key: 'V', icon: '➤' },
  { id: 'wall', label: 'Parede', key: 'W', icon: '▬' },
  { id: 'room', label: 'Cômodo (retângulo)', key: 'C', icon: '▭' },
  { id: 'door', label: 'Porta', key: 'D', icon: '◜' },
  { id: 'window', label: 'Janela', key: 'J', icon: '▭' },
];

export function Sidebar() {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const catalogId = useUI((s) => s.catalogId);
  const pickCatalog = useUI((s) => s.pickCatalog);
  const wallThickness = useUI((s) => s.wallThickness);
  const wallHeight = useUI((s) => s.wallHeight);
  const setWallDefaults = useUI((s) => s.setWallDefaults);
  const doorStyle = useUI((s) => s.doorStyle);
  const windowStyle = useUI((s) => s.windowStyle);
  const setUI = useUI((s) => s.set);
  const annotColor = useUI((s) => s.annotColor);
  const annotCount = usePlan((s) => Object.keys(selectPlan(s).annotations ?? {}).length);
  const update = usePlan((s) => s.update);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(CATEGORIES[0]);

  const items = CATALOG.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <aside className="sidebar">
      <LevelBar />
      <section>
        <h3>Ferramentas</h3>
        <div className="tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={tool === t.id ? 'active' : ''} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
              <span className="icon">{t.icon}</span>
              {t.label}
              <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Marcações</h3>
        <div className="tools tools-grid">
          {ANNOT_TOOLS.map((t) => (
            <button key={t.id} className={tool === t.id ? 'active' : ''} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
              <span className="icon">{t.icon}</span>
              {t.label}
              <kbd>{t.key}</kbd>
            </button>
          ))}
        </div>
        <div className="swatch-row">
          {ANNOT_COLORS.map((c) => (
            <button key={c} className={annotColor === c ? 'active' : ''} style={{ background: c }} onClick={() => setUI({ annotColor: c })} aria-label={`Cor ${c}`} />
          ))}
        </div>
        {annotCount > 0 && (
          <button className="link-btn" onClick={() => confirm('Apagar todas as marcações deste andar?') && update((d) => void (d.annotations = {}))}>
            Apagar marcações deste andar ({annotCount})
          </button>
        )}
      </section>

      {(tool === 'door' || tool === 'window') && (
        <section>
          <h3>{tool === 'door' ? 'Tipo de porta' : 'Tipo de janela'}</h3>
          <div className="tools">
            {OPENING_STYLES.filter((o) => o.kind === tool).map((o) => (
              <button
                key={o.key}
                className={(tool === 'door' ? doorStyle : windowStyle) === o.key ? 'active' : ''}
                onClick={() => setUI(tool === 'door' ? { doorStyle: o.key } : { windowStyle: o.key })}
              >
                {o.name}
                <kbd>
                  {fmtNumber(o.width)}×{fmtNumber(o.height)}
                </kbd>
              </button>
            ))}
          </div>
        </section>
      )}

      {(tool === 'wall' || tool === 'room') && (
        <section>
          <h3>Nova parede</h3>
          <NumberField label="Espessura" value={wallThickness} min={0.05} max={1} onCommit={(v) => setWallDefaults({ thickness: v })} />
          <NumberField label="Altura" value={wallHeight} min={0.5} max={10} onCommit={(v) => setWallDefaults({ height: v })} />
        </section>
      )}

      <RoofPanel />

      <section className="catalog">
        <h3>Catálogo</h3>
        <input className="search" placeholder="Buscar móvel…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {CATEGORIES.map((cat) => {
          const list = items.filter((i) => i.category === cat);
          if (list.length === 0) return null;
          const expanded = filter !== '' || open === cat;
          return (
            <div key={cat} className="category">
              <button className="category-title" onClick={() => setOpen(open === cat ? null : cat)}>
                {expanded ? '▾' : '▸'} {cat} <small>{list.length}</small>
              </button>
              {expanded &&
                list.map((item) => (
                  <button
                    key={item.id}
                    className={`catalog-item ${tool === 'furniture' && catalogId === item.id ? 'active' : ''}`}
                    onClick={() => pickCatalog(item.id)}
                  >
                    <span>{item.name}</span>
                    <small>
                      {fmtNumber(item.width)} × {fmtNumber(item.depth)} m
                    </small>
                  </button>
                ))}
            </div>
          );
        })}
      </section>
    </aside>
  );
}
