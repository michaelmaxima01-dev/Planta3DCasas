import { CATALOG_BY_ID } from '../catalog/catalog';
import type { WallGeom } from '../geometry/walls';
import { openingCenter } from '../geometry/walls';
import type { FurnitureItem, Opening } from '../model/types';

export const ACCENT = '#2f7cf6';
const deg = (r: number) => (r * 180) / Math.PI;

/** Símbolo de porta (folha + arco de abertura) ou janela (caixilho) sobre a parede. */
export function OpeningSymbol({
  op,
  g,
  selected = false,
  ghost = false,
}: {
  op: Pick<Opening, 'kind' | 'offset' | 'width' | 'flip' | 'side'> & { id?: string };
  g: WallGeom;
  selected?: boolean;
  ghost?: boolean;
}) {
  const c = openingCenter(g, op as Opening);
  const t = g.thickness;
  const w = op.width;
  const stroke = selected || ghost ? ACCENT : '#3a4047';
  const sw = selected ? 2 : 1;
  const hingeX = op.flip ? w / 2 : -w / 2;
  const s = op.side ? -1 : 1;
  const towardOther = -Math.sign(hingeX);
  const arc: string[] = [];
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * (Math.PI / 2);
    arc.push(`${hingeX + towardOther * w * Math.cos(a)},${s * (t / 2 + w * Math.sin(a))}`);
  }
  return (
    <g
      transform={`translate(${c.x} ${c.y}) rotate(${deg(Math.atan2(g.dir.y, g.dir.x))})`}
      data-kind={op.id ? 'opening' : undefined}
      data-id={op.id}
      opacity={ghost ? 0.7 : 1}
    >
      <rect x={-w / 2} y={-t / 2 - 0.004} width={w} height={t + 0.008} fill="#ffffff" stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
      {op.kind === 'door' ? (
        <>
          <line x1={hingeX} y1={s * (t / 2)} x2={hingeX} y2={s * (t / 2 + w)} stroke={stroke} strokeWidth={sw + 0.5} vectorEffect="non-scaling-stroke" />
          <polyline points={arc.join(' ')} fill="none" stroke={stroke} strokeWidth={0.8} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          {/* área de clique ao redor do arco */}
          <rect x={-w / 2} y={s > 0 ? t / 2 : -t / 2 - w} width={w} height={w} fill="rgba(0,0,0,0)" />
        </>
      ) : (
        <>
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" />
          <line x1={-w / 2} y1={-t / 5} x2={w / 2} y2={-t / 5} stroke={stroke} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          <line x1={-w / 2} y1={t / 5} x2={w / 2} y2={t / 5} stroke={stroke} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        </>
      )}
    </g>
  );
}

/** Móvel visto de cima, gerado a partir das mesmas peças do 3D. */
export function FurnitureSymbol({
  f,
  selected = false,
  ghost = false,
}: {
  f: Pick<FurnitureItem, 'catalogId' | 'x' | 'y' | 'rotation' | 'width' | 'depth' | 'height'> & { id?: string };
  selected?: boolean;
  ghost?: boolean;
}) {
  const item = CATALOG_BY_ID[f.catalogId];
  if (!item) return null;
  const parts = item
    .parts(f.width, f.depth, f.height)
    .map((p, i) => ({ p, i, top: p.y + p.sy / 2 }))
    .sort((a, b) => a.top - b.top || a.i - b.i);
  return (
    <g
      transform={`translate(${f.x} ${f.y}) rotate(${deg(f.rotation)})`}
      data-kind={f.id ? 'furniture' : undefined}
      data-id={f.id}
      opacity={ghost ? 0.6 : 1}
    >
      <rect x={-f.width / 2} y={-f.depth / 2} width={f.width} height={f.depth} fill="rgba(0,0,0,0)" />
      {parts.map(({ p, i }) => {
        const fill = p.color;
        const common = {
          fill,
          fillOpacity: p.material === 'glass' ? 0.35 : 0.92,
          stroke: '#4a4f55',
          strokeWidth: 0.6,
          vectorEffect: 'non-scaling-stroke' as const,
        };
        return p.shape === 'box' ? (
          <rect key={i} x={p.x - p.sx / 2} y={p.z - p.sz / 2} width={p.sx} height={p.sz} {...common} />
        ) : (
          <ellipse key={i} cx={p.x} cy={p.z} rx={p.sx / 2} ry={p.sz / 2} {...common} />
        );
      })}
      {(selected || ghost) && (
        <rect
          x={-f.width / 2 - 0.03}
          y={-f.depth / 2 - 0.03}
          width={f.width + 0.06}
          height={f.depth + 0.06}
          fill="none"
          stroke={ACCENT}
          strokeWidth={1.5}
          strokeDasharray="5 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {selected && (
        <line x1={0} y1={f.depth / 2} x2={0} y2={f.depth / 2 + 0.25} stroke={ACCENT} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      )}
    </g>
  );
}
