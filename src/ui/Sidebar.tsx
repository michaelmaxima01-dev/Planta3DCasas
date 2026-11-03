import { useState } from 'react';
import { CATALOG, CATEGORIES } from '../catalog/catalog';
import { type Tool, useUI } from '../store/uiStore';
import { NumberField } from './Fields';
import { fmtNumber } from './format';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Selecionar', key: 'V', icon: '➤' },
  { id: 'wall', label: 'Parede', key: 'W', icon: '▬' },
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
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(CATEGORIES[0]);

  const items = CATALOG.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <aside className="sidebar">
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

      {tool === 'wall' && (
        <section>
          <h3>Nova parede</h3>
          <NumberField label="Espessura" value={wallThickness} min={0.05} max={1} onCommit={(v) => setWallDefaults({ thickness: v })} />
          <NumberField label="Altura" value={wallHeight} min={0.5} max={10} onCommit={(v) => setWallDefaults({ height: v })} />
        </section>
      )}

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
