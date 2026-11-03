import { type PointerEvent as RPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { snapPoint } from '../geometry/snap';
import { type Vec2, clamp, dist } from '../geometry/vec';
import { computeWallGeometry } from '../geometry/walls';
import { planBounds } from '../model/ops';
import type { SelectionKind } from '../model/types';
import { beginGesture, endGesture, selectLevel, usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import { fmtNumber } from '../ui/format';
import type { Status } from './analyze';
import { addBeam, addPillarAxis, cachedAnalysis, movePillarAxis } from './ops';
import { BALDRAME } from './types';

export const STATUS_COLOR: Record<Status, string> = { ok: '#2f9e44', warn: '#e8a317', fail: '#e03131' };
const ACCENT = '#2f7cf6';
const pts = (p: Vec2[]) => p.map((q) => `${q.x},${q.y}`).join(' ');
const deg = (r: number) => (r * 180) / Math.PI;

interface View {
  s: number;
  ox: number;
  oy: number;
}

export function StructPlan2D() {
  const building = usePlan((s) => s.building);
  const level = usePlan(selectLevel);
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const selection = useUI((s) => s.selection);
  const select = useUI((s) => s.select);
  const foundationView = useUI((s) => s.foundationView);
  const tool = useUI((s) => s.structTool);
  const colorByStatus = useUI((s) => s.colorByStatus);
  const fitToken = useUI((s) => s.fitToken);

  const result = useMemo(() => cachedAnalysis(building), [building]);
  const plan = foundationView ? building.levels[0].plan : level.plan;
  const levelKey = foundationView ? BALDRAME : level.id;
  const geoms = useMemo(() => Object.values(computeWallGeometry(plan)), [plan]);

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ s: 50, ox: 60, oy: 60 });
  const [hover, setHover] = useState<Vec2 | null>(null);
  const [beamStart, setBeamStart] = useState<string | null>(null);
  const drag = useRef<{ kind: 'pan'; sx: number; sy: number; ox: number; oy: number } | { kind: 'pillar'; id: string; from: Vec2 } | null>(null);

  useEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size) return;
    const b = planBounds(building.levels[0].plan) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };
    const pad = 70;
    const s = clamp(Math.min((size.w - 2 * pad) / Math.max(1, b.maxX - b.minX), (size.h - 2 * pad) / Math.max(1, b.maxY - b.minY)), 8, 400);
    setView({ s, ox: size.w / 2 - ((b.minX + b.maxX) / 2) * s, oy: size.h / 2 - ((b.minY + b.maxY) / 2) * s });
  }, [size, building.levels]);
  const fitted = useRef(false);
  useEffect(() => {
    if (size && !fitted.current) {
      fitted.current = true;
      fit();
    }
  }, [size, fit]);
  useEffect(() => {
    if (fitToken > 0) fit();
  }, [fitToken, fit]);
  useEffect(() => setBeamStart(null), [tool, levelKey]);

  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView((v) => {
        const s = clamp(v.s * Math.exp(-e.deltaY * 0.0015), 5, 800);
        const k = s / v.s;
        return { s, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toPlan = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s };
  };
  const hit = (e: RPointerEvent) => {
    const el = (e.target as Element).closest('[data-kind]');
    return el ? { kind: el.getAttribute('data-kind') as SelectionKind, id: el.getAttribute('data-id')! } : null;
  };

  const levelPillars = Object.values(building.structure.pillars).filter((p) => p.levelId === (foundationView ? building.levels[0].id : level.id));

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    svgRef.current!.setPointerCapture(e.pointerId);
    const p = toPlan(e);
    const h = hit(e);
    if (e.button !== 0 || (tool === 'select' && !h)) {
      if (e.button === 0) select(null);
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy };
      return;
    }
    if (tool === 'select' && h) {
      select(h);
      if (h.kind === 'pillar' && !foundationView) {
        const q = building.structure.pillars[h.id];
        beginGesture();
        drag.current = { kind: 'pillar', id: h.id, from: { x: q.x, y: q.y } };
      }
      return;
    }
    if (tool === 'pillar' && !foundationView) {
      const sn = snapPoint(plan, p, { pxPerMeter: view.s });
      let id: string | null = null;
      updateBuilding((b) => {
        id = addPillarAxis(b, level.id, sn.point);
      });
      if (id) select({ kind: 'pillar', id });
      return;
    }
    if (tool === 'beam') {
      const target = h?.kind === 'pillar' ? h.id : levelPillars.find((q) => dist(q, p) < 14 / view.s)?.id;
      if (!target) return;
      if (!beamStart) {
        setBeamStart(target);
        return;
      }
      let id: string | null = null;
      const lk = levelKey;
      updateBuilding((b) => {
        id = addBeam(b, lk, beamStart, target);
      });
      setBeamStart(target);
      if (id) select({ kind: 'beam', id });
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toPlan(e);
    setHover(p);
    const d = drag.current;
    if (d?.kind === 'pan') setView((v) => ({ ...v, ox: d.ox + e.clientX - d.sx, oy: d.oy + e.clientY - d.sy }));
    if (d?.kind === 'pillar') {
      const sn = snapPoint(plan, p, { pxPerMeter: view.s, disabled: e.altKey });
      const from = d.from;
      updateBuilding((b) => movePillarAxis(b, d.id, from, sn.point));
      d.from = sn.point;
    }
  };
  const onPointerUp = () => {
    if (drag.current?.kind === 'pillar') endGesture();
    drag.current = null;
  };

  const s = view.s;
  const px = (n: number) => n / s;
  const isSel = (kind: SelectionKind, id: string) => selection?.kind === kind && selection.id === id;
  const color = (st: Status, kind: SelectionKind, id: string) => (isSel(kind, id) ? ACCENT : colorByStatus ? STATUS_COLOR[st] : '#495057');

  const slabs = result.slabs.filter((x) => x.levelId === level.id && !foundationView);
  const beams = result.beams.filter((x) => x.levelId === levelKey);
  const pillars = result.pillars.filter((x) => x.levelId === (foundationView ? building.levels[0].id : level.id));
  const footings = foundationView ? result.footings : [];

  return (
    <svg
      ref={svgRef}
      className={`plan2d ${tool === 'select' ? '' : 'cursor-crosshair'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <rect width="100%" height="100%" fill="#f7f8fa" />
      <g transform={`translate(${view.ox} ${view.oy}) scale(${s})`}>
        {/* paredes da arquitetura, só como referência */}
        <g pointerEvents="none">
          {geoms.map((g) => (
            <polygon key={g.id} points={pts(g.polygon)} fill="#d7dce2" stroke="#c3c9d1" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          ))}
        </g>

        {slabs.map((x) => (
          <g key={x.id} data-kind="slab" data-id={x.id}>
            <polygon
              points={pts(x.polygon)}
              fill={isSel('slab', x.id) ? '#dbe8ff' : colorByStatus && x.status !== 'ok' ? `${STATUS_COLOR[x.status]}22` : 'rgba(120,130,145,0.08)'}
              stroke={isSel('slab', x.id) ? ACCENT : 'none'}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
        <g pointerEvents="none">
          {slabs.map((x) => {
            const c = x.polygon.reduce((a, q) => ({ x: a.x + q.x / x.polygon.length, y: a.y + q.y / x.polygon.length }), { x: 0, y: 0 });
            return (
              <g key={x.id} transform={`translate(${c.x} ${c.y})`}>
                <text fontSize={px(13)} textAnchor="middle" fontWeight={700} fill="#37414d" className="room-text">
                  {x.code}
                </text>
                <text y={px(14)} fontSize={px(10.5)} textAnchor="middle" fill="#5c6773" className="room-text">
                  {x.system.replace('Treliçada ', '')} • h={x.thickness}
                </text>
                <text y={px(27)} fontSize={px(10)} textAnchor="middle" fill="#7a8591" className="room-text">
                  {fmtNumber(x.q)} kN/m²
                </text>
              </g>
            );
          })}
        </g>

        {footings.map((f) => (
          <g key={f.id} data-kind="footing" data-id={f.id} transform={`translate(${f.p.x} ${f.p.y}) rotate(${deg(f.rotation)})`}>
            <rect x={-f.L / 2} y={-f.B / 2} width={f.L} height={f.B} fill={`${color(f.status, 'footing', f.id)}26`} stroke={color(f.status, 'footing', f.id)} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            {f.kind === 'estaca' &&
              Array.from({ length: f.piles }, (_, k) => (
                <circle key={k} cx={f.piles === 1 ? 0 : -f.L / 2 + 0.3 + (k * (f.L - 0.6)) / Math.max(1, f.piles - 1)} cy={0} r={0.125} fill="none" stroke="#495057" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
          </g>
        ))}

        {beams.map((v) => {
          const L = v.L;
          const ang = deg(Math.atan2(v.b.y - v.a.y, v.b.x - v.a.x));
          const w = v.bw / 100;
          const c = color(v.status, 'beam', v.id);
          return (
            <g key={v.id} data-kind="beam" data-id={v.id} transform={`translate(${v.a.x} ${v.a.y}) rotate(${ang})`}>
              <rect x={0} y={-w / 2} width={L} height={w} fill={isSel('beam', v.id) ? '#2f7cf633' : 'rgba(0,0,0,0.02)'} stroke={c} strokeWidth={1.4} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
              <rect x={0} y={-px(7)} width={L} height={px(14)} fill="rgba(0,0,0,0)" />
            </g>
          );
        })}

        {pillars.map((p) => {
          const c = color(p.status, 'pillar', p.id);
          return (
            <g key={p.id} data-kind="pillar" data-id={p.id} transform={`translate(${p.p.x} ${p.p.y}) rotate(${deg(p.rotation)})`}>
              <rect x={-p.h / 200} y={-p.b / 200} width={p.h / 100} height={p.b / 100} fill={c} stroke="#1f2328" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
              <rect x={-px(9)} y={-px(9)} width={px(18)} height={px(18)} fill="rgba(0,0,0,0)" />
            </g>
          );
        })}

        {/* rótulos */}
        <g pointerEvents="none">
          {beams.map((v) => {
            const mid = { x: (v.a.x + v.b.x) / 2, y: (v.a.y + v.b.y) / 2 };
            let a = deg(Math.atan2(v.b.y - v.a.y, v.b.x - v.a.x));
            if (a > 90) a -= 180;
            if (a <= -90) a += 180;
            return v.L * s > 50 ? (
              <text key={v.id} transform={`translate(${mid.x} ${mid.y}) rotate(${a}) translate(0 ${-px(9)})`} fontSize={px(10)} textAnchor="middle" fill="#1d3b6e" fontWeight={600} className="dim-text">
                {v.code} {v.bw}×{v.h}
              </text>
            ) : null;
          })}
          {pillars.map((p) => (
            <text key={p.id} x={p.p.x + px(10)} y={p.p.y - px(10)} fontSize={px(10.5)} fill="#1f2328" fontWeight={700} className="dim-text">
              {p.code} {p.b}/{p.h}
            </text>
          ))}
          {footings.map((f) => (
            <text key={f.id} x={f.p.x} y={f.p.y + f.B / 2 + px(12)} fontSize={px(10)} textAnchor="middle" fill="#1f2328" fontWeight={600} className="dim-text">
              {f.code} {f.kind === 'estaca' ? `${f.piles} est.` : `${Math.round(f.L * 100)}×${Math.round(f.B * 100)} h${Math.round(f.h * 100)}`}
            </text>
          ))}
        </g>

        {tool === 'beam' && beamStart && hover && building.structure.pillars[beamStart] && (
          <line
            x1={building.structure.pillars[beamStart].x}
            y1={building.structure.pillars[beamStart].y}
            x2={hover.x}
            y2={hover.y}
            stroke={ACCENT}
            strokeWidth={2}
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </g>
    </svg>
  );
}
