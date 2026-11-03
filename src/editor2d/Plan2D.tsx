import { type PointerEvent as RPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG_BY_ID } from '../catalog/catalog';
import { detectRooms } from '../geometry/rooms';
import { ROOM_PRESETS, applyPreset } from '../model/presets';
import { addFenceSegment, fencePoints, insertGate, isFence, isGate } from '../model/fences';
import { RECUO_FRONTAL, siteCorners } from '../model/site';
import type { Plan } from '../model/types';
import { type SnapResult, roundTo, snapFurnitureToWall, snapPoint } from '../geometry/snap';
import { type Vec2, add, clamp, dist, dot, mul, normalize, perp, pointInPolygon, projectOnSegment, sub } from '../geometry/vec';
import { type WallGeom, clampOpeningOffset, computeWallGeometry } from '../geometry/walls';
import {
  setWallLength,
  addFurniture,
  addOpening,
  addWall,
  mergeNodes,
  moveNode,
  planBounds,
  splitWall,
  wallsAtNode,
} from '../model/ops';
import type { Annotation, FurnitureItem, Opening, OpeningKind, SelectionKind } from '../model/types';
import { levelBelow } from '../model/building';
import { beginGesture, endGesture, selectLevel, selectPlan, usePlan } from '../store/planStore';
import { isStair, stairFootprint, stairRect } from '../model/stairs';
import { styleDef } from '../model/openings';
import { roofGeometry } from '../roof/roof';
import { useUI } from '../store/uiStore';
import { fmtArea, fmtMeters, fmtNumber, parseNumber } from '../ui/format';
import { ACCENT, FurnitureSymbol, OpeningSymbol } from './symbols';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'node'; id: string; snap: SnapResult | null }
  | { kind: 'wall'; id: string; start: Vec2; a: Vec2; b: Vec2 }
  | { kind: 'furniture'; id: string; start: Vec2; orig: Vec2; rot: number }
  | { kind: 'opening'; id: string }
  | { kind: 'fresize'; id: string; handle: string; orig: FurnitureItem }
  | { kind: 'oresize'; id: string; end: number; orig: Opening }
  | { kind: 'annot'; id: string; start: Vec2; orig: Vec2[] };

interface View {
  s: number; // pixels por metro
  ox: number;
  oy: number;
}

const pts = (p: Vec2[]) => p.map((q) => `${q.x},${q.y}`).join(' ');
const deg = (r: number) => (r * 180) / Math.PI;
const readable = (d: number) => (d > 90 ? d - 180 : d <= -90 ? d + 180 : d);

