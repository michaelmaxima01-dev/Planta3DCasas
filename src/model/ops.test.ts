import { describe, expect, it } from 'vitest';
import { detectRooms } from '../geometry/rooms';
import { buildExamplePlan } from './example';
import { addOpeningAt, addWall, createEmptyPlan, deleteSelection, mergeNodes, splitWall } from './ops';

const P = { thickness: 0.15, height: 2.8 };

describe('operações da planta', () => {
  it('paredes que se cruzam são divididas no cruzamento', () => {
    const plan = createEmptyPlan();
    addWall(plan, { x: 0, y: 2 }, { x: 4, y: 2 }, P);
    addWall(plan, { x: 2, y: 0 }, { x: 2, y: 4 }, P);
    expect(Object.keys(plan.walls)).toHaveLength(4);
    expect(Object.keys(plan.nodes)).toHaveLength(5);
  });

  it('reaproveita nós existentes', () => {
    const plan = createEmptyPlan();
    addWall(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, P);
    addWall(plan, { x: 4, y: 0 }, { x: 4, y: 3 }, P);
    expect(Object.keys(plan.nodes)).toHaveLength(3);
  });

  it('ao dividir uma parede a porta vai para o trecho certo', () => {
    const plan = createEmptyPlan();
    const [w] = addWall(plan, { x: 0, y: 0 }, { x: 6, y: 0 }, P);
    const d = addOpeningAt(plan, { x: 4.5, y: 0 }, 'door')!;
    splitWall(plan, w, { x: 3, y: 0 });
    expect(plan.openings[d].wallId).not.toBe(w);
    expect(plan.openings[d].offset).toBeCloseTo(1.5);
  });

  it('juntar nós remove paredes degeneradas', () => {
    const plan = createEmptyPlan();
    addWall(plan, { x: 0, y: 0 }, { x: 1, y: 0 }, P);
    const [n0, n1] = Object.keys(plan.nodes);
    mergeNodes(plan, n1, n0);
    expect(Object.keys(plan.walls)).toHaveLength(0);
  });

  it('excluir parede remove suas aberturas e nós soltos', () => {
    const plan = createEmptyPlan();
    const [w] = addWall(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, P);
    addOpeningAt(plan, { x: 2, y: 0 }, 'window');
    deleteSelection(plan, { kind: 'wall', id: w });
    expect(plan).toMatchObject({ walls: {}, nodes: {}, openings: {} });
  });

  it('casa de exemplo tem 4 cômodos nomeados', () => {
    const rooms = detectRooms(buildExamplePlan());
    expect(rooms.map((r) => r.name).sort()).toEqual(['Banheiro', 'Quarto 1', 'Quarto 2', 'Sala e cozinha']);
    const sala = rooms.find((r) => r.name === 'Sala e cozinha')!;
    expect(sala.area).toBeCloseTo((6 - 0.1 - 0.06) * (8 - 0.2), 6);
  });
});
