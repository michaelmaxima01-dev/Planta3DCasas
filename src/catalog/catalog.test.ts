import { describe, expect, it } from 'vitest';
import { detectRooms } from '../geometry/rooms';
import { pointInPolygon } from '../geometry/vec';
import { createEmptyPlan } from '../model/ops';
import { ROOM_PRESETS, applyPreset } from '../model/presets';
import { stairRect } from '../model/stairs';
import { CATALOG, CATALOG_BY_ID } from './catalog';

describe('catálogo', () => {
  it('tem mais de 170 objetos, ids únicos e peças válidas', () => {
    expect(CATALOG.length).toBeGreaterThan(170);
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
    for (const c of CATALOG) {
      const parts = c.parts(c.width, c.depth, c.height);
      expect(parts.length, c.id).toBeGreaterThan(0);
      for (const p of parts) for (const v of [p.x, p.y, p.z, p.sx, p.sy, p.sz]) expect(Number.isFinite(v), c.id).toBe(true);
    }
  });

  it('tem as categorias novas', () => {
    const cats = new Set(CATALOG.map((c) => c.category));
    for (const k of ['Jardim', 'Garagem', 'Vidros e divisórias', 'Área gourmet', 'Escadas']) expect(cats.has(k)).toBe(true);
  });

  it('escadas novas cabem no próprio retângulo e chegam ao andar de cima', () => {
    for (const id of ['stair_l_left', 'stair_l_winder', 'stair_u3', 'stair_imperial', 'stair_concrete', 'stair_steel', 'stair_open', 'stair_open_l', 'stair_open_u', 'stair_curved']) {
      const c = CATALOG_BY_ID[id];
      expect(c.stair).toBe(true);
      const fp = c.footprint!(2.95);
      expect(fp.width).toBeGreaterThan(0.8);
      expect(fp.depth).toBeGreaterThan(0.8);
      const parts = c.parts(fp.width, fp.depth, 2.95);
      const top = Math.max(...parts.map((p) => p.y + p.sy / 2).filter((t) => t < 3.2));
      expect(top, id).toBeCloseTo(2.95, 2);
      for (const p of parts.filter((q) => !q.ry)) {
        expect(Math.abs(p.x) - p.sx / 2, id).toBeLessThanOrEqual(fp.width / 2 + 1e-6);
        expect(Math.abs(p.z) - p.sz / 2, id).toBeLessThanOrEqual(fp.depth / 2 + 1e-6);
      }
    }
  });
});

describe('escadas vazadas', () => {
  it('deixam o espaço livre embaixo (nenhuma peça encosta no chão depois dos primeiros degraus)', () => {
    for (const id of ['stair_open', 'stair_open_l', 'stair_open_u', 'stair_curved']) {
      const c = CATALOG_BY_ID[id];
      const fp = c.footprint!(2.95);
      const parts = c.parts(fp.width, fp.depth, 2.95);
      const onFloor = parts.filter((p) => p.y - p.sy / 2 < 0.05 && p.y + p.sy / 2 > 0.6);
      expect(onFloor, id).toHaveLength(0);
    }
  });
});

describe('planos prontos', () => {
  for (const preset of ROOM_PRESETS) {
    it(`${preset.name}: cria o cômodo, o nome e os objetos dentro dele`, () => {
      const p = createEmptyPlan();
      const placed = applyPreset(p, preset, { x: 0, y: 0 }, { thickness: 0.15, height: 2.8 });
      const rooms = detectRooms(p);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).not.toBe('');
      expect(placed).toBeGreaterThan(0);
      for (const f of Object.values(p.furniture)) for (const q of stairRect(f)) expect(pointInPolygon(q, rooms[0].polygon), `${preset.key}/${f.catalogId}`).toBe(true);
      if (preset.gate) expect(Object.values(p.openings).some((o) => o.style === preset.gate)).toBe(true);
    });
  }
});
