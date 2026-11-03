/** Ponto 2D na planta, em metros. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Parede representada pela linha central + espessura (padrão Sweet Home 3D / Pascal). */
export interface Wall {
  id: string;
  start: Vec2;
  end: Vec2;
  thickness: number;
  height: number;
}
