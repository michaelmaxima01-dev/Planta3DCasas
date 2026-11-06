import { useMemo } from 'react';
import { WALL_FINISHES, type WallFinish, wallFinishDef } from '../model/wallFinish';
import { finishPreview } from '../view3d/textures';

/** Grade de acabamentos com miniatura da textura. */
export function FinishPicker({ value, color, onPick, onReset, resetTitle = 'Voltar ao padrão' }: { value?: WallFinish; color?: string; onPick: (f: WallFinish) => void; onReset?: () => void; resetTitle?: string }) {
  const previews = useMemo(() => Object.fromEntries(WALL_FINISHES.map((f) => [f.key, finishPreview(f.key, f.tint ? color ?? f.color : undefined)])), [color]);
  return (
    <>
      <div className="finish-grid">
        {WALL_FINISHES.map((f) => (
          <button key={f.key} title={f.name} aria-label={f.name} className={value === f.key ? 'active' : ''} onClick={() => onPick(f.key)}>
            <img src={previews[f.key]} alt="" />
            <span>{f.name.replace(/ \(.*\)$/, '')}</span>
          </button>
        ))}
      </div>
      <div className="finish-row">
        <small>{value ? wallFinishDef(value).name : 'Pintura lisa (padrão)'}</small>
        {onReset && (
          <button className="link-btn" onClick={onReset} title={resetTitle}>
            ↺ padrão
          </button>
        )}
      </div>
    </>
  );
}
