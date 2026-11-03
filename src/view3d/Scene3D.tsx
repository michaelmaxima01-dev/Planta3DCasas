import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { CATALOG_BY_ID } from '../catalog/catalog';
import { type Room, detectRooms } from '../geometry/rooms';
import type { Vec2 } from '../geometry/vec';
import { type WallGeom, computeWallGeometry, openingCenter, wallPrisms } from '../geometry/walls';
import { planBounds } from '../model/ops';
import type { Building, FurnitureItem, Opening, Plan, Selection } from '../model/types';
import { prismGeometry } from './buildScene';
import { selectPlan, usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import {
  doorLeafMaterial,
  floorMaterial,
  frameMaterial,
  glassMaterial,
  handleMaterial,
  openingSelectedMaterial,
  partMaterial,
  setWallCut,
  unitBox,
  unitCylinder,
  unitSphere,
  wallMaterial,
  wallSelectedMaterial,
} from './materials';

type Select = (s: Selection) => void;

/** Converte um clique em seleção, ignorando cliques que foram na verdade arrastes da câmera. */
const clickHandler = (select: Select, sel: Selection) => (e: ThreeEvent<MouseEvent>) => {
  if (e.delta > 5) return;
  e.stopPropagation();
  select(sel);
};

function computeFrame(plan: Plan) {
  const b = planBounds(plan) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const r = Math.max(4, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2);
  return { center: new THREE.Vector3(cx, 0, cz), radius: r, camera: new THREE.Vector3(cx + r * 1.3, r * 1.9, cz + r * 2.0) };
}

export function Scene3D() {
  const building = usePlan((s) => s.building);
  const levelId = usePlan((s) => s.levelId);
  const [frame] = useState(() => computeFrame(selectPlan(usePlan.getState())));
  return (
    <Canvas
      shadows="percentage"
      gl={{ localClippingEnabled: true, antialias: true }}
      camera={{ position: frame.camera.toArray(), fov: 45, near: 0.05, far: 500 }}
      onPointerMissed={(e) => e.type === 'click' && useUI.getState().select(null)}
    >
      <SceneContents building={building} levelId={levelId} initialTarget={frame.center} />
    </Canvas>
  );
}

const noSelect: Select = () => {};
const SLAB_T = 0.12;

function SceneContents({ building, levelId, initialTarget }: { building: Building; levelId: string; initialTarget: THREE.Vector3 }) {
  const selection = useUI((s) => s.selection);
  const select = useUI((s) => s.select);
  const cutWalls = useUI((s) => s.cutWalls);
  const fitToken = useUI((s) => s.fitToken);
  const showAllLevels = useUI((s) => s.showAllLevels);

  const active = building.levels.find((l) => l.id === levelId) ?? building.levels[0];
  const activeIndex = building.levels.indexOf(active);
  const visible = building.levels.filter((_, i) => showAllLevels || i <= activeIndex);

  useEffect(() => setWallCut(cutWalls), [cutWalls]);

  const frame = useMemo(() => computeFrame(building.levels[0].plan), [building.levels]);
  const [target] = useState(() => new THREE.Object3D());
  const [orbitTarget] = useState(() => initialTarget.toArray());

  return (
    <>
      <color attach="background" args={['#e9edf2']} />
      <fog attach="fog" args={['#e9edf2', frame.radius * 4, frame.radius * 9]} />
      <hemisphereLight args={['#ffffff', '#b8b0a2', 0.9]} />
      <ambientLight intensity={0.15} />
      <primitive object={target} position={frame.center.toArray()} />
      <directionalLight
        castShadow
        target={target}
        position={[frame.center.x + frame.radius * 0.8, frame.radius * 2.6, frame.center.z + frame.radius * 0.5]}
        intensity={2.2}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-frame.radius * 1.5}
        shadow-camera-right={frame.radius * 1.5}
        shadow-camera-top={frame.radius * 1.5}
        shadow-camera-bottom={-frame.radius * 1.5}
        shadow-camera-near={0.5}
        shadow-camera-far={frame.radius * 8}
      />

      <mesh rotation-x={-Math.PI / 2} position={[frame.center.x, -0.01, frame.center.z]} receiveShadow>
        <planeGeometry args={[frame.radius * 12, frame.radius * 12]} />
        <meshStandardMaterial color="#d5dbe2" roughness={1} />
      </mesh>

      {visible.map((l, i) => (
        <group key={l.id} position-y={l.elevation}>
          <LevelContents plan={l.plan} upper={i > 0} selection={l.id === active.id ? selection : null} select={l.id === active.id ? select : noSelect} />
        </group>
      ))}

      <OrbitControls makeDefault target={orbitTarget as [number, number, number]} maxPolarAngle={Math.PI / 2.05} enableDamping />
      <CameraFitter token={fitToken} frame={frame} />
    </>
  );
}

function LevelContents({ plan, upper, selection, select }: { plan: Plan; upper: boolean; selection: Selection; select: Select }) {
  const geoms = useMemo(() => computeWallGeometry(plan), [plan]);
  const rooms = useMemo(() => detectRooms(plan), [plan]);
  const openingsByWall = useMemo(() => {
    const m: Record<string, Opening[]> = {};
    for (const op of Object.values(plan.openings)) (m[op.wallId] ??= []).push(op);
    return m;
  }, [plan.openings]);
  return (
    <>
      {upper && rooms.map((r) => <Slab key={`slab-${r.id}`} polygon={r.polygon} />)}
      {rooms.map((r) => (
        <Floor key={r.id} room={r} selected={selection?.kind === 'room' && selection.id === r.id} select={select} />
      ))}
      {Object.values(geoms).map((g) => (
        <Wall3D key={g.id} g={g} openings={openingsByWall[g.id] ?? []} selected={selection?.kind === 'wall' && selection.id === g.id} select={select} />
      ))}
      {Object.values(plan.openings).map((op) => {
        const g = geoms[op.wallId];
        return g ? <Opening3D key={op.id} op={op} g={g} selected={selection?.kind === 'opening' && selection.id === op.id} select={select} /> : null;
      })}
      {Object.values(plan.furniture).map((f) => (
        <Furniture3D key={f.id} f={f} selected={selection?.kind === 'furniture' && selection.id === f.id} select={select} />
      ))}
    </>
  );
}

