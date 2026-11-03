import { describe, expect, it } from 'vitest';
import { detectRooms } from '../geometry/rooms';
import { pointInPolygon } from '../geometry/vec';
import { ROOM_TYPES, furnishRoom } from './furnish';
import { addOpeningAt, addWall, createEmptyPlan } from './ops';
import { stairRect } from './stairs';

function room(w: number, h: number) {
  const p = createEmptyPlan();
  const c = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  for (let i = 0; i < 4; i++) addWall(p, c[i], c[(i + 1) % 4], { thickness: 0.15, height: 2.8 });
  addOpeningAt(p, { x: w - 0.8, y: h }, 'door');
  return p;
}

describe('mobiliar automaticamente', () => {
  for (const [key, w, h, min] of [['suite', 4, 3.6, 4], ['sala', 5, 4, 5], ['cozinha', 4, 3.5, 5], ['banheiro', 2.2, 2.4, 3], ['escritorio', 3, 3, 3]] as const) {
    it(`${ROOM_TYPES.find((t) => t.key === key)!.name}: coloca os móveis sem sobrepor e sem sair do cômodo`, () => {
      const p = room(w, h);
      const r = detectRooms(p)[0];
      const res = furnishRoom(p, r, key);
      expect(res.placed).toBeGreaterThanOrEqual(min);
      for (const f of Object.values(p.furniture)) {
        for (const q of stairRect(f)) expect(pointInPolygon(q, r.polygon)).toBe(true);
      }
    });
  }
});
