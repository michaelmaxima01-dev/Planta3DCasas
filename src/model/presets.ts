/**
 * Planos prontos de cômodos (medidas usuais no Brasil). Um clique na planta cria as 4 paredes,
 * dá nome/piso ao cômodo e já coloca os objetos.
 * Garagem: vaga de referência 2,50 × 5,00 m; portão mínimo usual 2,50 m (confira o Código de Obras local).
 */
import { detectRooms } from '../geometry/rooms';
import { pointInPolygon, type Vec2 } from '../geometry/vec';
import { ROOM_TYPES, furnishRoom } from './furnish';
import { addFurniture, addOpening, addWall, setRoomLabel } from './ops';
import { styleDef } from './openings';
import type { Plan } from './types';

export interface PresetItem {
  id: string;
  /** Posição relativa ao centro do cômodo (m). */
  x: number;
  y: number;
  rot?: number;
}

export interface RoomPreset {
  key: string;
  group: string;
  name: string;
  /** Medidas externas (eixo das paredes), em metros. */
  w: number;
  h: number;
  /** Tipo de cômodo (nome, cor do piso e mobília automática). */
  type: string;
  items?: PresetItem[];
  /** Portão na parede da frente (y máximo). */
  gate?: 'portao_basculante' | 'portao_correr';
}

const car = (x: number, y: number, id = 'car'): PresetItem[] => [
  { id: 'parking_space', x, y },
  { id, x, y: y + 0.1 },
];

export const ROOM_PRESETS: RoomPreset[] = [
  { key: 'gar1', group: 'Garagem', name: 'Garagem 1 vaga (3,00 × 5,50)', w: 3.0, h: 5.5, type: 'garagem', gate: 'portao_basculante', items: car(0, 0) },
  { key: 'gar1b', group: 'Garagem', name: '1 vaga + bancada (3,80 × 5,50)', w: 3.8, h: 5.5, type: 'garagem', gate: 'portao_basculante', items: [...car(-0.5, 0), { id: 'workbench', x: 1.45, y: -1.8, rot: -Math.PI / 2 }, { id: 'steel_shelf', x: 1.55, y: 0.6, rot: -Math.PI / 2 }] },
  { key: 'gar2', group: 'Garagem', name: '2 vagas lado a lado (5,60 × 5,50)', w: 5.6, h: 5.5, type: 'garagem', gate: 'portao_correr', items: [...car(-1.3, 0), ...car(1.3, 0, 'car_suv')] },
  { key: 'gar2f', group: 'Garagem', name: '2 vagas em fila (3,00 × 10,50)', w: 3.0, h: 10.5, type: 'garagem', gate: 'portao_basculante', items: [...car(0, -2.5), ...car(0, 2.6, 'car_hatch')] },
  { key: 'gar3', group: 'Garagem', name: '3 vagas (8,20 × 5,50)', w: 8.2, h: 5.5, type: 'garagem', gate: 'portao_correr', items: [...car(-2.6, 0), ...car(0, 0, 'car_suv'), ...car(2.6, 0, 'car_hatch')] },
  { key: 'gar_moto', group: 'Garagem', name: '1 vaga + motos e bikes (4,20 × 5,50)', w: 4.2, h: 5.5, type: 'garagem', gate: 'portao_basculante', items: [...car(-0.7, 0), { id: 'motorcycle', x: 1.4, y: 0.8 }, { id: 'bicycle', x: 1.55, y: -1.6 }] },
  { key: 'quarto', group: 'Cômodos', name: 'Quarto de solteiro (3,00 × 3,00)', w: 3.0, h: 3.0, type: 'quarto' },
  { key: 'suite', group: 'Cômodos', name: 'Quarto de casal (3,50 × 4,00)', w: 3.5, h: 4.0, type: 'suite' },
  { key: 'banheiro', group: 'Cômodos', name: 'Banheiro (1,60 × 2,50)', w: 1.6, h: 2.5, type: 'banheiro' },
  { key: 'lavabo', group: 'Cômodos', name: 'Lavabo (1,20 × 1,60)', w: 1.2, h: 1.6, type: 'lavabo' },
  { key: 'sala', group: 'Cômodos', name: 'Sala de estar (4,00 × 5,00)', w: 4.0, h: 5.0, type: 'sala' },
  { key: 'cozinha', group: 'Cômodos', name: 'Cozinha (3,00 × 3,50)', w: 3.0, h: 3.5, type: 'cozinha' },
  { key: 'coz_amer', group: 'Cômodos', name: 'Cozinha americana c/ balcão (4,00 × 4,00)', w: 4.0, h: 4.0, type: 'cozinha_americana' },
  { key: 'lavand', group: 'Cômodos', name: 'Lavanderia (1,80 × 2,50)', w: 1.8, h: 2.5, type: 'lavanderia' },
  { key: 'escrit', group: 'Cômodos', name: 'Escritório (2,60 × 3,00)', w: 2.6, h: 3.0, type: 'escritorio' },
  { key: 'gourmet', group: 'Lazer', name: 'Área gourmet (5,00 × 4,00)', w: 5.0, h: 4.0, type: 'gourmet' },
  { key: 'jd_inv', group: 'Lazer', name: 'Jardim de inverno (2,50 × 2,50)', w: 2.5, h: 2.5, type: 'jardim_inverno' },
];

/** Cria o cômodo do plano pronto com o canto superior esquerdo em p. Retorna quantos objetos foram colocados. */
export function applyPreset(plan: Plan, preset: RoomPreset, p: Vec2, wall: { thickness: number; height: number }): number {
  const c = [p, { x: p.x + preset.w, y: p.y }, { x: p.x + preset.w, y: p.y + preset.h }, { x: p.x, y: p.y + preset.h }];
  for (let i = 0; i < 4; i++) addWall(plan, c[i], c[(i + 1) % 4], wall);
  const center = { x: p.x + preset.w / 2, y: p.y + preset.h / 2 };
  const type = ROOM_TYPES.find((t) => t.key === preset.type);
  let room = detectRooms(plan).find((r) => pointInPolygon(center, r.polygon));
  if (room && type) {
    setRoomLabel(plan, room.labelId, room.center, { name: type.name, floorColor: type.color }, { name: room.name, floorColor: room.floorColor });
    room = detectRooms(plan).find((r) => pointInPolygon(center, r.polygon)) ?? room;
  }
  if (preset.gate) {
    // parede da frente: a que liga os cantos de baixo
    const wall = Object.values(plan.walls).find((w) => {
      const a = plan.nodes[w.a];
      const b = plan.nodes[w.b];
      return Math.abs(a.y - c[2].y) < 1e-3 && Math.abs(b.y - c[2].y) < 1e-3 && Math.min(a.x, b.x) <= c[3].x + 1e-3 && Math.max(a.x, b.x) >= c[2].x - 1e-3;
    });
    if (wall) {
      const a = plan.nodes[wall.a];
      const st = styleDef(preset.gate);
      const width = Math.min(preset.w - 0.4, preset.gate === 'portao_correr' ? Math.max(st.width, preset.w * 0.7) : st.width);
      addOpening(plan, wall.id, 'door', Math.abs(center.x - a.x), { width, height: st.height, sill: 0, style: st.key });
    }
  }
  let placed = 0;
  if (preset.items) {
    for (const it of preset.items) if (addFurniture(plan, it.id, { x: center.x + it.x, y: center.y + it.y }, it.rot ?? 0)) placed++;
  } else if (room && type) {
    placed = furnishRoom(plan, room, type.key).placed;
  }
  return placed;
}
