import { describe, expect, it } from 'vitest';
import { wallLength, wallOutline } from './wall';

const wall = { id: 'w1', start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.2, height: 2.8 };

describe('wallOutline', () => {
  it('gera um retângulo com a espessura da parede', () => {
    const pts = wallOutline(wall);
    expect(pts).toHaveLength(4);
    expect(pts[0].y).toBeCloseTo(0.1);
    expect(pts[3].y).toBeCloseTo(-0.1);
    expect(pts[1].x).toBeCloseTo(4);
  });

  it('rejeita parede de comprimento zero', () => {
    expect(() => wallOutline({ ...wall, end: { x: 0, y: 0 } })).toThrow();
  });

  it('calcula o comprimento', () => {
    expect(wallLength(wall)).toBe(4);
  });
});
