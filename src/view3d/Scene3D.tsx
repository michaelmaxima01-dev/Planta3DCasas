import { siteSize } from '../model/site';
import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { CATALOG_BY_ID } from '../catalog/catalog';
import { type Room, detectRooms } from '../geometry/rooms';
import { type Vec2, centroid, pointInPolygon } from '../geometry/vec';
import { type WallGeom, computeWallGeometry, openingCenter, wallPrisms } from '../geometry/walls';
import { planBounds } from '../model/ops';
import type { Building, FurnitureItem, Opening, Plan, Selection } from '../model/types';
import { floorHoles, stairRect } from '../model/stairs';
import { type P3, ROOF_COLOR, roofGeometry } from '../roof/roof';
import { openingParts, prismGeometry } from './buildScene';
import { usePlan } from '../store/planStore';
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

function computeFrame(plan: Plan, height = 3) {
  const b = planBounds(plan) ?? { minX: 0, minY: 0, maxX: 10, maxY: 8 };
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minY + b.maxY) / 2;
  const r = Math.max(4, Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2);
  return { center: new THREE.Vector3(cx, 0, cz), radius: r, camera: new THREE.Vector3(cx + r * 1.4 + height * 0.4, r * 1.6 + height * 1.1, cz + r * 2.1 + height * 0.6) };
}

export function Scene3D() {
  const building = usePlan((s) => s.building);
  const levelId = usePlan((s) => s.levelId);
  const [frame] = useState(() => {
    const b = usePlan.getState().building;
    const top = b.levels[b.levels.length - 1];
    return computeFrame(b.levels[0].plan, top.elevation + top.height);
  });
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
const NO_HOLES: Vec2[][] = [];
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

  const frame = useMemo(() => {
    const top = building.levels[building.levels.length - 1];
    return computeFrame(building.levels[0].plan, top.elevation + top.height);
  }, [building.levels]);
  const showRoof = useUI((s) => s.showRoof);
  // laje de piso de cada pavimento superior = contorno dos cômodos do pavimento de baixo
  const slabPolys = useMemo(() => building.levels.map((l) => detectRooms(l.plan).map((r) => r.polygon)), [building.levels]);
  const holesByLevel = useMemo(() => building.levels.map((_, i) => floorHoles(building, i)), [building]);
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

      {building.site?.show && (() => {
        const { sx, sy } = siteSize(building.site);
        return (
          <mesh rotation-x={-Math.PI / 2} position={[building.site.x + sx / 2, 0.004, building.site.y + sy / 2]} receiveShadow>
            <planeGeometry args={[sx, sy]} />
            <meshStandardMaterial color="#a9c98a" roughness={1} />
          </mesh>
        );
      })()}

      {visible.map((l, i) => (
        <group key={l.id} position-y={l.elevation}>
          <LevelContents
            plan={l.plan}
            slabs={i > 0 ? slabPolys[i - 1] : []}
            stairs={holesByLevel[building.levels.indexOf(l)]}
            selection={l.id === active.id ? selection : null}
            select={l.id === active.id ? select : noSelect}
          />
        </group>
      ))}
      {showRoof && !cutWalls && visible.length === building.levels.length && <Roof building={building} />}

      <OrbitControls makeDefault target={orbitTarget as [number, number, number]} maxPolarAngle={Math.PI / 2.05} enableDamping />
      <CameraFitter token={fitToken} frame={frame} />
    </>
  );
}

