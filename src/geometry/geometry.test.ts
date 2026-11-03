import { describe, expect, it } from 'vitest';
import { addOpeningAt, addWall, createEmptyPlan } from '../model/ops';
import { detectRooms } from './rooms';
import { snapFurnitureToWall, snapPoint } from './snap';
import { computeWallGeometry, wallPrisms } from './walls';
import { type Vec2, lineIntersection, signedArea } from './vec';

const P = { thickness: 0.2, height: 2.8 };
const has = (pts: Vec2[], x: number, y: number) => pts.some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6);

function rect(w: number, h: number) {
  const plan = createEmptyPlan();
  const c = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  for (let i = 0; i < 4; i++) addWall(plan, c[i], c[(i + 1) % 4], P);
  return plan;
}

describe('vec', () => {
  it('intersecta retas e calcula área com sinal', () => {
    expect(lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: -1 }, { x: 0, y: 1 })).toEqual({ x: 2, y: 0 });
    expect(lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 })).toBeNull();
    expect(signedArea([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }])).toBe(2);
  });
});

describe('junção de paredes', () => {
  it('parede isolada tem pontas retas', () => {
    const plan = createEmptyPlan();
    const [id] = addWall(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, P);
    const g = computeWallGeometry(plan)[id];
    expect(has(g.polygon, 0, 0.1)).toBe(true);
    expect(has(g.polygon, 0, -0.1)).toBe(true);
    expect(has(g.polygon, 4, 0.1)).toBe(true);
    expect(g.length).toBe(4);
  });

  it('canto em L é cortado em meia-esquadria (miter)', () => {
    const plan = createEmptyPlan();
    const [w1] = addWall(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, P);
    const [w2] = addWall(plan, { x: 4, y: 0 }, { x: 4, y: 3 }, P);
    const g = computeWallGeometry(plan);
    // canto externo e interno compartilhados pelas duas paredes
    for (const id of [w1, w2]) {
      expect(has(g[id].polygon, 4.1, -0.1)).toBe(true);
      expect(has(g[id].polygon, 3.9, 0.1)).toBe(true);
    }
  });

  it('junção em T não deixa a parede da frente atravessar', () => {
    const plan = createEmptyPlan();
    addWall(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, P);
    const [stem] = addWall(plan, { x: 2, y: 0 }, { x: 2, y: 3 }, P);
    expect(Object.keys(plan.walls)).toHaveLength(3); // parede de cima foi dividida
    const g = computeWallGeometry(plan)[stem];
    expect(has(g.polygon, 1.9, 0.1)).toBe(true);
    expect(has(g.polygon, 2.1, 0.1)).toBe(true);
  });
});

describe('vãos de portas e janelas', () => {
  it('porta gera trecho esquerdo, verga e trecho direito', () => {
    const plan = createEmptyPlan();
    const [id] = addWall(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, P);
    const op = addOpeningAt(plan, { x: 2, y: 0 }, 'door')!;
    const prisms = wallPrisms(computeWallGeometry(plan)[id], [plan.openings[op]]);
    expect(prisms).toHaveLength(3);
    expect(prisms[1]).toMatchObject({ bottom: 2.1, top: 2.8 });
  });

  it('janela gera peitoril e verga', () => {
    const plan = createEmptyPlan();
    const [id] = addWall(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, P);
    const op = addOpeningAt(plan, { x: 2, y: 0 }, 'window')!;
    const prisms = wallPrisms(computeWallGeometry(plan)[id], [plan.openings[op]]);
    expect(prisms).toHaveLength(4);
    expect(prisms.map((p) => [p.bottom, p.top])).toContainEqual([0, 1]);
    expect(prisms.map((p) => [p.bottom, p.top])).toContainEqual([2.2, 2.8]);
  });
});

describe('detecção de cômodos', () => {
  it('retângulo vira um cômodo com área interna', () => {
    const rooms = detectRooms(rect(4, 3));
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(3.8 * 2.8, 6);
  });

  it('parede interna divide em dois cômodos', () => {
    const plan = rect(4, 3);
    addWall(plan, { x: 2, y: 0 }, { x: 2, y: 3 }, P);
    const rooms = detectRooms(plan);
    expect(rooms).toHaveLength(2);
    expect(rooms[0].area).toBeCloseTo(1.8 * 2.8, 6);
  });

  it('parede solta dentro do cômodo não cria cômodo novo', () => {
    const plan = rect(4, 3);
    addWall(plan, { x: 2, y: 0 }, { x: 2, y: 1.5 }, P);
    expect(detectRooms(plan)).toHaveLength(1);
  });

  it('usa o rótulo para nomear o cômodo', () => {
    const plan = rect(4, 3);
    plan.rooms.r1 = { id: 'r1', x: 1, y: 1, name: 'Sala', floorColor: '#fff' };
    expect(detectRooms(plan)[0]).toMatchObject({ id: 'r1', name: 'Sala' });
  });
});

describe('snapping', () => {
  const plan = rect(4, 3);
  it('encaixa em nó, em parede e na grade', () => {
    expect(snapPoint(plan, { x: 4.05, y: 0.04 }, { pxPerMeter: 100 }).nodeId).toBeDefined();
    const w = snapPoint(plan, { x: 2, y: 0.05 }, { pxPerMeter: 100 });
    expect(w.wallId).toBeDefined();
    expect(w.point.y).toBeCloseTo(0);
    expect(snapPoint(plan, { x: 1.234, y: 1.66 }, { pxPerMeter: 100 }).point).toEqual({ x: 1.25, y: 1.65 });
  });

  it('encaixa ângulo de 45° a partir da âncora', () => {
    const r = snapPoint(createEmptyPlan(), { x: 1, y: 1.05 }, { pxPerMeter: 100, anchor: { x: 0, y: 0 } });
    expect(r.angleSnapped).toBe(true);
    expect(r.point.x).toBeCloseTo(r.point.y, 9);
  });

  it('móvel encosta de costas na parede', () => {
    const walls = Object.values(computeWallGeometry(plan));
    const s = snapFurnitureToWall(walls, { x: 2, y: 0.5 }, 0.6)!;
    expect(s.pos.y).toBeCloseTo(0.1 + 0.3 + 0.005);
    expect(Math.abs(Math.sin(s.rotation))).toBeCloseTo(0); // frente para +y
  });
});
