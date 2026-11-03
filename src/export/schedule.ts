/**
 * Levantamento do projeto para relatórios: cômodos, esquadrias numeradas (P1, J1…),
 * móveis por cômodo, áreas de piso e de parede.
 */
import { CATALOG_BY_ID } from '../catalog/catalog';
import { type Room, detectRooms } from '../geometry/rooms';
import { type Vec2, add, dist, mul, pointInPolygon } from '../geometry/vec';
import { type WallGeom, computeWallGeometry, openingCenter } from '../geometry/walls';
import { finishName } from '../model/finishes';
import { wallBetween } from '../model/ops';
import type { FurnitureItem, Opening, Plan } from '../model/types';

export interface OpeningInfo {
  op: Opening;
  tag: string;
  center: Vec2;
  /** ids dos cômodos de cada lado (0, 1 ou 2). */
  rooms: string[];
  /** true quando um dos lados é a área externa. */
  exterior: boolean;
}

export interface RoomEdge {
  a: Vec2;
  b: Vec2;
  length: number;
  height: number;
}

export interface RoomInfo {
  room: Room;
  finish: string;
  edges: RoomEdge[];
  ceilingHeight: number;
  /** Área de paredes descontando portas e janelas (para orçar pintura/revestimento). */
  netWallArea: number;
  openings: OpeningInfo[];
  furniture: FurnitureItem[];
}

export interface FurnitureRow {
  f: FurnitureItem;
  name: string;
  roomName: string;
}

export interface ProjectSchedule {
  geoms: Record<string, WallGeom>;
  rooms: RoomInfo[];
  openings: OpeningInfo[];
  furniture: FurnitureRow[];
  totalArea: number;
  builtArea: number;
}

/** Junta lados alinhados (parede dividida por uma junção em T) numa medida só. */
function mergeCollinear(edges: RoomEdge[]) {
  const dir = (e: RoomEdge) => ({ x: (e.b.x - e.a.x) / e.length, y: (e.b.y - e.a.y) / e.length });
  let changed = true;
  while (changed && edges.length > 3) {
    changed = false;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const n = edges[(i + 1) % edges.length];
      const d1 = dir(e);
      const d2 = dir(n);
      if (d1.x * d2.x + d1.y * d2.y > 0.9999 && Math.abs(e.height - n.height) < 1e-6) {
        edges[i] = { a: e.a, b: n.b, length: dist(e.a, n.b), height: e.height };
        edges.splice((i + 1) % edges.length, 1);
        changed = true;
        break;
      }
    }
  }
}

export function furnitureName(f: FurnitureItem): string {
  return CATALOG_BY_ID[f.catalogId]?.name ?? f.catalogId;
}

export function buildSchedule(plan: Plan): ProjectSchedule {
  const geoms = computeWallGeometry(plan);
  const rooms = detectRooms(plan);

  // esquadrias numeradas de cima para baixo, da esquerda para a direita
  const placed = Object.values(plan.openings)
    .filter((op) => geoms[op.wallId])
    .map((op) => ({ op, center: openingCenter(geoms[op.wallId], op) }))
    .sort((p, q) => Math.round(p.center.y * 100) - Math.round(q.center.y * 100) || p.center.x - q.center.x);
  let doors = 0;
  let windows = 0;
  const openings: OpeningInfo[] = placed.map(({ op, center }) => {
    const g = geoms[op.wallId];
    const sides = [1, -1].map((s) => add(center, mul(g.normal, s * (g.thickness / 2 + 0.15))));
    const found = sides.map((p) => rooms.find((r) => pointInPolygon(p, r.polygon))?.id);
    return {
      op,
      center,
      tag: op.kind === 'door' ? `P${++doors}` : `J${++windows}`,
      rooms: found.filter((x): x is string => !!x),
      exterior: found.some((x) => !x),
    };
  });

  const furnitureRows: FurnitureRow[] = [];
  const roomOf = (p: Vec2) => rooms.find((r) => pointInPolygon(p, r.inner) || pointInPolygon(p, r.polygon));
  const furnitureByRoom = new Map<string, FurnitureItem[]>();
  for (const f of Object.values(plan.furniture)) {
    const r = roomOf(f);
    if (r) furnitureByRoom.set(r.id, [...(furnitureByRoom.get(r.id) ?? []), f]);
    furnitureRows.push({ f, name: furnitureName(f), roomName: r?.name ?? 'Área externa' });
  }
  furnitureRows.sort((a, b) => a.roomName.localeCompare(b.roomName, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));

  const infos: RoomInfo[] = rooms.map((room) => {
    const n = room.inner.length;
    const edges: RoomEdge[] = room.inner.map((a, i) => {
      const b = room.inner[(i + 1) % n];
      const w = wallBetween(plan, room.nodes[i], room.nodes[(i + 1) % room.nodes.length]);
      return { a, b, length: dist(a, b), height: w?.height ?? 2.8 };
    });
    mergeCollinear(edges);
    const ceilingHeight = edges.length ? Math.max(...edges.map((e) => e.height)) : 2.8;
    const roomOpenings = openings.filter((o) => o.rooms.includes(room.id));
    const gross = edges.reduce((s, e) => s + e.length * e.height, 0);
    const holes = roomOpenings.reduce((s, o) => s + o.op.width * o.op.height, 0);
    return {
      room,
      finish: finishName(room.floorColor),
      edges,
      ceilingHeight,
      netWallArea: Math.max(0, gross - holes),
      openings: roomOpenings,
      furniture: (furnitureByRoom.get(room.id) ?? []).sort((a, b) => furnitureName(a).localeCompare(furnitureName(b), 'pt-BR')),
    };
  });
  infos.sort((a, b) => a.room.center.y - b.room.center.y || a.room.center.x - b.room.center.x);

  // área construída aproximada: área útil + área ocupada pelas paredes
  const wallArea = Object.values(geoms).reduce((s, g) => s + g.length * g.thickness, 0);
  const totalArea = infos.reduce((s, r) => s + r.room.area, 0);

  return { geoms, rooms: infos, openings, furniture: furnitureRows, totalArea, builtArea: totalArea + wallArea };
}