function LevelContents({ plan, slabs, stairs, selection, select }: { plan: Plan; slabs: Vec2[][]; stairs: FurnitureItem[]; selection: Selection; select: Select }) {
  const holes = useMemo(() => stairs.map(stairRect), [stairs]);
  const rooms0 = useMemo(() => detectRooms(plan), [plan]);
  const slabHoles = useMemo(() => slabs.map((poly) => holes.filter((h) => pointInPolygon(centroid(h), poly))), [slabs, holes]);
  const roomHoles = useMemo(() => new Map(rooms0.map((r) => [r.id, holes.filter((h) => pointInPolygon(centroid(h), r.inner))])), [rooms0, holes]);
  const geoms = useMemo(() => computeWallGeometry(plan), [plan]);
  const rooms = rooms0;
  const openingsByWall = useMemo(() => {
    const m: Record<string, Opening[]> = {};
    for (const op of Object.values(plan.openings)) (m[op.wallId] ??= []).push(op);
    return m;
  }, [plan.openings]);
  return (
    <>
      {slabs.map((poly, i) => (
        <Slab key={`slab-${i}`} polygon={poly} holes={slabHoles[i]} />
      ))}
      {rooms.map((r) => (
        <Floor key={r.id} room={r} holes={roomHoles.get(r.id) ?? NO_HOLES} selected={selection?.kind === 'room' && selection.id === r.id} select={select} />
      ))}
      {stairs.map((f) => (
        <Railing key={`rail-${f.id}`} stair={f} />
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
function Slab({ polygon, holes }: { polygon: Vec2[]; holes: Vec2[][] }) {
  const geo = useMemo(() => prismGeometry(polygon, -SLAB_T, -0.001, holes), [polygon, holes]);
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

/** Guarda-corpo em volta do vão da escada (deixa livre o lado de chegada). */
function Railing({ stair }: { stair: FurnitureItem }) {
  const r = stairRect(stair);
  const edges: [Vec2, Vec2][] = [
    [r[1], r[2]],
    [r[2], r[3]],
    [r[3], r[0]],
  ];
  return (
    <group>
      {edges.map(([a, b], i) => {
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const rot = -Math.atan2(b.y - a.y, b.x - a.x);
        const c: [number, number] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
        return (
          <group key={i} position={[c[0], 0, c[1]]} rotation-y={rot}>
            <mesh geometry={unitBox} material={handleMaterial} scale={[L, 0.04, 0.05]} position={[0, 1.0, 0]} />
            <mesh geometry={unitBox} material={glassMaterial} scale={[L, 0.9, 0.012]} position={[0, 0.52, 0]} />
          </group>
        );
      })}
    </group>
  );
}

/** Telhado: planos da cobertura e oitões. */
function Roof({ building }: { building: Building }) {
  const geo = useMemo(() => {
    const g = roofGeometry(building);
    if (!g) return null;
    const toGeo = (faces: P3[][]) => {
      const pos: number[] = [];
      for (const f of faces) for (let k = 1; k + 1 < f.length; k++) for (const p of [f[0], f[k], f[k + 1]]) pos.push(p[0], p[2], p[1]);
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      bg.computeVertexNormals();
      return bg;
    };
    return { faces: toGeo(g.faces), gables: toGeo(g.gables) };
  }, [building]);
  useEffect(() => () => {
    geo?.faces.dispose();
    geo?.gables.dispose();
  }, [geo]);
  const material = (building.roof?.type ?? 'duas_aguas') === 'plano' ? 'laje' : building.structure.settings.roof;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: ROOF_COLOR[material], roughness: 0.75, side: THREE.DoubleSide }), [material]);
  const gableMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1ede6', roughness: 0.9, side: THREE.DoubleSide }), []);
  if (!geo) return null;
  return (
    <group>
      <mesh geometry={geo.faces} material={mat} castShadow receiveShadow />
      <mesh geometry={geo.gables} material={gableMat} castShadow receiveShadow />
    </group>
  );
}

function Floor({ room, holes = [], selected, select }: { room: Room; holes?: Vec2[][]; selected: boolean; select: Select }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape(room.inner.map((p) => new THREE.Vector2(p.x, p.y)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    return g;
  }, [room.inner, holes]);
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
  const frame = selected ? openingSelectedMaterial : frameMaterial;
  const rot = -Math.atan2(g.dir.y, g.dir.x);
  return (
    <group position={[c.x, 0, c.y]} rotation-y={rot} onClick={clickHandler(select, { kind: 'opening', id: op.id })}>
      {openingParts(op, g).map((p, i) =>
        p.mat === 'glass' ? (
          <mesh key={i} geometry={unitBox} material={glassMaterial} scale={p.size} position={p.pos} />
        ) : (
          <Box key={i} size={p.size} position={p.pos} material={p.mat === 'frame' ? frame : p.mat === 'leaf' ? doorLeafMaterial : handleMaterial} />
        ),
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
          rotation-y={-(p.ry ?? 0)}
          scale={[p.sx, p.sy, p.sz]}
          castShadow={p.material !== 'glass'}
          receiveShadow
        />
      ))}
      {item.light && <pointLight position={[0, item.light.y, 0]} color={item.light.color} intensity={item.light.intensity} distance={6} decay={2} />}
    </group>
  );
}
