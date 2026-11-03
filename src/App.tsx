import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import type { Wall } from './model/types';
import { WallMesh } from './view3d/WallMesh';

// Cômodo de exemplo 5 x 4 m (as junções ainda se sobrepõem; o miter vem no próximo passo).
const walls: Wall[] = [
  { id: 'w1', start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, thickness: 0.15, height: 2.8 },
  { id: 'w2', start: { x: 5, y: 0 }, end: { x: 5, y: 4 }, thickness: 0.15, height: 2.8 },
  { id: 'w3', start: { x: 5, y: 4 }, end: { x: 0, y: 4 }, thickness: 0.15, height: 2.8 },
  { id: 'w4', start: { x: 0, y: 4 }, end: { x: 0, y: 0 }, thickness: 0.15, height: 2.8 },
];

export default function App() {
  return (
    <Canvas shadows camera={{ position: [9, 8, 9], fov: 45 }}>
      <color attach="background" args={['#f4f5f7']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 4]} intensity={1.5} castShadow />
      <Grid args={[30, 30]} cellSize={0.5} sectionSize={1} infiniteGrid fadeDistance={40} />
      <group position={[-2.5, 0, 2]}>
        {walls.map((w) => (
          <WallMesh key={w.id} wall={w} />
        ))}
      </group>
      <OrbitControls makeDefault />
    </Canvas>
  );
}
