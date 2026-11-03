import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { computeWallGeometry } from '../geometry/walls';
import { planBounds } from '../model/ops';
import type { Building } from '../model/types';
import { usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import { prismGeometry } from '../view3d/buildScene';
import { unitBox } from '../view3d/materials';
import type { Status } from './analyze';
import { cachedAnalysis } from './ops';
import { STATUS_COLOR } from './StructPlan2D';
import { BALDRAME } from './types';

const concrete = new THREE.MeshStandardMaterial({ color: '#b7bcc3', roughness: 0.85 });
const slabMat = new THREE.MeshStandardMaterial({ color: '#c9cdd3', roughness: 0.9, transparent: true, opacity: 0.85 });
const selectedMat = new THREE.MeshStandardMaterial({ color: '#2f7cf6', roughness: 0.6 });
const ghostMat = new THREE.MeshStandardMaterial({ color: '#e9e2d6', transparent: true, opacity: 0.16, depthWrite: false });
const statusMats: Record<Status, THREE.Material> = {
  ok: new THREE.MeshStandardMaterial({ color: '#8fc79a', roughness: 0.8 }),
  warn: new THREE.MeshStandardMaterial({ color: STATUS_COLOR.warn, roughness: 0.8 }),
  fail: new THREE.MeshStandardMaterial({ color: STATUS_COLOR.fail, roughness: 0.8 }),
};
const soilMat = new THREE.MeshStandardMaterial({ color: '#b39b7d', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });

export function StructScene3D() {
  const building = usePlan((s) => s.building);
  const b = planBounds(building.levels[0].plan) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const r = Math.max(4, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2);
  const [camera] = useState<[number, number, number]>(() => [cx + r * 1.3, r * 1.5, cz + r * 1.9]);
  const [target] = useState<[number, number, number]>(() => [cx, 1.5, cz]);
  return (
    <Canvas shadows="percentage" camera={{ position: camera, fov: 45, near: 0.05, far: 500 }} onPointerMissed={(e) => e.type === 'click' && useUI.getState().select(null)}>
      <color attach="background" args={['#eef1f5']} />
      <hemisphereLight args={['#ffffff', '#a99d8c', 1.0]} />
      <directionalLight position={[cx + r, r * 2.5, cz + r * 0.6]} intensity={1.8} />
      <Contents building={building} />
      <OrbitControls makeDefault target={target} enableDamping />
    </Canvas>
  );
}

function Contents({ building }: { building: Building }) {
  const selection = useUI((s) => s.selection);
  const select = useUI((s) => s.select);
  const colorByStatus = useUI((s) => s.colorByStatus);
  const ghostWalls = useUI((s) => s.ghostWalls);
  const result = useMemo(() => cachedAnalysis(building), [building]);
  const pillarById = building.structure.pillars;
  const levelById = new Map(building.levels.map((l) => [l.id, l]));
  const depth = building.structure.settings.foundationDepth;

  const mat = (kind: string, id: string, st: Status) =>
    selection?.kind === kind && selection.id === id ? selectedMat : colorByStatus ? statusMats[st] : concrete;
  const click = (kind: 'pillar' | 'beam' | 'slab' | 'footing', id: string) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return;
    e.stopPropagation();
    select({ kind, id });
  };

  const bnd = planBounds(building.levels[0].plan) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };

  return (
    <>
      {/* terreno em corte (transparente) para enxergar a fundação */}
      <mesh rotation-x={-Math.PI / 2} position={[(bnd.minX + bnd.maxX) / 2, 0, (bnd.minY + bnd.maxY) / 2]} material={soilMat}>
        <planeGeometry args={[bnd.maxX - bnd.minX + 6, bnd.maxY - bnd.minY + 6]} />
      </mesh>

      {result.footings.map((f) => {
        const p = pillarById[f.pillarId];
        const top = -depth + f.h;
        return (
          <group key={f.id} position={[f.p.x, 0, f.p.y]} rotation-y={-f.rotation} onClick={click('footing', f.id)}>
            <mesh geometry={unitBox} material={mat('footing', f.id, f.status)} scale={[f.L, f.h, f.B]} position={[0, -depth + f.h / 2, 0]} />
            {p && <mesh geometry={unitBox} material={concrete} scale={[p.h / 100, -top, p.b / 100]} position={[0, top / 2, 0]} />}
            {f.kind === 'estaca' &&
              Array.from({ length: f.piles }, (_, k) => (
                <mesh key={k} position={[f.piles === 1 ? 0 : -f.L / 2 + 0.3 + (k * (f.L - 0.6)) / Math.max(1, f.piles - 1), -depth - 3, 0]}>
                  <cylinderGeometry args={[0.125, 0.125, 6, 16]} />
                  <meshStandardMaterial color="#9aa0a8" />
                </mesh>
              ))}
          </group>
        );
      })}

      {result.beams.map((v) => {
        const src = building.structure.beams[v.id];
        const lvl = v.levelId === BALDRAME ? null : levelById.get(v.levelId);
        const top = lvl ? lvl.elevation + lvl.height : 0;
        const h = src.h / 100;
        return (
          <mesh
            key={v.id}
            geometry={unitBox}
            material={mat('beam', v.id, v.status)}
            position={[(v.a.x + v.b.x) / 2, top - h / 2, (v.a.y + v.b.y) / 2]}
            rotation-y={-Math.atan2(v.b.y - v.a.y, v.b.x - v.a.x)}
            scale={[v.L, h, src.bw / 100]}
            castShadow
            onClick={click('beam', v.id)}
          />
        );
      })}

      {result.pillars.map((p) => {
        const lvl = levelById.get(p.levelId);
        if (!lvl) return null;
        return (
          <mesh
            key={p.id}
            geometry={unitBox}
            material={mat('pillar', p.id, p.status)}
            position={[p.p.x, lvl.elevation + lvl.height / 2, p.p.y]}
            rotation-y={-p.rotation}
            scale={[p.h / 100, lvl.height, p.b / 100]}
            castShadow
            onClick={click('pillar', p.id)}
          />
        );
      })}

      {result.slabs.map((x) => {
        const lvl = levelById.get(x.levelId)!;
        return <Slab key={x.id} id={x.id} polygon={x.polygon} top={lvl.elevation + lvl.height} t={x.thickness / 100} material={selection?.kind === 'slab' && selection.id === x.id ? selectedMat : colorByStatus && x.status !== 'ok' ? statusMats[x.status] : slabMat} onClick={click('slab', x.id)} />;
      })}

      {ghostWalls && building.levels.map((l) => <GhostWalls key={l.id} building={building} levelId={l.id} />)}
    </>
  );
}

function Slab({ polygon, top, t, material, onClick }: { id: string; polygon: { x: number; y: number }[]; top: number; t: number; material: THREE.Material; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const geo = useMemo(() => prismGeometry(polygon, top - t, top), [polygon, top, t]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={material} onClick={onClick} receiveShadow />;
}

function GhostWalls({ building, levelId }: { building: Building; levelId: string }) {
  const level = building.levels.find((l) => l.id === levelId)!;
  const geos = useMemo(
    () => Object.values(computeWallGeometry(level.plan)).map((g) => prismGeometry(g.polygon, level.elevation, level.elevation + g.height)),
    [level.plan, level.elevation],
  );
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  return (
    <>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={ghostMat} raycast={() => null} />
      ))}
    </>
  );
}
