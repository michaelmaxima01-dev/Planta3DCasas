import { addFurniture, addOpeningAt, addWall, createEmptyPlan, uid } from './ops';
import type { Plan } from './types';

const EXT = { thickness: 0.2, height: 2.8 };
const INT = { thickness: 0.12, height: 2.8 };

// Rotações: o "frente" do móvel aponta para +y quando a rotação é 0.
const FACE_DOWN = 0;
const FACE_UP = Math.PI;
const FACE_RIGHT = -Math.PI / 2;
const FACE_LEFT = Math.PI / 2;

/** Casa de exemplo 10 × 8 m: sala/cozinha integrada, 2 quartos e banheiro. */
export function buildExamplePlan(): Plan {
  const p = createEmptyPlan();
  const outline = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 },
  ];
  for (let i = 0; i < outline.length; i++) addWall(p, outline[i], outline[(i + 1) % outline.length], EXT);
  addWall(p, { x: 6, y: 0 }, { x: 6, y: 8 }, INT);
  addWall(p, { x: 6, y: 4 }, { x: 10, y: 4 }, INT);
  addWall(p, { x: 8.5, y: 4 }, { x: 8.5, y: 8 }, INT);

  // Portas
  addOpeningAt(p, { x: 1.2, y: 8 }, 'door', { width: 0.9 });
  addOpeningAt(p, { x: 6, y: 2.6 }, 'door', { width: 0.8, flip: true });
  addOpeningAt(p, { x: 6, y: 5.0 }, 'door', { width: 0.8 });
  addOpeningAt(p, { x: 9.25, y: 4 }, 'door', { width: 0.7, side: true });
  // Janelas
  addOpeningAt(p, { x: 2.2, y: 0 }, 'window', { width: 1.6, height: 1.0, sill: 1.1 });
  addOpeningAt(p, { x: 0, y: 5.8 }, 'window', { width: 2.0, height: 1.4, sill: 0.8 });
  addOpeningAt(p, { x: 8.0, y: 0 }, 'window', { width: 1.5, height: 1.2, sill: 1.0 });
  addOpeningAt(p, { x: 7.25, y: 8 }, 'window', { width: 1.2, height: 1.2, sill: 1.0 });
  addOpeningAt(p, { x: 9.25, y: 8 }, 'window', { width: 0.6, height: 0.6, sill: 1.5 });

  // Cozinha (encostada na parede de cima, y = 0.1)
  addFurniture(p, 'stove', { x: 0.42, y: 0.41 }, FACE_DOWN);
  addFurniture(p, 'kitchen_counter', { x: 1.92, y: 0.41 }, FACE_DOWN);
  addFurniture(p, 'fridge', { x: 3.5, y: 0.46 }, FACE_DOWN);
  addFurniture(p, 'dining_table', { x: 3.4, y: 2.4 }, FACE_DOWN);
  for (const x of [3.0, 3.8]) {
    addFurniture(p, 'chair', { x, y: 1.72 }, FACE_DOWN);
    addFurniture(p, 'chair', { x, y: 3.08 }, FACE_UP);
  }
  addFurniture(p, 'ceiling_light', { x: 3.4, y: 2.4 });

  // Sala
  addFurniture(p, 'tv_rack', { x: 0.33, y: 5.8 }, FACE_RIGHT);
  addFurniture(p, 'rug', { x: 2.2, y: 5.8 }, FACE_LEFT);
  addFurniture(p, 'coffee_table', { x: 2.0, y: 5.8 }, FACE_LEFT);
  addFurniture(p, 'sofa3', { x: 3.3, y: 5.8 }, FACE_LEFT);
  addFurniture(p, 'armchair', { x: 2.0, y: 7.25 }, FACE_UP);
  addFurniture(p, 'floor_lamp', { x: 3.5, y: 7.4 });
  addFurniture(p, 'plant', { x: 5.55, y: 7.5 });
  addFurniture(p, 'bookshelf', { x: 5.76, y: 6.6 }, FACE_LEFT);

  // Quarto 1
  addFurniture(p, 'double_bed', { x: 8.0, y: 1.13 }, FACE_DOWN);
  addFurniture(p, 'nightstand', { x: 6.9, y: 0.31 }, FACE_DOWN);
  addFurniture(p, 'nightstand', { x: 9.1, y: 0.31 }, FACE_DOWN);
  addFurniture(p, 'wardrobe', { x: 9.6, y: 2.6 }, FACE_LEFT);

  // Quarto 2
  addFurniture(p, 'single_bed', { x: 7.45, y: 7.4 }, FACE_LEFT);
  addFurniture(p, 'desk', { x: 7.4, y: 4.37 }, FACE_DOWN);
  addFurniture(p, 'office_chair', { x: 7.4, y: 4.95 }, FACE_UP);

  // Banheiro
  addFurniture(p, 'toilet', { x: 9.56, y: 5.5 }, FACE_LEFT);
  addFurniture(p, 'bath_sink', { x: 9.67, y: 6.4 }, FACE_LEFT);
  addFurniture(p, 'shower', { x: 9.03, y: 7.44 }, FACE_UP);

  const label = (x: number, y: number, name: string, floorColor: string) => {
    const id = uid('r');
    p.rooms[id] = { id, x, y, name, floorColor };
  };
  label(3, 4, 'Sala e cozinha', '#d9c4a3');
  label(8, 2, 'Quarto 1', '#c8a77f');
  label(7.25, 6, 'Quarto 2', '#c8a77f');
  label(9.25, 6, 'Banheiro', '#cfd8dc');
  return p;
}
