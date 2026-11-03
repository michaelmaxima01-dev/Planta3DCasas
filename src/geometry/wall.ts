import type { Vec2, Wall } from '../model/types';

/**
 * Contorno retangular da parede (sem junções ainda), no sentido anti-horário:
 * start-esquerda, end-esquerda, end-direita, start-direita.
 */
export function wallOutline(wall: Wall): Vec2[] {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) throw new Error(`Parede ${wall.id} tem comprimento zero`);
  const h = wall.thickness / 2;
  const nx = (-dy / len) * h;
  const ny = (dx / len) * h;
  return [
    { x: wall.start.x + nx, y: wall.start.y + ny },
    { x: wall.end.x + nx, y: wall.end.y + ny },
    { x: wall.end.x - nx, y: wall.end.y - ny },
    { x: wall.start.x - nx, y: wall.start.y - ny },
  ];
}

export function wallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}
