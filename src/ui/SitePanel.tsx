import { useMemo, useState } from 'react';
import { CATALOG } from '../catalog/catalog';
import { SITE_FRONTS, type SiteFront, fitSite, siteStats, wallSite } from '../model/site';
import { usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import { NumberField } from './Fields';
import { fmtArea } from './format';

const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const FENCES = CATALOG.filter((c) => c.fence);

/** Terreno: medidas do lote, frente, índices e "murar o terreno". */
export function SitePanel() {
  const building = usePlan((s) => s.building);
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const site = building.site;
  const stats = useMemo(() => siteStats(building), [building]);
  const [side, setSide] = useState('muro_bloco');
  const [front, setFront] = useState('mureta_gradil');
  const [open, setOpen] = useState(false);

  const set = (patch: Partial<NonNullable<typeof site>>) => updateBuilding((b) => void (b.site = { ...b.site!, ...patch }));
  const refit = (patch: Partial<NonNullable<typeof site>> = {}) => {
    updateBuilding((b) => void (b.site = fitSite(b, { ...patch })));
    setTimeout(useUI.getState().requestFit, 0);
  };

  return (
    <section className="catalog">
      <button className="category-title" onClick={() => setOpen(!open)}>
        <h3 style={{ margin: 0 }}>{open ? '▾' : '▸'} Terreno e muros</h3>
      </button>
      {open && !site && (
        <>
          <p className="hint">Defina o lote para ver a frente da rua, o recuo, a taxa de ocupação e murar o terreno com um clique.</p>
          <button className="primary-btn" onClick={() => refit()}>
            Definir terreno (10 × 25 m)
          </button>
        </>
      )}
      {open && site && (
        <>
          <NumberField label="Frente (testada)" value={site.w} min={3} max={500} onCommit={(v) => set({ w: v })} />
          <NumberField label="Profundidade" value={site.d} min={3} max={500} onCommit={(v) => set({ d: v })} />
          <label className="select-field">
            <span>Rua (frente do lote)</span>
            <select value={site.front} onChange={(e) => refit({ w: site.w, d: site.d, front: e.target.value as SiteFront })}>
              {SITE_FRONTS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <NumberField label="Posição X" value={site.x} min={-1000} max={1000} onCommit={(v) => set({ x: v })} />
          <NumberField label="Posição Y" value={site.y} min={-1000} max={1000} onCommit={(v) => set({ y: v })} />
          <div className="row">
            <button onClick={() => refit({ w: site.w, d: site.d, front: site.front })} title="Centraliza a casa no lote com recuo frontal de 4 m">
              Ajustar à casa
            </button>
            <button onClick={() => set({ show: !site.show })}>{site.show ? 'Ocultar' : 'Mostrar'}</button>
          </div>
          {stats && (
            <>
              <div className="stat"><span>Área do terreno</span><b>{fmtArea(stats.lot)}</b></div>
              <div className="stat"><span>Projeção do térreo</span><b>{fmtArea(stats.ground)}</b></div>
              <div className="stat"><span>Área construída total</span><b>{fmtArea(stats.built)}</b></div>
              <div className="stat"><span>Taxa de ocupação</span><b>{pct(stats.occupancy)}</b></div>
              <div className="stat"><span>Coef. de aproveitamento</span><b>{stats.far.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</b></div>
              <div className="stat"><span>Área permeável</span><b>{pct(stats.permeableRate)}</b></div>
              <p className="hint">Permeável = gramado, concregrama e canteiros desenhados. Confira os limites na lei de uso do solo do município.</p>
            </>
          )}
          <h4>Murar o terreno</h4>
          <label className="select-field">
            <span>Divisas (laterais e fundo)</span>
            <select value={side} onChange={(e) => setSide(e.target.value)}>
              {FENCES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span>Frente</span>
            <select value={front} onChange={(e) => setFront(e.target.value)}>
              {FENCES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-btn"
            onClick={() => {
              let n = 0;
              updateBuilding((b) => {
                n = wallSite(b, { side, front });
              });
              const ps = usePlan.getState();
              ps.setLevel(ps.building.levels[0].id);
              useUI.getState().set({ toast: `Terreno murado: ${n} trechos e portões (garagem de correr + social) no térreo. Clique em um trecho para mudar tipo, altura ou comprimento.` });
            }}
          >
            ▤ Murar o terreno
          </button>
          <button className="link-btn" onClick={() => confirm('Remover o terreno? Os muros já desenhados continuam.') && updateBuilding((b) => void delete b.site)}>
            Remover terreno
          </button>
        </>
      )}
    </section>
  );
}
