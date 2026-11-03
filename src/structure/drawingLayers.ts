/**
 * Acrescenta a estrutura ao desenho técnico (usado no DXF): pilares, vigas, lajes
 * ou, no nível da fundação, sapatas/blocos e baldrames.
 */
import { type Vec2, centroid } from '../geometry/vec';
import type { Drawing, Prim } from '../export/drawing';
import type { Building } from '../model/types';
import type { StructureResult } from './analyze';
import { BALDRAME } from './types';

const readable = (a: number) => (a > Math.PI / 2 ? a - Math.PI : a <= -Math.PI / 2 ? a + Math.PI : a);

function rect(c: Vec2, len: number, wid: number, rot: number): Vec2[] {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  return [
    [-len / 2, -wid / 2],
    [len / 2, -wid / 2],
    [len / 2, wid / 2],
    [-len / 2, wid / 2],
  ].map(([u, v]) => ({ x: c.x + u * cs - v * sn, y: c.y + u * sn + v * cs }));
}

export function addStructureToDrawing(d: Drawing, b: Building, r: StructureResult, levelKey: string, scale: number) {
  const mm = (v: number) => (v * scale) / 1000;
  const out: Prim[] = [];
  const pillarLevel = levelKey === BALDRAME ? b.levels[0]?.id : levelKey;

  if (levelKey !== BALDRAME) {
    for (const s of r.slabs.filter((x) => x.levelId === levelKey)) {
      const c = centroid(s.polygon);
      out.push({ t: 'poly', layer: 'LAJES', pts: s.polygon, closed: true, stroke: '#b08900', weight: 0.13, dash: true });
      out.push({ t: 'text', layer: 'LAJES', p: { x: c.x, y: c.y - mm(9) }, text: `${s.code} - ${s.system.replace('Treliçada ', '')} h=${s.thickness}`, size: 2, angle: 0, bold: true, color: '#8a6d00' });
    }
  } else {
    for (const f of r.footings) {
      out.push({ t: 'poly', layer: 'FUNDACAO', pts: rect(f.p, f.L, f.B, f.rotation), closed: true, stroke: '#a05a00', weight: 0.35 });
      if (f.kind === 'estaca') {
        for (let k = 0; k < f.piles; k++) {
          const u = f.piles === 1 ? 0 : -f.L / 2 + 0.3 + (k * (f.L - 0.6)) / Math.max(1, f.piles - 1);
          out.push({ t: 'arc', layer: 'FUNDACAO', c: { x: f.p.x + u * Math.cos(f.rotation), y: f.p.y + u * Math.sin(f.rotation) }, r: 0.125, a0: 0, a1: Math.PI * 2, weight: 0.18 });
        }
      }
      const label = f.kind === 'estaca' ? `${f.code} ${f.piles} estaca(s)` : `${f.code} ${Math.round(f.L * 100)}x${Math.round(f.B * 100)} h=${Math.round(f.h * 100)}`;
      out.push({ t: 'text', layer: 'FUNDACAO', p: { x: f.p.x, y: f.p.y + Math.max(f.B, f.L) / 2 + mm(4) }, text: label, size: 2, angle: 0, bold: true, color: '#a05a00' });
    }
  }

  for (const v of r.beams.filter((x) => x.levelId === levelKey)) {
    const c = { x: (v.a.x + v.b.x) / 2, y: (v.a.y + v.b.y) / 2 };
    const ang = Math.atan2(v.b.y - v.a.y, v.b.x - v.a.x);
    out.push({ t: 'poly', layer: 'VIGAS', pts: rect(c, v.L, v.bw / 100, ang), closed: true, stroke: '#7b2f9e', weight: 0.25, dash: true });
    const t = readable(ang);
    out.push({ t: 'text', layer: 'VIGAS', p: { x: c.x + Math.sin(t) * mm(3), y: c.y - Math.cos(t) * mm(3) }, text: `${v.code} ${v.bw}x${v.h}`, size: 1.8, angle: t, color: '#5b2178' });
  }

  for (const p of r.pillars.filter((x) => x.levelId === pillarLevel)) {
    out.push({ t: 'poly', layer: 'PILARES', pts: rect(p.p, p.h / 100, p.b / 100, p.rotation), closed: true, fill: '#3b3f45', stroke: '#1f2328', weight: 0.25 });
    out.push({ t: 'text', layer: 'PILARES', p: { x: p.p.x + mm(5), y: p.p.y - mm(3) }, text: `${p.code} ${p.b}/${p.h}`, size: 1.8, angle: 0, bold: true });
  }

  d.prims.push(...out);
  return { count: out.length, note: `Estrutura: ${r.pillars.filter((x) => x.levelId === pillarLevel).length} pilares, ${r.beams.filter((x) => x.levelId === levelKey).length} vigas` };
}

