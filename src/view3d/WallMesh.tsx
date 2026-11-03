import { useMemo } from 'react';
import * as THREE from 'three';
import type { Wall } from '../model/types';
import { wallOutline } from '../geometry/wall';

/** Extruda o contorno 2D da parede até a altura dela. Planta (x, y) -> mundo (x, -z). */
export function WallMesh({ wall }: { wall: Wall }) {
  const geometry = useMemo(() => {
    const pts = wallOutline(wall);
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: wall.height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [wall]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#e8e4dc" />
    </mesh>
  );
}
