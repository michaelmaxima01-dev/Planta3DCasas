import { type PointerEvent as RPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG_BY_ID } from '../catalog/catalog';
import { detectRooms } from '../geometry/rooms';
import { type SnapResult, roundTo, snapFurnitureToWall, snapPoint } from '../geometry/snap';
import { type Vec2, add, clamp, dist, dot, mul, normalize, perp, pointInPolygon, projectOnSegment, sub } from '../geometry/vec';
import { type WallGeom, clampOpeningOffset, computeWallGeometry } from '../geometry/walls';
import {
  OPENING_DEFAULTS,
  addFurniture,
  addOpening,
  addWall,
  mergeNodes,
  moveNode,
  planBounds,
  splitWall,
  wallsAtNode,
} from '../model/ops';
import type { OpeningKind, SelectionKind } from '../model/types';
import { beginGesture, endGesture, usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import { fmtArea, fmtMeters } from '../ui/format';
import { ACCENT, FurnitureSymbol, OpeningSymbol } from './symbols';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'node'; id: string; snap: SnapResult | null }
  | { kind: 'wall'; id: string; start: Vec2; a: Vec2; b: Vec2 }
  | { kind: 'furniture'; id: string; start: Vec2; orig: Vec2; rot: number }
  | { kind: 'opening'; id: string };

interface View {
  s: number; // pixels por metro
  ox: number;
  oy: number;
}

const pts = (p: Vec2[]) => p.map((q) => `${q.x},${q.y}`).join(' ');
const deg = (r: number) => (r * 180) / Math.PI;
const readable = (d: number) => (d > 90 ? d - 180 : d <= -90 ? d + 180 : d);

