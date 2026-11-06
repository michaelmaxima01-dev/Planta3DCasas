import { useState } from 'react';
import { detectRooms } from '../geometry/rooms';
import { FLOOR_FINISHES } from '../model/finishes';
import { setRoomLabel } from '../model/ops';
import { usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import { FinishPicker } from './FinishPicker';

export const WALL_COLORS = [
  { c: '#f1ede6', n: 'Branco gelo' },
  { c: '#fafafa', n: 'Branco neve' },
  { c: '#efe3c2', n: 'Palha' },
  { c: '#e8dcc4', n: 'Areia' },
  { c: '#d9dcdf', n: 'Cinza claro' },
  { c: '#b9bbbd', n: 'Concreto' },
  { c: '#b7c4a8', n: 'Verde sálvia' },
  { c: '#b8c9d6', n: 'Azul serenata' },
  { c: '#f2d27a', n: 'Amarelo' },
  { c: '#c97b5a', n: 'Terracota' },
  { c: '#a9583b', n: 'Tijolinho' },
  { c: '#5b5f63', n: 'Grafite' },
];
const CEILING_COLORS = [
  { c: '#f7f7f5', n: 'Branco' },
  { c: '#ece8e0', n: 'Gelo' },
  { c: '#cfcac2', n: 'Cinza (padrão)' },
  { c: '#a7a9ac', n: 'Concreto aparente' },
  { c: '#b48a60', n: 'Madeira' },
];
const ROOF_COLORS = [
  { c: '#b4552d', n: 'Cerâmica' },
  { c: '#c97b4a', n: 'Terracota clara' },
  { c: '#8a3f22', n: 'Cerâmica escura' },
  { c: '#6f7378', n: 'Cinza' },
  { c: '#3b3f45', n: 'Grafite' },
  { c: '#4f6f52', n: 'Verde' },
  { c: '#3f5f7f', n: 'Azul' },
  { c: '#e8e8e8', n: 'Branco térmico' },
];

function Swatches({ list, value, onPick, onReset }: { list: { c: string; n: string }[]; value?: string; onPick: (c: string) => void; onReset?: () => void }) {
  return (
    <div className="swatches palette">
      {list.map((x) => (
        <button key={x.c} title={x.n} aria-label={x.n} className={value === x.c ? 'active' : ''} style={{ background: x.c }} onClick={() => onPick(x.c)} />
      ))}
      <label className="swatch-custom" title="Outra cor">
        <input type="color" value={value ?? '#ffffff'} onChange={(e) => onPick(e.target.value)} />
      </label>
      {onReset && (
        <button className="swatch-reset" title="Voltar ao padrão" onClick={onReset}>
          ↺
        </button>
      )}
    </div>
  );
}

/** Paleta do projeto: paredes, teto/lajes, telhado e piso de todos os cômodos. */
export function ColorPanel() {
  const colors = usePlan((s) => s.building.colors) ?? {};
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const [open, setOpen] = useState(false);
  const set = (k: 'wall' | 'ceiling' | 'roof', c: string | undefined) =>
    updateBuilding((b) => {
      b.colors = { ...b.colors, [k]: c };
      if (!c) delete b.colors[k];
    });
  const allFloors = (c: string) => {
    updateBuilding((b) => {
      for (const l of b.levels) for (const r of detectRooms(l.plan)) setRoomLabel(l.plan, r.labelId, r.center, { floorColor: c }, { name: r.name, floorColor: r.floorColor });
    });
    useUI.getState().set({ toast: 'Piso aplicado a todos os cômodos de todos os andares.' });
  };
  return (
    <section>
      <button className="category-title" onClick={() => setOpen(!open)}>
        <h3 style={{ margin: 0 }}>{open ? '▾' : '▸'} Cores do projeto</h3>
      </button>
      {open && (
        <>
          <h4>Acabamento das paredes</h4>
          <FinishPicker
            value={colors.wallFinish}
            color={colors.wall}
            onPick={(f) => updateBuilding((b) => void (b.colors = { ...b.colors, wallFinish: f }))}
            onReset={() => updateBuilding((b) => void (b.colors && delete b.colors.wallFinish))}
          />
          <h4>Cor das paredes</h4>
          <Swatches list={WALL_COLORS} value={colors.wall} onPick={(c) => set('wall', c)} onReset={() => set('wall', undefined)} />
          <h4>Teto e lajes</h4>
          <Swatches list={CEILING_COLORS} value={colors.ceiling} onPick={(c) => set('ceiling', c)} onReset={() => set('ceiling', undefined)} />
          <h4>Telhado</h4>
          <Swatches list={ROOF_COLORS} value={colors.roof} onPick={(c) => set('roof', c)} onReset={() => set('roof', undefined)} />
          <h4>Piso (todos os cômodos)</h4>
          <Swatches list={FLOOR_FINISHES.map((f) => ({ c: f.c, n: f.n }))} onPick={allFloors} />
          <p className="hint">A cor tinge pinturas, texturas e cerâmicas; tijolinho, madeira, pedra, concreto e mármore têm cor própria. Para uma parede, muro ou cômodo específico, selecione-o na planta e escolha a cor no painel da direita.</p>
        </>
      )}
    </section>
  );
}