const slabMaterial = new THREE.MeshStandardMaterial({ color: '#cfcac2', roughness: 0.9 });

/** Laje de piso dos pavimentos superiores (espessura de referência no 3D de arquitetura). */
function Slab({ polygon }: { polygon: Vec2[] }) {
  const geo = useMemo(() => prismGeometry(polygon, -SLAB_T, -0.001), [polygon]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={slabMaterial} castShadow receiveShadow />;
}

function CameraFitter({ token, frame }: { token: number; frame: ReturnType<typeof computeFrame> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    if (token === 0 || !controls) return;
    camera.position.copy(frame.camera);
    controls.target.copy(frame.center);
    controls.update();
  }, [token]);
  return null;
}

function Wall3D({ g, openings, selected, select }: { g: WallGeom; openings: Opening[]; selected: boolean; select: Select }) {
  const geos = useMemo(() => wallPrisms(g, openings).map((p) => prismGeometry(p.polygon, p.bottom, p.top)), [g, openings]);
  useEffect(() => () => geos.forEach((x) => x.dispose()), [geos]);
  const mat = selected ? wallSelectedMaterial : wallMaterial;
  return (
    <group onClick={clickHandler(select, { kind: 'wall', id: g.id })}>
      {geos.map((geo, i) => (
        <mesh key={i} geometry={geo} material={mat} castShadow receiveShadow />
      ))}
    </group>
  );
}

function Floor({ room, selected, select }: { room: Room; selected: boolean; select: Select }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape(room.inner.map((p) => new THREE.Vector2(p.x, p.y)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    return g;
  }, [room.inner]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh
      geometry={geo}
      position-y={0.002}
      material={floorMaterial(room.floorColor, selected)}
      receiveShadow
      onClick={clickHandler(select, { kind: 'room', id: room.id })}
    />
  );
}

function Box({ size, position, material }: { size: [number, number, number]; position: [number, number, number]; material: THREE.Material }) {
  return <mesh geometry={unitBox} material={material} scale={size} position={position} castShadow receiveShadow />;
}

function Opening3D({ op, g, selected, select }: { op: Opening; g: WallGeom; selected: boolean; select: Select }) {
  const c = openingCenter(g, op);
  const t = g.thickness + 0.02;
  const w = op.width;
  const f = 0.05;
  const frame = selected ? openingSelectedMaterial : frameMaterial;
  const rot = -Math.atan2(g.dir.y, g.dir.x);
  const base = op.sill;
  const h = Math.min(op.height, g.height - op.sill);
  return (
    <group position={[c.x, 0, c.y]} rotation-y={rot} onClick={clickHandler(select, { kind: 'opening', id: op.id })}>
      <Box size={[f, h, t]} position={[-w / 2 + f / 2, base + h / 2, 0]} material={frame} />
      <Box size={[f, h, t]} position={[w / 2 - f / 2, base + h / 2, 0]} material={frame} />
      <Box size={[w, f, t]} position={[0, base + h - f / 2, 0]} material={frame} />
      {op.kind === 'door' ? (
        <>
          <Box size={[w - 2 * f, h - f, 0.04]} position={[0, (h - f) / 2, 0]} material={doorLeafMaterial} />
          <Box
            size={[0.12, 0.025, 0.1]}
            position={[(op.flip ? -1 : 1) * (w / 2 - f - 0.1), 1.0, 0]}
            material={handleMaterial}
          />
        </>
      ) : (
        <>
          <Box size={[w, f, t]} position={[0, base + f / 2, 0]} material={frame} />
          <Box size={[f * 0.6, h - 2 * f, 0.05]} position={[0, base + h / 2, 0]} material={frame} />
          <mesh geometry={unitBox} material={glassMaterial} scale={[w - 2 * f, h - 2 * f, 0.01]} position={[0, base + h / 2, 0]} />
          <Box size={[w + 0.08, 0.025, t + 0.06]} position={[0, base - 0.0125, 0]} material={frame} />
        </>
      )}
    </group>
  );
}

function Furniture3D({ f, selected, select }: { f: FurnitureItem; selected: boolean; select: Select }) {
  const item = CATALOG_BY_ID[f.catalogId];
  const parts = useMemo(() => (item ? item.parts(f.width, f.depth, f.height) : []), [item, f.width, f.depth, f.height]);
  if (!item) return null;
  return (
    <group position={[f.x, f.elevation, f.y]} rotation-y={-f.rotation} onClick={clickHandler(select, { kind: 'furniture', id: f.id })}>
      {parts.map((p, i) => (
        <mesh
          key={i}
          geometry={p.shape === 'box' ? unitBox : p.shape === 'cyl' ? unitCylinder : unitSphere}
          material={partMaterial(p.color, p.material, selected)}
          position={[p.x, p.y, p.z]}
          scale={[p.sx, p.sy, p.sz]}
          castShadow={p.material !== 'glass'}
          receiveShadow
        />
      ))}
      {item.light && <pointLight position={[0, item.light.y, 0]} color={item.light.color} intensity={item.light.intensity} distance={6} decay={2} />}
    </group>
  );
}