export function Plan2D() {
  const plan = usePlan(selectPlan);
  const below = usePlan((s) => levelBelow(s.building, s.levelId)?.plan);
  const belowGeoms = useMemo(() => (below ? Object.values(computeWallGeometry(below)) : []), [below]);
  const belowPoints = useMemo(() => (below ? Object.values(below.nodes) : []), [below]);
  const belowSlab = useMemo(() => (below ? detectRooms(below).map((r) => r.polygon) : []), [below]);
  const voids = useMemo(() => (below ? Object.values(below.furniture).filter(isStair) : []), [below]);
  const building = usePlan((s) => s.building);
  const isTopLevel = usePlan((s) => s.building.levels[s.building.levels.length - 1]?.id === selectLevel(s).id);
  const showRoof = useUI((s) => s.showRoof);
  const roofGeo = useMemo(() => (isTopLevel && showRoof ? roofGeometry(building) : null), [isTopLevel, showRoof, building]);
  const update = usePlan((s) => s.update);
  const tool = useUI((s) => s.tool);
  const selection = useUI((s) => s.selection);
  const select = useUI((s) => s.select);
  const setTool = useUI((s) => s.setTool);
  const catalogId = useUI((s) => s.catalogId);
  const wallThickness = useUI((s) => s.wallThickness);
  const wallHeight = useUI((s) => s.wallHeight);
  const fitToken = useUI((s) => s.fitToken);
  const doorStyle = useUI((s) => s.doorStyle);
  const windowStyle = useUI((s) => s.windowStyle);

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ s: 50, ox: 60, oy: 60 });
  const [hover, setHover] = useState<Vec2 | null>(null);
  const [altKey, setAltKey] = useState(false);
  const [snap, setSnap] = useState<SnapResult | null>(null);
  const [chain, setChain] = useState<Vec2 | null>(null);
  /** Canto inicial da ferramenta Cômodo (retângulo). */
  const [roomStart, setRoomStart] = useState<Vec2 | null>(null);
  const roomPresetKey = useUI((s) => s.roomPreset);
  const roomPresetDef = ROOM_PRESETS.find((r) => r.key === roomPresetKey);
  const fenceType = useUI((s) => s.fenceType);
  const site = usePlan((s) => (s.building.levels[0]?.id === s.levelId && s.building.site?.show ? s.building.site : null));
  const siteCs = useMemo(() => (site ? siteCorners(site) : []), [site]);
  const fencePts = useMemo(() => [...fencePoints(plan), ...siteCs], [plan, siteCs]);
  const segExtra = tool === 'fence' ? [...belowPoints, ...fencePts] : belowPoints;
  const segThickness = tool === 'fence' ? (CATALOG_BY_ID[fenceType]?.depth ?? 0.15) : wallThickness;
  /** Trecho da ferramenta atual: parede ou muro/cerca. */
  const addSegment = (d: Plan, a: Vec2, b: Vec2) => {
    if (tool === 'fence') addFenceSegment(d, fenceType, a, b);
    else addWall(d, a, b, { thickness: wallThickness, height: wallHeight });
  };
  /** Medida digitada durante o desenho (ex.: "3,5" ou "4x3"). */
  const [typed, setTyped] = useState('');
  const [shiftKey, setShiftKey] = useState(false);
  /** Edição de cota: parede e posição na tela. */
  const [dimEdit, setDimEdit] = useState<{ wallId: string; x: number; y: number; value: string } | null>(null);
  const hoverRef = useRef<Vec2 | null>(null);
  /** Marcação sendo desenhada e edição de texto. */
  const [draftAnn, setDraftAnn] = useState<Annotation | null>(null);
  const [textEdit, setTextEdit] = useState<{ x: number; y: number; p: Vec2; value: string } | null>(null);
  const annotColor = useUI((s) => s.annotColor);
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
    const st = usePlan.getState();
    let b = planBounds(selectPlan(st)) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };
    const ls = st.building.site;
    if (ls?.show && st.building.levels[0]?.id === st.levelId) {
      const cs = siteCorners(ls);
      b = { minX: Math.min(b.minX, ...cs.map((q) => q.x)), minY: Math.min(b.minY, ...cs.map((q) => q.y)), maxX: Math.max(b.maxX, ...cs.map((q) => q.x)), maxY: Math.max(b.maxY, ...cs.map((q) => q.y)) };
    }
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
    setRoomStart(null);
    setTyped('');
    setSnap(null);
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setAltKey(e.altKey);
      setShiftKey(e.shiftKey);
      if (e.type !== 'keydown') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const drawing = ((tool === 'wall' || tool === 'fence') && chain) || (tool === 'room' && roomStart);
      if (!drawing) return;
      // medida digitada: números, vírgula, ponto e "x" (largura x profundidade)
      if (/^[0-9.,]$/.test(e.key) || (tool === 'room' && (e.key === 'x' || e.key === 'X' || e.key === '*' || e.key === ' '))) {
        setTyped((t) => t + (e.key === 'X' || e.key === '*' ? 'x' : e.key));
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (e.key === 'Backspace' && typed) {
        setTyped((t) => t.slice(0, -1));
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (e.key === 'Enter') {
        e.stopImmediatePropagation();
        if (typed) commitTyped();
        else {
          setChain(null);
          setRoomStart(null);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        if (typed) setTyped('');
        else {
          setChain(null);
          setRoomStart(null);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, [chain, roomStart, typed, tool]);

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

  /** Dimensões do item a colocar (escadas se ajustam à altura do andar). */
  const levelHeight = usePlan((s) => selectLevel(s).height);
  const itemDims = (id: string) => {
    const item = CATALOG_BY_ID[id];
    if (isStair({ catalogId: id })) return { ...stairFootprint(id, levelHeight), height: levelHeight };
    return { width: item.width, depth: item.depth, height: item.height };
  };

  const furniturePlacement = (id: string, p: Vec2, rot: number, free: boolean) => {
    const item = CATALOG_BY_ID[id];
    const pos = { x: roundTo(p.x, 0.01), y: roundTo(p.y, 0.01) };
    if (!free && item && (item.elevation ?? 0) === 0) {
      const ws = snapFurnitureToWall(geomList, pos, itemDims(id).depth);
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
      if ((hit.kind as string) === 'dim') {
        e.preventDefault(); // evita que o clique tire o foco do campo de edição
        const w = plan.walls[hit.id];
        const r = svgRef.current!.getBoundingClientRect();
        if (w) setDimEdit({ wallId: hit.id, x: e.clientX - r.left, y: e.clientY - r.top, value: fmtNumber(dist(plan.nodes[w.a], plan.nodes[w.b]), 2) });
        select({ kind: 'wall', id: hit.id });
        return;
      }
      // alças de redimensionar/girar do item selecionado
      if ((hit.kind as string) === 'fhandle' && selection?.kind === 'furniture' && plan.furniture[selection.id]) {
        beginGesture();
        startDrag({ kind: 'fresize', id: selection.id, handle: hit.id, orig: { ...plan.furniture[selection.id] } });
        return;
      }
      if ((hit.kind as string) === 'ohandle' && selection?.kind === 'opening' && plan.openings[selection.id]) {
        beginGesture();
        startDrag({ kind: 'oresize', id: selection.id, end: Number(hit.id), orig: { ...plan.openings[selection.id] } });
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
      else if (hit.kind === 'annotation' && plan.annotations?.[hit.id]) startDrag({ kind: 'annot', id: hit.id, start: p, orig: plan.annotations[hit.id].pts.map((q) => ({ ...q })) });
      return;
    }

    if (tool === 'pencil' || tool === 'arrow' || tool === 'measure') {
      const q = tool === 'measure' ? snapPoint(plan, p, { pxPerMeter: view.s, disabled: e.altKey }).point : p;
      setDraftAnn({ id: '', kind: tool === 'pencil' ? 'free' : tool, pts: [q, q], color: annotColor });
      return;
    }
    if (tool === 'text') {
      e.preventDefault();
      const r = svgRef.current!.getBoundingClientRect();
      setTextEdit({ x: e.clientX - r.left, y: e.clientY - r.top, p, value: '' });
      return;
    }

    if (tool === 'room') {
      const sn = snapPoint(plan, p, { pxPerMeter: view.s, disabled: e.altKey, extraPoints: belowPoints });
      const preset = ROOM_PRESETS.find((r) => r.key === useUI.getState().roomPreset);
      if (preset) {
        let placed = 0;
        update((d) => {
          placed = applyPreset(d, preset, sn.point, { thickness: wallThickness, height: wallHeight });
        });
        useUI.getState().set({ roomPreset: null, toast: `${preset.name} criado${placed ? ` com ${placed} objetos` : ''}. Ajuste com as alças ou Ctrl+Z para desfazer.` });
        return;
      }
      if (!roomStart) {
        setRoomStart(sn.point);
        setTyped('');
        return;
      }
      createRoomRect(roomStart, sn.point);
      return;
    }

    if (tool === 'wall' || tool === 'fence') {
      const sn = snapPoint(plan, p, { pxPerMeter: view.s, anchor: chain, disabled: e.altKey, extraPoints: segExtra });
      if (chain && e.shiftKey) sn.point = ortho(chain, sn.point);
      if (!chain) {
        setChain(sn.point);
        return;
      }
      if (dist(sn.point, chain) < 1e-3) {
        setChain(null);
        return;
      }
      const closesLoop = tool === 'wall' && !!sn.nodeId && wallsAtNode(plan, sn.nodeId).length > 0;
      update((d) => addSegment(d, chain, sn.point));
      setChain(closesLoop ? null : sn.point);
      setTyped('');
      return;
    }

    if (tool === 'door' || tool === 'window') {
      const wu = wallUnder(p);
      if (!wu) return;
      let id: string | null = null;
      update((d) => {
        const st = styleDef(tool === 'door' ? useUI.getState().doorStyle : useUI.getState().windowStyle);
        id = addOpening(d, wu.g.id, tool as OpeningKind, wu.offset, { style: st.key, width: st.width, height: st.height, sill: st.sill });
      });
      if (id) select({ kind: 'opening', id });
      return;
    }

    if (tool === 'furniture' && catalogId) {
      const pl = furniturePlacement(catalogId, p, 0, e.altKey);
      let id: string | null = null;
      const dims = itemDims(catalogId);
      update((d) => {
        id = CATALOG_BY_ID[catalogId]?.gate ? insertGate(d, catalogId, p, pl.rotation) : addFurniture(d, catalogId, pl.pos, pl.rotation, dims);
      });
      setTool('select');
      if (id) select({ kind: 'furniture', id });
      if (isStair({ catalogId })) {
        const st = usePlan.getState();
        const lv = selectLevel(st);
        const idx = st.building.levels.findIndex((l) => l.id === lv.id);
        const next = st.building.levels[idx + 1];
        useUI.getState().set({
          toast: next
            ? `Escada colocada: ela sobe ${fmtMeters(lv.height)} até o ${next.name}, e o vão no piso do ${next.name} foi aberto automaticamente.`
            : `Escada colocada no ${lv.name}, que é o último andar. Crie um andar acima (+ Andar) e o vão no piso dele será aberto automaticamente.`,
        });
      }
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
      const sn = snapPoint(plan, p, { pxPerMeter: view.s, exclude: new Set([d.id]), disabled: e.altKey, extraPoints: belowPoints });
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
      if (!e.altKey && f.elevation === 0 && !isFence(f) && !isGate(f)) {
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
    if (draftAnn) {
      if (draftAnn.kind === 'free') {
        const last = draftAnn.pts[draftAnn.pts.length - 1];
        if (dist(last, p) > 3 / view.s) setDraftAnn({ ...draftAnn, pts: [...draftAnn.pts, p] });
      } else {
        let q = draftAnn.kind === 'measure' ? snapPoint(plan, p, { pxPerMeter: view.s, disabled: e.altKey }).point : p;
        if (e.shiftKey) q = ortho(draftAnn.pts[0], q);
        setDraftAnn({ ...draftAnn, pts: [draftAnn.pts[0], q] });
      }
      return;
    }
    if (d?.kind === 'annot') {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      update((draft) => {
        const a = draft.annotations?.[d.id];
        if (a) a.pts = d.orig.map((q) => ({ x: q.x + dx, y: q.y + dy }));
      });
      return;
    }
    if (d?.kind === 'fresize') {
      const o = d.orig;
      const c = Math.cos(o.rotation);
      const sn = Math.sin(o.rotation);
      // ponteiro no sistema local do móvel (x = largura, y = profundidade, frente em +y)
      const lx = (p.x - o.x) * c + (p.y - o.y) * sn;
      const ly = -(p.x - o.x) * sn + (p.y - o.y) * c;
      const toWorld = (u: number, v: number) => ({ x: o.x + u * c - v * sn, y: o.y + u * sn + v * c });
      update((draft) => {
        const f = draft.furniture[d.id];
        if (!f) return;
        if (d.handle === 'rot') {
          let a = Math.atan2(p.y - o.y, p.x - o.x) + Math.PI / 2;
          if (!e.altKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
          f.rotation = a;
          return;
        }
        const snapL = (v: number) => (e.altKey ? v : roundTo(v, 0.05));
        if (d.handle === 'e' || d.handle === 'w') {
          const fixed = d.handle === 'e' ? -o.width / 2 : o.width / 2;
          const w = Math.max(0.1, snapL(Math.abs(lx - fixed)));
          const mid = fixed + (d.handle === 'e' ? w / 2 : -w / 2);
          const pos = toWorld(mid, 0);
          Object.assign(f, { width: w, x: pos.x, y: pos.y });
        } else {
          const fixed = d.handle === 's' ? -o.depth / 2 : o.depth / 2;
          const dd = Math.max(0.1, snapL(Math.abs(ly - fixed)));
          const mid = fixed + (d.handle === 's' ? dd / 2 : -dd / 2);
          const pos = toWorld(0, mid);
          Object.assign(f, { depth: dd, x: pos.x, y: pos.y });
        }
      });
      return;
    }
    if (d?.kind === 'oresize') {
      const g = geoms[d.orig.wallId];
      if (!g) return;
      const t = projectOnSegment(p, g.a, g.b).t * g.length;
      const other = d.orig.offset - d.end * (d.orig.width / 2);
      const w = Math.max(0.3, Math.min(g.length - 0.2, e.altKey ? Math.abs(t - other) : roundTo(Math.abs(t - other), 0.05)));
      const off = clampOpeningOffset(g.length, w, other + d.end * (w / 2));
      update((draft) => {
        const op = draft.openings[d.id];
        if (op) Object.assign(op, { width: w, offset: off });
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
    hoverRef.current = p;
    if (tool === 'wall' || tool === 'fence') {
      const sn = snapPoint(plan, p, { pxPerMeter: view.s, anchor: chain, disabled: e.altKey, extraPoints: segExtra });
      if (chain && e.shiftKey) sn.point = ortho(chain, sn.point);
      setSnap(sn);
    } else if (tool === 'room') setSnap(snapPoint(plan, p, { pxPerMeter: view.s, disabled: e.altKey, extraPoints: belowPoints }));
  };

  /** Trava a direção em horizontal/vertical (Shift). */
  function ortho(a: Vec2, b: Vec2): Vec2 {
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: roundTo(b.x, 0.05), y: a.y } : { x: a.x, y: roundTo(b.y, 0.05) };
  }

  function createRoomRect(a: Vec2, b: Vec2) {
    if (Math.abs(b.x - a.x) < 0.3 || Math.abs(b.y - a.y) < 0.3) return;
    const c = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
    update((d) => {
      for (let i = 0; i < 4; i++) addWall(d, c[i], c[(i + 1) % 4], { thickness: wallThickness, height: wallHeight });
    });
    setRoomStart(null);
    setTyped('');
  }

  /** Aplica a medida digitada: comprimento da parede ou "largura x profundidade" do cômodo. */
  function commitTyped() {
    const num = (t: string) => parseFloat(t.replace(',', '.'));
    const cur = snap?.point ?? hoverRef.current;
    if ((tool === 'wall' || tool === 'fence') && chain) {
      const L = num(typed);
      if (!(L > 0.05)) return setTyped('');
      let dir = cur ? sub(cur, chain) : { x: 1, y: 0 };
      if (Math.hypot(dir.x, dir.y) < 1e-6) dir = { x: 1, y: 0 };
      if (shiftKey) dir = Math.abs(dir.x) >= Math.abs(dir.y) ? { x: Math.sign(dir.x) || 1, y: 0 } : { x: 0, y: Math.sign(dir.y) || 1 };
      const end = add(chain, mul(normalize(dir), L));
      const endR = { x: Math.round(end.x * 1e4) / 1e4, y: Math.round(end.y * 1e4) / 1e4 };
      update((d) => addSegment(d, chain, endR));
      setChain(endR);
      setTyped('');
      return;
    }
    if (tool === 'room' && roomStart) {
      const m = /^\s*([0-9]+(?:[.,][0-9]+)?)\s*[x ]\s*([0-9]+(?:[.,][0-9]+)?)\s*$/.exec(typed);
      if (!m) return setTyped('');
      const w = num(m[1]);
      const h = num(m[2]);
      const sx = cur && cur.x < roomStart.x ? -1 : 1;
      const sy = cur && cur.y < roomStart.y ? -1 : 1;
      createRoomRect(roomStart, { x: roomStart.x + sx * w, y: roomStart.y + sy * h });
    }
  }

  const onPointerUp = () => {
    if (draftAnn) {
      const a = draftAnn;
      setDraftAnn(null);
      const len = a.pts.reduce((acc, q, i) => (i ? acc + dist(a.pts[i - 1], q) : 0), 0);
      if (len > 4 / view.s) {
        const id = `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        update((dd) => {
          dd.annotations ??= {};
          dd.annotations[id] = { ...a, id };
        });
      }
      return;
    }
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
          const def = styleDef(tool === 'door' ? doorStyle : windowStyle);
          if (wu.g.length < def.width + 0.2) return null;
          return (
            <OpeningSymbol
              g={wu.g}
              ghost
              op={{ kind: tool, style: def.key, width: def.width, flip: false, side: false, offset: clampOpeningOffset(wu.g.length, def.width, wu.offset) }}
            />
          );
        })()
      : null;

  const furniturePreview =
    hover && tool === 'furniture' && catalogId
      ? (() => {
          const dims = itemDims(catalogId);
          const pl = furniturePlacement(catalogId, hover, 0, altKey);
          return <FurnitureSymbol ghost f={{ catalogId, x: pl.pos.x, y: pl.pos.y, rotation: pl.rotation, ...dims }} />;
        })()
      : null;

  const cursorClass =
    tool === 'select' ? (dragKind === 'pan' ? 'grabbing' : 'default') : 'crosshair';

  const drawingNow = ((tool === 'wall' || tool === 'fence') && chain) || (tool === 'room' && roomStart);
  const emptyLevel = Object.keys(plan.walls).length === 0;

  return (
    <>
    <svg
      ref={svgRef}
      className={`plan2d cursor-${cursorClass}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={() => {
        if (tool === 'wall' || tool === 'fence') setChain(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <g transform={`translate(${view.ox} ${view.oy}) scale(${s})`}>
        <g pointerEvents="none">
          {grid?.map((l) => (
            <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.major ? '#c9d2de' : '#e3e8ef'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
        </g>

        {/* terreno: contorno do lote, frente (rua) e recuo frontal */}
        {site && siteCs.length === 4 && (() => {
          const [f0, f1, , b0] = siteCs;
          const inward = normalize(sub(b0, f0));
          const r0 = add(f0, mul(inward, RECUO_FRONTAL));
          const r1 = add(f1, mul(inward, RECUO_FRONTAL));
          const mid = mul(add(f0, f1), 0.5);
          const out = add(mid, mul(inward, -px(18)));
          const ang = readable(deg(Math.atan2(f1.y - f0.y, f1.x - f0.x)));
          const c = add(mul(add(siteCs[2], b0), 0.5), mul(inward, -0.8));
          return (
            <g pointerEvents="none">
              <polygon points={pts(siteCs)} fill="#9cc56b" fillOpacity={0.12} stroke="#5c940d" strokeWidth={1.5} strokeDasharray="10 5" vectorEffect="non-scaling-stroke" />
              <line x1={f0.x} y1={f0.y} x2={f1.x} y2={f1.y} stroke="#5c940d" strokeWidth={4} vectorEffect="non-scaling-stroke" />
              <line x1={r0.x} y1={r0.y} x2={r1.x} y2={r1.y} stroke="#5c940d" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              <g transform={`translate(${out.x} ${out.y}) rotate(${ang})`}>
                <text fontSize={px(12)} textAnchor="middle" dominantBaseline="middle" fill="#2b8a3e" fontWeight={700} className="dim-text">
                  RUA · frente {fmtMeters(site.w)}
                </text>
              </g>
              <g transform={`translate(${(r0.x + r1.x) / 2} ${(r0.y + r1.y) / 2}) rotate(${ang})`}>
                <text y={px(-4)} fontSize={px(10)} textAnchor="middle" fill="#2b8a3e" className="dim-text">
                  recuo frontal {fmtMeters(RECUO_FRONTAL)}
                </text>
              </g>
              <text x={c.x} y={c.y} fontSize={px(11)} textAnchor="middle" fill="#2b8a3e" opacity={0.7} className="dim-text">
                Terreno {fmtNumber(site.w)} × {fmtNumber(site.d)} m · {fmtArea(site.w * site.d)}
              </text>
            </g>
          );
        })()}

        {/* laje (piso disponível) do pavimento, vinda dos cômodos de baixo */}
        <g pointerEvents="none">
          {belowSlab.map((poly, i) => (
            <polygon key={`slab-${i}`} points={pts(poly)} fill="#e9e4da" fillOpacity={0.7} />
          ))}
        </g>
        {/* pavimento de baixo, para alinhar paredes por cima */}
        <g pointerEvents="none">
          {belowGeoms.map((g) => (
            <polygon key={`below-${g.id}`} points={pts(g.polygon)} fill="#9aa7b5" fillOpacity={0.28} stroke="#8796a6" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
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

        {/* vão da escada (abertura na laje) */}
        <g pointerEvents="none">
          {voids.map((f) => {
            const r = stairRect(f);
            const c = { x: (r[0].x + r[2].x) / 2, y: (r[0].y + r[2].y) / 2 };
            return (
              <g key={`void-${f.id}`}>
                <polygon points={pts(r)} fill="#ffffff" stroke="#c0392b" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
                <line x1={r[0].x} y1={r[0].y} x2={r[2].x} y2={r[2].y} stroke="#c0392b" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                <line x1={r[1].x} y1={r[1].y} x2={r[3].x} y2={r[3].y} stroke="#c0392b" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                <text x={c.x} y={c.y} fontSize={px(11)} textAnchor="middle" dominantBaseline="middle" fill="#c0392b" fontWeight={700} className="room-text">
                  VAZIO (escada)
                </text>
              </g>
            );
          })}
        </g>

        {/* planta de cobertura (último pavimento) */}
        {roofGeo && (
          <g pointerEvents="none">
            <rect
              x={roofGeo.eave.minX}
              y={roofGeo.eave.minY}
              width={roofGeo.eave.maxX - roofGeo.eave.minX}
              height={roofGeo.eave.maxY - roofGeo.eave.minY}
              fill="none"
              stroke="#b4552d"
              strokeWidth={1.2}
              strokeDasharray="8 4"
              vectorEffect="non-scaling-stroke"
            />
            {roofGeo.ridges.map(([a, b], i) => (
              <line key={`rg-${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#b4552d" strokeWidth={1.2} strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />
            ))}
            {roofGeo.arrows.map(([a, b], i) => {
              const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
              const h = px(8);
              return (
                <g key={`ar-${i}`}>
                  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#b4552d" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <polygon
                    points={pts([
                      { x: b[0], y: b[1] },
                      { x: b[0] - h * Math.cos(ang - 0.4), y: b[1] - h * Math.sin(ang - 0.4) },
                      { x: b[0] - h * Math.cos(ang + 0.4), y: b[1] - h * Math.sin(ang + 0.4) },
                    ])}
                    fill="#b4552d"
                  />
                  <text x={(a[0] + b[0]) / 2 + px(6)} y={(a[1] + b[1]) / 2} fontSize={px(10)} fill="#b4552d" className="dim-text">
                    i={building.roof?.slope ?? 0}%
                  </text>
                </g>
              );
            })}
          </g>
        )}

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
                    className={`dim-text ${tool === 'select' ? 'dim-editable' : ''}`}
                    pointerEvents={tool === 'select' ? 'auto' : 'none'}
                    data-kind="dim"
                    data-id={g.id}
                  >
                    {fmtMeters(g.length)}
                  </text>
                </g>
              );
            })}
        </g>

        {/* marcações (desenho livre, setas, textos e medidas) */}
        {[...Object.values(plan.annotations ?? {}), ...(draftAnn ? [draftAnn] : [])].map((a) => (
          <AnnotationShape key={a.id || 'draft'} a={a} px={px} selected={selection?.kind === 'annotation' && selection.id === a.id} />
        ))}

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

        {/* alças do item selecionado */}
        {tool === 'select' && selection?.kind === 'furniture' && plan.furniture[selection.id] && (() => {
          const f = plan.furniture[selection.id];
          const c = Math.cos(f.rotation);
          const sn = Math.sin(f.rotation);
          const W = (u: number, v: number) => ({ x: f.x + u * c - v * sn, y: f.y + u * sn + v * c });
          const hs: [string, Vec2][] = [
            ['e', W(f.width / 2, 0)],
            ['w', W(-f.width / 2, 0)],
            ['s', W(0, f.depth / 2)],
            ['n', W(0, -f.depth / 2)],
          ];
          const rot = W(0, -f.depth / 2 - px(26));
          const top = W(0, -f.depth / 2);
          return (
            <g>
              <line x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} stroke={ACCENT} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              {hs.map(([k, q]) => (
                <rect key={k} data-kind="fhandle" data-id={k} x={q.x - px(5)} y={q.y - px(5)} width={px(10)} height={px(10)} fill="#ffffff" stroke={ACCENT} strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="handle" />
              ))}
              <circle data-kind="fhandle" data-id="rot" cx={rot.x} cy={rot.y} r={px(6)} fill={ACCENT} stroke="#ffffff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="handle rot" />
              <text x={f.x} y={f.y + f.depth / 2 + px(16)} fontSize={px(10)} textAnchor="middle" fill={ACCENT} className="dim-text" pointerEvents="none">
                {fmtNumber(f.width)} × {fmtNumber(f.depth)} m
              </text>
            </g>
          );
        })()}
        {tool === 'select' && selection?.kind === 'opening' && plan.openings[selection.id] && geoms[plan.openings[selection.id].wallId] && (() => {
          const op = plan.openings[selection.id];
          const g = geoms[op.wallId];
          return (
            <g>
              {[-1, 1].map((end) => {
                const q = add(g.a, mul(g.dir, op.offset + (end * op.width) / 2));
                return <rect key={end} data-kind="ohandle" data-id={end} x={q.x - px(5)} y={q.y - px(5)} width={px(10)} height={px(10)} fill="#ffffff" stroke={ACCENT} strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="handle" />;
              })}
            </g>
          );
        })()}

        {openingPreview}
        {furniturePreview}

        {/* pré-visualização do cômodo retangular */}
        {tool === 'room' && snap && roomPresetDef && (
          <g pointerEvents="none">
            <rect x={snap.point.x} y={snap.point.y} width={roomPresetDef.w} height={roomPresetDef.h} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={wallThickness} strokeOpacity={0.5} />
            <text x={snap.point.x + roomPresetDef.w / 2} y={snap.point.y + roomPresetDef.h / 2} fontSize={px(12)} textAnchor="middle" fill={ACCENT} fontWeight={700} className="dim-text">
              {roomPresetDef.name}
            </text>
          </g>
        )}
        {tool === 'room' && snap && !roomPresetDef && (
          <g pointerEvents="none">
            {roomStart &&
              (() => {
                const b = snap.point;
                const x0 = Math.min(roomStart.x, b.x);
                const y0 = Math.min(roomStart.y, b.y);
                const w = Math.abs(b.x - roomStart.x);
                const h = Math.abs(b.y - roomStart.y);
                return (
                  <>
                    <rect x={x0} y={y0} width={w} height={h} fill={ACCENT} fillOpacity={0.12} stroke={ACCENT} strokeWidth={wallThickness} strokeOpacity={0.5} />
                    <text x={x0 + w / 2} y={y0 - px(10)} fontSize={px(12)} textAnchor="middle" fill={ACCENT} fontWeight={700} className="dim-text">
                      {fmtMeters(w)}
                    </text>
                    <text transform={`translate(${x0 - px(10)} ${y0 + h / 2}) rotate(-90)`} fontSize={px(12)} textAnchor="middle" fill={ACCENT} fontWeight={700} className="dim-text">
                      {fmtMeters(h)}
                    </text>
                    <text x={x0 + w / 2} y={y0 + h / 2} fontSize={px(12)} textAnchor="middle" fill={ACCENT} className="dim-text">
                      {fmtArea(w * h)}
                    </text>
                  </>
                );
              })()}
            <circle cx={snap.point.x} cy={snap.point.y} r={px(5)} fill="none" stroke={snap.nodeId ? '#2f9e44' : snap.wallId ? '#e8590c' : ACCENT} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </g>
        )}

        {/* pré-visualização da parede */}
        {(tool === 'wall' || tool === 'fence') && snap && (
          <g pointerEvents="none">
            {chain &&
              (() => {
                const L = dist(chain, snap.point);
                if (L < 1e-6) return null;
                const n = mul(perp(normalize(sub(snap.point, chain))), segThickness / 2);
                const poly = [add(chain, n), add(snap.point, n), sub(snap.point, n), sub(chain, n)];
                const mid = mul(add(chain, snap.point), 0.5);
                const ang = readable(deg(Math.atan2(snap.point.y - chain.y, snap.point.x - chain.x)));
                return (
                  <>
                    <polygon points={pts(poly)} fill={ACCENT} fillOpacity={0.45} stroke={ACCENT} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <g transform={`translate(${mid.x} ${mid.y}) rotate(${ang})`}>
                      <rect x={px(-46)} y={px(-22)} width={px(92)} height={px(16)} rx={px(3)} fill="#ffffff" stroke={ACCENT} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                      <text y={px(-14)} fontSize={px(11)} textAnchor="middle" dominantBaseline="middle" fill={ACCENT} fontWeight={600}>
                        {fmtMeters(L)} · {Math.round(((-Math.atan2(snap.point.y - chain.y, snap.point.x - chain.x) * 180) / Math.PI + 360) % 360)}°
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

    {/* caixa de medida digitada (estilo "VCB" do SketchUp) */}
    {(tool === 'wall' || tool === 'room' || tool === 'fence') && (
      <output className={`vcb ${typed ? 'typing' : ''}`}>
        <b>{tool !== 'room' ? 'Comprimento' : 'Largura x profundidade'}</b>
        <span className="vcb-value">{typed || (drawingNow ? '—' : '')}</span>
        <small>
          {!drawingNow
            ? tool === 'wall'
              ? 'Clique para começar a parede'
              : tool === 'fence'
                ? `Clique para começar: ${CATALOG_BY_ID[fenceType]?.name ?? 'muro'}`
                : 'Clique no primeiro canto do cômodo'
            : tool !== 'room'
              ? 'Digite a medida (ex.: 3,5) e Enter • Shift trava 0°/90° • Esc termina'
              : 'Clique no canto oposto ou digite 4x3 e Enter'}
        </small>
      </output>
    )}

    {/* edição de cota */}
    {dimEdit && (
      <label className="dim-edit" style={{ left: dimEdit.x, top: dimEdit.y }}>
        <span>Comprimento</span>
        <input
          autoFocus
          value={dimEdit.value}
          onChange={(e) => setDimEdit({ ...dimEdit, value: e.target.value })}
          onBlur={() => setDimEdit(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = parseNumber(dimEdit.value);
              if (v > 0.05) update((d) => setWallLength(d, dimEdit.wallId, v));
              setDimEdit(null);
            }
            if (e.key === 'Escape') setDimEdit(null);
          }}
        />
        <em>m</em>
      </label>
    )}

    {textEdit && (
      <label className="dim-edit" style={{ left: textEdit.x, top: textEdit.y }}>
        <span>Nota</span>
        <input
          autoFocus
          style={{ width: 180, textAlign: 'left' }}
          value={textEdit.value}
          placeholder="Digite e Enter"
          onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
          onBlur={() => setTextEdit(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && textEdit.value.trim()) {
              const id = `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
              const t = textEdit;
              update((dd) => {
                dd.annotations ??= {};
                dd.annotations[id] = { id, kind: 'text', pts: [t.p], text: t.value.trim(), color: annotColor, size: Math.max(0.15, 14 / view.s) };
              });
              setTextEdit(null);
            }
            if (e.key === 'Escape') setTextEdit(null);
          }}
        />
      </label>
    )}

    {emptyLevel && !drawingNow && tool !== 'wall' && tool !== 'room' && <StartCard />}
    </>
  );
}

/** Cartão para começar um projeto (ou andar) em branco. */
function StartCard() {
  const update = usePlan((s) => s.update);
  const below = usePlan((s) => levelBelow(s.building, s.levelId)?.plan);
  const setTool = useUI((s) => s.setTool);
  const thickness = useUI((s) => s.wallThickness);
  const height = useUI((s) => s.wallHeight);
  const bb = below ? planBounds(below) : null;
  const [w, setW] = useState(bb ? fmtNumber(bb.maxX - bb.minX) : '10');
  const [h, setH] = useState(bb ? fmtNumber(bb.maxY - bb.minY) : '8');
  const create = () => {
    const W = parseNumber(w);
    const H = parseNumber(h);
    if (!(W > 0.5 && H > 0.5)) return;
    const x0 = bb?.minX ?? 0;
    const y0 = bb?.minY ?? 0;
    const c = [
      { x: x0, y: y0 },
      { x: x0 + W, y: y0 },
      { x: x0 + W, y: y0 + H },
      { x: x0, y: y0 + H },
    ];
    update((d) => {
      for (let i = 0; i < 4; i++) addWall(d, c[i], c[(i + 1) % 4], { thickness: Math.max(thickness, 0.2), height });
    });
    useUI.getState().requestFit();
  };
  return (
    <section className="start-card">
      <h3>{below ? 'Andar em branco' : 'Projeto em branco'}</h3>
      <p>Comece pelo contorno da casa e depois divida os cômodos.</p>
      <div className="start-dims">
        <label>
          Largura
          <input value={w} onChange={(e) => setW(e.target.value)} />
          <em>m</em>
        </label>
        <span>×</span>
        <label>
          Profundidade
          <input value={h} onChange={(e) => setH(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <em>m</em>
        </label>
      </div>
      <button className="primary-btn" onClick={create}>
        Criar contorno {w} × {h} m
      </button>
      <div className="row">
        <button onClick={() => setTool('room')}>▭ Desenhar cômodo (C)</button>
        <button onClick={() => setTool('wall')}>▬ Desenhar paredes (W)</button>
      </div>
    </section>
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

/** Desenha uma marcação; a área de clique é mais larga que o traço. */
function AnnotationShape({ a, px, selected }: { a: Annotation; px: (n: number) => number; selected: boolean }) {
  const color = a.color;
  const sw = selected ? 3.5 : 2.5;
  const points = a.pts.map((q) => `${q.x},${q.y}`).join(' ');
  const common = { 'data-kind': a.id ? 'annotation' : undefined, 'data-id': a.id || undefined };
  if (a.kind === 'text') {
    const q = a.pts[0];
    return (
      <text {...common} x={q.x} y={q.y} fontSize={a.size ?? 0.3} fill={color} fontWeight={700} className="dim-text annot-text" style={{ textDecoration: selected ? 'underline' : undefined }}>
        {a.text}
      </text>
    );
  }
  const [p0, p1] = [a.pts[0], a.pts[a.pts.length - 1]];
  const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const head = px(12);
  return (
    <g {...common}>
      <polyline points={points} fill="none" stroke="rgba(0,0,0,0)" strokeWidth={14} vectorEffect="non-scaling-stroke" />
      <polyline points={points} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {a.kind === 'arrow' && (
        <polygon
          points={[p1, { x: p1.x - head * Math.cos(ang - 0.4), y: p1.y - head * Math.sin(ang - 0.4) }, { x: p1.x - head * Math.cos(ang + 0.4), y: p1.y - head * Math.sin(ang + 0.4) }].map((q) => `${q.x},${q.y}`).join(' ')}
          fill={color}
        />
      )}
      {a.kind === 'measure' && (
        <>
          {[p0, p1].map((q, i) => (
            <line key={i} x1={q.x - px(6) * Math.cos(ang + Math.PI / 4)} y1={q.y - px(6) * Math.sin(ang + Math.PI / 4)} x2={q.x + px(6) * Math.cos(ang + Math.PI / 4)} y2={q.y + px(6) * Math.sin(ang + Math.PI / 4)} stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          ))}
          <text
            transform={`translate(${(p0.x + p1.x) / 2} ${(p0.y + p1.y) / 2}) rotate(${((ang > Math.PI / 2 || ang <= -Math.PI / 2 ? ang + Math.PI : ang) * 180) / Math.PI}) translate(0 ${-px(7)})`}
            fontSize={px(12)}
            textAnchor="middle"
            fill={color}
            fontWeight={700}
            className="dim-text"
          >
            {fmtMeters(Math.hypot(p1.x - p0.x, p1.y - p0.y))}
          </text>
        </>
      )}
    </g>
  );
}