export function Plan2D() {
  const plan = usePlan((s) => s.plan);
  const update = usePlan((s) => s.update);
  const tool = useUI((s) => s.tool);
  const selection = useUI((s) => s.selection);
  const select = useUI((s) => s.select);
  const setTool = useUI((s) => s.setTool);
  const catalogId = useUI((s) => s.catalogId);
  const wallThickness = useUI((s) => s.wallThickness);
  const wallHeight = useUI((s) => s.wallHeight);
  const fitToken = useUI((s) => s.fitToken);

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ s: 50, ox: 60, oy: 60 });
  const [hover, setHover] = useState<Vec2 | null>(null);
  const [altKey, setAltKey] = useState(false);
  const [snap, setSnap] = useState<SnapResult | null>(null);
  const [chain, setChain] = useState<Vec2 | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dragKind, setDragKind] = useState<Drag['kind'] | null>(null);
  const startDrag = (d: Drag) => {
    drag.current = d;
    setDragKind(d.kind);
  };

  const geoms = useMemo(() => computeWallGeometry(plan), [plan]);
  const geomList = useMemo(() => Object.values(geoms), [geoms]);
  const rooms = useMemo(() => detectRooms(plan), [plan]);
  const planCenter = useMemo(() => {
    const b = planBounds(plan);
    return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 0, y: 0 };
  }, [plan]);

  // ---------- tamanho, enquadramento e zoom ----------
  useEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size) return;
    const b = planBounds(usePlan.getState().plan) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };
    const pad = 60;
    const w = Math.max(1, b.maxX - b.minX);
    const h = Math.max(1, b.maxY - b.minY);
    const s = clamp(Math.min((size.w - 2 * pad) / w, (size.h - 2 * pad) / h), 8, 400);
    setView({ s, ox: size.w / 2 - ((b.minX + b.maxX) / 2) * s, oy: size.h / 2 - ((b.minY + b.maxY) / 2) * s });
  }, [size]);

  const fittedOnce = useRef(false);
  useEffect(() => {
    if (size && !fittedOnce.current) {
      fittedOnce.current = true;
      fit();
    }
  }, [size, fit]);
  useEffect(() => {
    if (fitToken > 0) fit();
  }, [fitToken, fit]);

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

  // ---------- teclado local ----------
  useEffect(() => {
    setChain(null);
    setSnap(null);
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setAltKey(e.altKey);
      if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'Enter') && chain) {
        setChain(null);
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, [chain]);

  // ---------- auxiliares ----------
  const toPlan = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s };
  };

  const wallUnder = (p: Vec2): { g: WallGeom; offset: number } | null => {
    let best: { g: WallGeom; offset: number; d: number } | null = null;
    for (const g of geomList) {
      const pr = projectOnSegment(p, g.a, g.b);
      if (pr.t <= 0 || pr.t >= 1) continue;
      const tol = g.thickness / 2 + 10 / view.s;
      if (pr.dist <= tol && (!best || pr.dist < best.d)) best = { g, offset: pr.t * g.length, d: pr.dist };
    }
    return best;
  };

  const furniturePlacement = (id: string, p: Vec2, rot: number, free: boolean) => {
    const item = CATALOG_BY_ID[id];
    const pos = { x: roundTo(p.x, 0.01), y: roundTo(p.y, 0.01) };
    if (!free && item && (item.elevation ?? 0) === 0) {
      const ws = snapFurnitureToWall(geomList, pos, item.depth);
      if (ws) return { pos: ws.pos, rotation: ws.rotation };
    }
    return { pos, rotation: rot };
  };

  const hitTarget = (e: RPointerEvent): { kind: SelectionKind; id: string } | null => {
    const el = (e.target as Element).closest('[data-kind]');
    if (!el) return null;
    return { kind: el.getAttribute('data-kind') as SelectionKind, id: el.getAttribute('data-id')! };
  };

  // ---------- eventos ----------
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toPlan(e);
    svgRef.current!.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2) {
      startDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy });
      return;
    }
    if (e.button !== 0) return;

    if (tool === 'select') {
      const hit = hitTarget(e);
      if (!hit) {
        select(null);
        startDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy });
        return;
      }
      select(hit);
      if (hit.kind === 'room') return;
      beginGesture();
      if (hit.kind === 'node') startDrag({ kind: 'node', id: hit.id, snap: null });
      else if (hit.kind === 'wall') {
        const w = plan.walls[hit.id];
        startDrag({ kind: 'wall', id: hit.id, start: p, a: { ...plan.nodes[w.a] }, b: { ...plan.nodes[w.b] } });
      } else if (hit.kind === 'furniture') {
        const f = plan.furniture[hit.id];
        startDrag({ kind: 'furniture', id: hit.id, start: p, orig: { x: f.x, y: f.y }, rot: f.rotation });
      } else if (hit.kind === 'opening') startDrag({ kind: 'opening', id: hit.id });
      return;
    }

    if (tool === 'wall') {
      const sn = snapPoint(plan, p, { pxPerMeter: view.s, anchor: chain, disabled: e.altKey });
      if (!chain) {
        setChain(sn.point);
        return;
      }
      if (dist(sn.point, chain) < 1e-3) {
        setChain(null);
        return;
      }
      const closesLoop = !!sn.nodeId && wallsAtNode(plan, sn.nodeId).length > 0;
      update((d) => {
        addWall(d, chain, sn.point, { thickness: wallThickness, height: wallHeight });
      });
      setChain(closesLoop ? null : sn.point);
      return;
    }

    if (tool === 'door' || tool === 'window') {
      const wu = wallUnder(p);
      if (!wu) return;
      let id: string | null = null;
      update((d) => {
        id = addOpening(d, wu.g.id, tool as OpeningKind, wu.offset);
      });
      if (id) select({ kind: 'opening', id });
      return;
    }

    if (tool === 'furniture' && catalogId) {
      const pl = furniturePlacement(catalogId, p, 0, e.altKey);
      let id: string | null = null;
      update((d) => {
        id = addFurniture(d, catalogId, pl.pos, pl.rotation);
      });
      setTool('select');
      if (id) select({ kind: 'furniture', id });
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toPlan(e);
    setHover(p);
    const d = drag.current;
    if (d?.kind === 'pan') {
      setView((v) => ({ ...v, ox: d.ox + e.clientX - d.sx, oy: d.oy + e.clientY - d.sy }));
      return;
    }
    if (d?.kind === 'node') {
      const sn = snapPoint(plan, p, { pxPerMeter: view.s, exclude: new Set([d.id]), disabled: e.altKey });
      d.snap = sn;
      setSnap(sn);
      update((draft) => moveNode(draft, d.id, sn.point));
      return;
    }
    if (d?.kind === 'wall') {
      const delta = sub(p, d.start);
      const dl = { x: roundTo(delta.x, 0.05), y: roundTo(delta.y, 0.05) };
      const w = plan.walls[d.id];
      if (!w) return;
      update((draft) => {
        moveNode(draft, w.a, add(d.a, dl));
        moveNode(draft, w.b, add(d.b, dl));
      });
      return;
    }
    if (d?.kind === 'furniture') {
      const f = plan.furniture[d.id];
      if (!f) return;
      let pos = add(d.orig, sub(p, d.start));
      let rot = d.rot;
      pos = { x: roundTo(pos.x, 0.01), y: roundTo(pos.y, 0.01) };
      if (!e.altKey && f.elevation === 0) {
        const ws = snapFurnitureToWall(geomList, pos, f.depth);
        if (ws) {
          pos = ws.pos;
          rot = ws.rotation;
        }
      }
      update((draft) => {
        const it = draft.furniture[d.id];
        it.x = pos.x;
        it.y = pos.y;
        it.rotation = rot;
      });
      return;
    }
    if (d?.kind === 'opening') {
      const op = plan.openings[d.id];
      const g = op && geoms[op.wallId];
      if (!g) return;
      const pr = projectOnSegment(p, g.a, g.b);
      const off = clampOpeningOffset(g.length, op.width, roundTo(pr.t * g.length, 0.01));
      update((draft) => {
        draft.openings[d.id].offset = off;
      });
      return;
    }
    if (tool === 'wall') setSnap(snapPoint(plan, p, { pxPerMeter: view.s, anchor: chain, disabled: e.altKey }));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragKind(null);
    if (!d || d.kind === 'pan') return;
    if (d.kind === 'node' && d.snap) {
      const sn = d.snap;
      if (sn.nodeId) {
        update((draft) => mergeNodes(draft, d.id, sn.nodeId!));
        select({ kind: 'node', id: sn.nodeId });
      } else if (sn.wallId) {
        update((draft) => {
          if (draft.walls[sn.wallId!]) splitWall(draft, sn.wallId!, sn.point);
        });
      }
    }
    endGesture();
    setSnap(null);
  };

  // ---------- renderização ----------
  const s = view.s;
  const px = (n: number) => n / s;
  const grid = useMemo(() => {
    if (!size) return null;
    const x0 = -view.ox / s;
    const y0 = -view.oy / s;
    const x1 = (size.w - view.ox) / s;
    const y1 = (size.h - view.oy) / s;
    const step = s > 120 ? 0.25 : s > 30 ? 1 : 5;
    const lines: { k: string; x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    const isMajor = (v: number) => Math.abs(v / 5 - Math.round(v / 5)) < 1e-6;
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) lines.push({ k: `x${x}`, x1: x, y1: y0, x2: x, y2: y1, major: isMajor(x) });
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) lines.push({ k: `y${y}`, x1: x0, y1: y, x2: x1, y2: y, major: isMajor(y) });
    return lines;
  }, [size, view, s]);

  const isSel = (kind: SelectionKind, id: string) => selection?.kind === kind && selection.id === id;
  const furnitureSorted = useMemo(
    () => Object.values(plan.furniture).sort((a, b) => a.elevation + a.height - (b.elevation + b.height)),
    [plan.furniture],
  );

  const openingPreview =
    hover && (tool === 'door' || tool === 'window') && !dragKind
      ? (() => {
          const wu = wallUnder(hover);
          if (!wu) return null;
          const def = OPENING_DEFAULTS[tool];
          if (wu.g.length < def.width + 0.2) return null;
          return (
            <OpeningSymbol
              g={wu.g}
              ghost
              op={{ kind: tool, width: def.width, flip: false, side: false, offset: clampOpeningOffset(wu.g.length, def.width, wu.offset) }}
            />
          );
        })()
      : null;

  const furniturePreview =
    hover && tool === 'furniture' && catalogId
      ? (() => {
          const item = CATALOG_BY_ID[catalogId];
          const pl = furniturePlacement(catalogId, hover, 0, altKey);
          return (
            <FurnitureSymbol
              ghost
              f={{ catalogId, x: pl.pos.x, y: pl.pos.y, rotation: pl.rotation, width: item.width, depth: item.depth, height: item.height }}
            />
          );
        })()
      : null;

  const cursorClass =
    tool === 'select' ? (dragKind === 'pan' ? 'grabbing' : 'default') : 'crosshair';

  return (
    <svg
      ref={svgRef}
      className={`plan2d cursor-${cursorClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={() => tool === 'wall' && setChain(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <g transform={`translate(${view.ox} ${view.oy}) scale(${s})`}>
        <g pointerEvents="none">
          {grid?.map((l) => (
            <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.major ? '#c9d2de' : '#e3e8ef'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </g>

        {rooms.map((r) => (
          <polygon
            key={r.id}
            data-kind="room"
            data-id={r.id}
            points={pts(r.inner)}
            fill={r.floorColor}
            fillOpacity={0.45}
            stroke={isSel('room', r.id) ? ACCENT : 'none'}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {furnitureSorted.map((f) => (
          <FurnitureSymbol key={f.id} f={f} selected={isSel('furniture', f.id)} />
        ))}

        {geomList.map((g) => (
          <polygon key={g.id} data-kind="wall" data-id={g.id} points={pts(g.polygon)} fill={isSel('wall', g.id) ? ACCENT : '#2e343b'} />
        ))}

        {Object.values(plan.openings).map((op) => {
          const g = geoms[op.wallId];
          return g ? <OpeningSymbol key={op.id} op={op} g={g} selected={isSel('opening', op.id)} /> : null;
        })}

        {/* cotas das paredes */}
        <g pointerEvents="none">
          {geomList
            .filter((g) => g.length * s > 45)
            .map((g) => {
              const m = mul(add(g.a, g.b), 0.5);
              // parede externa = um dos lados não pertence a nenhum cômodo; a cota vai desse lado
              const probe = (dir: Vec2) => add(m, mul(dir, g.thickness / 2 + 0.05));
              const outside = (dir: Vec2) => !rooms.some((r) => pointInPolygon(probe(dir), r.polygon));
              const outer = outside(g.normal) ? g.normal : outside(mul(g.normal, -1)) ? mul(g.normal, -1) : null;
              if (!outer && !isSel('wall', g.id)) return null;
              const n = outer ?? (dot(g.normal, sub(m, planCenter)) >= 0 ? g.normal : mul(g.normal, -1));
              const off = g.thickness / 2 + px(9);
              const a = add(g.a, mul(n, off));
              const b = add(g.b, mul(n, off));
              const mid = add(m, mul(n, off + px(9)));
              const tick = mul(normalize(add(g.dir, n)), px(4));
              return (
                <g key={g.id}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8d97a3" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                  {[a, b].map((q, i) => (
                    <line key={i} x1={q.x - tick.x} y1={q.y - tick.y} x2={q.x + tick.x} y2={q.y + tick.y} stroke="#8d97a3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  ))}
                  <text
                    transform={`translate(${mid.x} ${mid.y}) rotate(${readable(deg(Math.atan2(g.dir.y, g.dir.x)))})`}
                    fontSize={px(11)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#4f5964"
                    className="dim-text"
                  >
                    {fmtMeters(g.length)}
                  </text>
                </g>
              );
            })}
        </g>

        {/* nome e área dos cômodos */}
        <g pointerEvents="none">
          {rooms.map((r) => (
            <g key={r.id} transform={`translate(${r.center.x} ${r.center.y})`}>
              <text fontSize={px(13)} textAnchor="middle" fontWeight={600} fill="#26303a" className="room-text">
                {r.name}
              </text>
              <text y={px(15)} fontSize={px(11)} textAnchor="middle" fill="#55606c" className="room-text">
                {fmtArea(r.area)}
              </text>
            </g>
          ))}
        </g>

        {tool === 'select' &&
          Object.values(plan.nodes).map((n) => (
            <circle
              key={n.id}
              data-kind="node"
              data-id={n.id}
              cx={n.x}
              cy={n.y}
              r={px(isSel('node', n.id) ? 6 : 4.5)}
              fill={isSel('node', n.id) ? ACCENT : '#ffffff'}
              stroke={isSel('node', n.id) ? '#ffffff' : '#2e343b'}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}

        {openingPreview}
        {furniturePreview}

        {/* pré-visualização da parede */}
        {tool === 'wall' && snap && (
          <g pointerEvents="none">
            {chain &&
              (() => {
                const L = dist(chain, snap.point);
                if (L < 1e-6) return null;
                const n = mul(perp(normalize(sub(snap.point, chain))), wallThickness / 2);
                const poly = [add(chain, n), add(snap.point, n), sub(snap.point, n), sub(chain, n)];
                const mid = mul(add(chain, snap.point), 0.5);
                const ang = readable(deg(Math.atan2(snap.point.y - chain.y, snap.point.x - chain.x)));
                return (
                  <>
                    <polygon points={pts(poly)} fill={ACCENT} fillOpacity={0.45} stroke={ACCENT} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <g transform={`translate(${mid.x} ${mid.y}) rotate(${ang})`}>
                      <rect x={px(-30)} y={px(-22)} width={px(60)} height={px(16)} rx={px(3)} fill="#ffffff" stroke={ACCENT} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                      <text y={px(-14)} fontSize={px(11)} textAnchor="middle" dominantBaseline="middle" fill={ACCENT} fontWeight={600}>
                        {fmtMeters(L)}
                      </text>
                    </g>
                  </>
                );
              })()}
            {snap.guides.map(([a, b], i) => (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e8590c" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            ))}
            <circle
              cx={snap.point.x}
              cy={snap.point.y}
              r={px(5)}
              fill="none"
              stroke={snap.nodeId ? '#2f9e44' : snap.wallId ? '#e8590c' : ACCENT}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        {dragKind === 'node' && snap && (snap.nodeId || snap.wallId) && (
          <circle cx={snap.point.x} cy={snap.point.y} r={px(8)} fill="none" stroke={snap.nodeId ? '#2f9e44' : '#e8590c'} strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        )}
      </g>
      {size && <ScaleBar s={s} h={size.h} />}
    </svg>
  );
}

function ScaleBar({ s, h }: { s: number; h: number }) {
  const options = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20];
  const meters = options.find((m) => m * s >= 70) ?? 20;
  const w = meters * s;
  return (
    <g transform={`translate(16 ${h - 24})`} pointerEvents="none">
      <rect x={0} y={0} width={w} height={5} fill="#2e343b" />
      <text x={w + 6} y={6} fontSize={11} fill="#2e343b">
        {meters >= 1 ? `${meters} m` : `${meters * 100} cm`}
      </text>
    </g>
  );
}
