import { useMemo } from 'react';
import { CATALOG_BY_ID } from '../catalog/catalog';
import { detectRooms } from '../geometry/rooms';
import { dist } from '../geometry/vec';
import { clampOpeningOffset } from '../geometry/walls';
import { deleteSelection, duplicateFurniture, moveNode, setRoomLabel, setWallLength } from '../model/ops';
import type { Plan } from '../model/types';
import { usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import { NumberField, TextField } from './Fields';
import { fmtArea, fmtMeters } from './format';

const FLOOR_COLORS = [
  { c: '#d9c4a3', n: 'Madeira clara' },
  { c: '#c8a77f', n: 'Madeira' },
  { c: '#9c7652', n: 'Madeira escura' },
  { c: '#cfd8dc', n: 'Porcelanato cinza' },
  { c: '#ece7df', n: 'Porcelanato bege' },
  { c: '#b9c4b0', n: 'Cerâmica verde' },
  { c: '#a7a9ac', n: 'Cimento queimado' },
  { c: '#f2f2f2', n: 'Branco' },
];

export function PropertiesPanel() {
  const plan = usePlan((s) => s.plan);
  const update = usePlan((s) => s.update);
  const selection = useUI((s) => s.selection);
  const select = useUI((s) => s.select);
  const rooms = useMemo(() => detectRooms(plan), [plan]);

  const remove = () => {
    update((d) => deleteSelection(d, selection));
    select(null);
  };

  const body = (() => {
    if (!selection) return <Summary plan={plan} rooms={rooms} onPick={(id) => select({ kind: 'room', id })} />;
    switch (selection.kind) {
      case 'wall': {
        const w = plan.walls[selection.id];
        if (!w) return null;
        const L = dist(plan.nodes[w.a], plan.nodes[w.b]);
        return (
          <>
            <h3>Parede</h3>
            <NumberField label="Comprimento" value={L} min={0.1} max={100} onCommit={(v) => update((d) => setWallLength(d, w.id, v))} />
            <NumberField label="Espessura" value={w.thickness} min={0.05} max={1} onCommit={(v) => update((d) => void (d.walls[w.id].thickness = v))} />
            <NumberField label="Altura" value={w.height} min={0.5} max={10} onCommit={(v) => update((d) => void (d.walls[w.id].height = v))} />
            <p className="hint">Arraste a parede para movê-la. Arraste as bolinhas das pontas para mudar o ângulo e o tamanho.</p>
          </>
        );
      }
      case 'node': {
        const n = plan.nodes[selection.id];
        if (!n) return null;
        return (
          <>
            <h3>Canto</h3>
            <NumberField label="X" value={n.x} onCommit={(v) => update((d) => moveNode(d, n.id, { x: v, y: n.y }))} />
            <NumberField label="Y" value={n.y} onCommit={(v) => update((d) => moveNode(d, n.id, { x: n.x, y: v }))} />
            <p className="hint">Solte um canto sobre outro canto para juntá-los, ou sobre uma parede para criar uma junção em T.</p>
          </>
        );
      }
      case 'opening': {
        const op = plan.openings[selection.id];
        const w = op && plan.walls[op.wallId];
        if (!op || !w) return null;
        const L = dist(plan.nodes[w.a], plan.nodes[w.b]);
        const set = (patch: Partial<typeof op>) =>
          update((d) => {
            const o = d.openings[op.id];
            Object.assign(o, patch);
            o.offset = clampOpeningOffset(L, o.width, o.offset);
            o.height = Math.min(o.height, w.height - o.sill);
          });
        return (
          <>
            <h3>{op.kind === 'door' ? 'Porta' : 'Janela'}</h3>
            <div className="segmented">
              <button className={op.kind === 'door' ? 'active' : ''} onClick={() => set({ kind: 'door', sill: 0, height: 2.1 })}>Porta</button>
              <button className={op.kind === 'window' ? 'active' : ''} onClick={() => set({ kind: 'window', sill: 1.0, height: 1.2 })}>Janela</button>
            </div>
            <NumberField label="Largura" value={op.width} min={0.3} max={Math.max(0.3, L - 0.2)} onCommit={(v) => set({ width: v })} />
            <NumberField label="Altura" value={op.height} min={0.2} max={w.height} onCommit={(v) => set({ height: v })} />
            {op.kind === 'window' && <NumberField label="Peitoril" value={op.sill} min={0} max={w.height - 0.2} onCommit={(v) => set({ sill: v })} />}
            <NumberField label="Posição" value={op.offset} min={0} max={L} onCommit={(v) => set({ offset: v })} />
            {op.kind === 'door' && (
              <div className="row">
                <button onClick={() => set({ flip: !op.flip })}>⇄ Dobradiça</button>
                <button onClick={() => set({ side: !op.side })}>⇅ Lado</button>
              </div>
            )}
            <p className="hint">Arraste a abertura ao longo da parede para reposicionar.</p>
          </>
        );
      }
      case 'furniture': {
        const f = plan.furniture[selection.id];
        if (!f) return null;
        const item = CATALOG_BY_ID[f.catalogId];
        const set = (patch: Partial<typeof f>) => update((d) => void Object.assign(d.furniture[f.id], patch));
        const degrees = (((f.rotation * 180) / Math.PI) % 360 + 360) % 360;
        return (
          <>
            <h3>{item?.name ?? 'Móvel'}</h3>
            <NumberField label="Largura" value={f.width} min={0.05} max={20} onCommit={(v) => set({ width: v })} />
            <NumberField label="Profundidade" value={f.depth} min={0.05} max={20} onCommit={(v) => set({ depth: v })} />
            <NumberField label="Altura" value={f.height} min={0.01} max={10} onCommit={(v) => set({ height: v })} />
            <NumberField label="Elevação" value={f.elevation} min={0} max={10} onCommit={(v) => set({ elevation: v })} />
            <NumberField label="Rotação" value={degrees} suffix="°" digits={1} onCommit={(v) => set({ rotation: (v * Math.PI) / 180 })} />
            <div className="row">
              <button onClick={() => set({ rotation: f.rotation + Math.PI / 2 })}>↻ Girar 90° (R)</button>
              <button
                onClick={() => {
                  let id: string | null = null;
                  update((d) => {
                    id = duplicateFurniture(d, f.id);
                  });
                  if (id) select({ kind: 'furniture', id });
                }}
              >
                ⧉ Duplicar
              </button>
            </div>
            <p className="hint">Perto de uma parede o móvel encosta sozinho. Segure Alt para soltar livre.</p>
          </>
        );
      }
      case 'room': {
        const r = rooms.find((x) => x.id === selection.id);
        if (!r) return null;
        const save = (patch: { name?: string; floorColor?: string }) => {
          let id = '';
          update((d) => {
            id = setRoomLabel(d, r.labelId, r.center, patch, { name: r.name, floorColor: r.floorColor });
          });
          if (id !== selection.id) select({ kind: 'room', id });
        };
        return (
          <>
            <h3>Cômodo</h3>
            <TextField label="Nome" value={r.name} onCommit={(name) => save({ name })} />
            <div className="stat"><span>Área útil</span><b>{fmtArea(r.area)}</b></div>
            <div className="stat"><span>Perímetro</span><b>{fmtMeters(r.perimeter)}</b></div>
            <h4>Piso</h4>
            <div className="swatches">
              {FLOOR_COLORS.map((fc) => (
                <button
                  key={fc.c}
                  title={fc.n}
                  className={r.floorColor === fc.c ? 'active' : ''}
                  style={{ background: fc.c }}
                  onClick={() => save({ floorColor: fc.c })}
                />
              ))}
            </div>
          </>
        );
      }
    }
  })();

  return (
    <aside className="properties">
      {body ?? <Summary plan={plan} rooms={rooms} onPick={(id) => select({ kind: 'room', id })} />}
      {selection && body && (
        <button className="danger" onClick={remove}>
          🗑 Excluir (Delete)
        </button>
      )}
    </aside>
  );
}

function Summary({ plan, rooms, onPick }: { plan: Plan; rooms: ReturnType<typeof detectRooms>; onPick: (id: string) => void }) {
  const total = rooms.reduce((s, r) => s + r.area, 0);
  return (
    <>
      <h3>Projeto</h3>
      <div className="stat"><span>Paredes</span><b>{Object.keys(plan.walls).length}</b></div>
      <div className="stat"><span>Portas e janelas</span><b>{Object.keys(plan.openings).length}</b></div>
      <div className="stat"><span>Móveis</span><b>{Object.keys(plan.furniture).length}</b></div>
      <div className="stat"><span>Área útil total</span><b>{fmtArea(total)}</b></div>
      <h4>Cômodos</h4>
      {rooms.length === 0 && <p className="hint">Feche um contorno de paredes para criar um cômodo.</p>}
      {rooms.map((r) => (
        <button key={r.id} className="room-row" onClick={() => onPick(r.id)}>
          <i style={{ background: r.floorColor }} />
          <span>{r.name}</span>
          <b>{fmtArea(r.area)}</b>
        </button>
      ))}
      <p className="hint">Clique em um item na planta ou no 3D para editar.</p>
    </>
  );
}

