import { MIN_SLOPE, ROOF_SUPPORTS, ROOF_TYPES, type RoofModel, type RoofSupport, type RoofType, defaultRoof } from '../roof/roof';
import { usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import { ROOFS, type RoofKind } from '../structure/types';
import { NumberField } from './Fields';

/** Configuração do telhado (fica sobre o último andar). */
export function RoofPanel() {
  const stored = usePlan((s) => s.building.roof);
  const roof = { ...defaultRoof(), ...stored };
  const material = usePlan((s) => s.building.structure.settings.roof);
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const showRoof = useUI((s) => s.showRoof);
  const setUI = useUI((s) => s.set);
  const set = (patch: Partial<RoofModel>) => updateBuilding((b) => void (b.roof = { ...defaultRoof(), ...b.roof, ...patch }));
  const min = MIN_SLOPE[material];
  const pitched = roof.type !== 'plano';
  return (
    <section className="params">
      <h3>Telhado</h3>
      <label className="select-field">
        <span>Formato</span>
        <select
          value={roof.type}
          onChange={(e) => {
            const type = e.target.value as RoofType;
            updateBuilding((b) => {
              b.roof = { ...defaultRoof(), ...b.roof, type };
              if (type === 'plano') b.structure.settings.roof = 'laje';
              else if (b.structure.settings.roof === 'laje') b.structure.settings.roof = 'ceramica';
            });
          }}
        >
          {ROOF_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {pitched && (
        <>
          <label className="select-field">
            <span>Telha</span>
            <select
              value={material}
              onChange={(e) => {
                const m = e.target.value as RoofKind;
                updateBuilding((b) => {
                  b.structure.settings.roof = m;
                  const r = { ...defaultRoof(), ...b.roof };
                  if (r.slope < MIN_SLOPE[m]) r.slope = MIN_SLOPE[m];
                  b.roof = r;
                });
              }}
            >
              {ROOFS.filter((x) => x.key !== 'laje').map((x) => (
                <option key={x.key} value={x.key}>
                  {x.name} (mín. {x.minSlope}%)
                </option>
              ))}
            </select>
          </label>
          <NumberField label="Inclinação" value={roof.slope} suffix="%" digits={0} min={1} max={100} onCommit={(v) => set({ slope: v })} />
          {roof.slope < min && <p className="hint warn-text">Abaixo do mínimo usual para esta telha ({min}%).</p>}
          <NumberField label="Beiral" value={roof.overhang} min={0} max={2} onCommit={(v) => set({ overhang: v })} />
          <label className="check-row">
            <input type="checkbox" checked={roof.rotate} onChange={(e) => set({ rotate: e.target.checked })} /> Girar a cumeeira 90°
          </label>
          <label className="select-field">
            <span>Sustentação</span>
            <select value={roof.support ?? 'laje'} onChange={(e) => set({ support: e.target.value as RoofSupport })}>
              {ROOF_SUPPORTS.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <p className="hint small">{ROOF_SUPPORTS.find((x) => x.key === (roof.support ?? 'laje'))?.text}</p>
        </>
      )}
      <label className="check-row">
        <input type="checkbox" checked={showRoof} onChange={(e) => setUI({ showRoof: e.target.checked })} /> Mostrar telhado (3D e último andar)
      </label>
    </section>
  );
}
