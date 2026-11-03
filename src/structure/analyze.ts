/**
 * Pré-dimensionamento e verificação da estrutura (concreto armado + alvenaria de vedação).
 *
 * Tramitação das cargas, de cima para baixo:
 *   laje → vigas do contorno → pilares → pilar de baixo / viga de transição → … →
 *   pilar do térreo + baldrame → fundação → solo
 *
 * Critérios (simplificados, de pré-dimensionamento):
 *   cargas NBR 6120 (valores editáveis), combinação ELU γf = 1,4 (NBR 8681),
 *   lajes por relação vão/altura, vigas biapoiadas (flexão e cisalhamento, NBR 6118),
 *   pilares por área de influência com coeficientes α (1,3 / 1,5 / 1,8) e γn (NBR 6118 13.2.3),
 *   sapatas rígidas por tensão admissível, radier e estacas por capacidade.
 */
import { detectRooms } from '../geometry/rooms';
import { type Vec2, centroid, cross, dist, pointInPolygon, signedArea, sub } from '../geometry/vec';
import type { Building, Level, Plan } from '../model/types';
import { collinearOverlap, onSegment } from './geometry';
import { isStair, stairRect } from '../model/stairs';
import { type RoofResult, analyzeRoof } from '../roof/roof';
import { BALDRAME, type Beam, type Pillar, ROOFS, type RoofKind, type StructureSettings } from './types';

export type Status = 'ok' | 'warn' | 'fail';
export type ElementKind = 'pillar' | 'beam' | 'slab' | 'footing';

export interface Issue {
  status: Status;
  text: string;
  ref?: { kind: ElementKind; id: string; levelId: string };
}

export interface LoadItem {
  label: string;
  value: number;
}

export interface SlabResult {
  id: string;
  code: string;
  levelId: string;
  name: string;
  polygon: Vec2[];
  area: number;
  /** Área de aberturas (vão de escada). */
  holeArea: number;
  holes: Vec2[][];
  lx: number;
  ly: number;
  system: string;
  thickness: number;
  loads: LoadItem[];
  q: number;
  total: number;
  status: Status;
  notes: string[];
}

export interface BeamResult {
  id: string;
  code: string;
  levelId: string;
  a: Vec2;
  b: Vec2;
  L: number;
  bw: number;
  h: number;
  loads: LoadItem[];
  q: number;
  points: { label: string; P: number; a: number }[];
  Ra: number;
  Rb: number;
  Mk: number;
  Vk: number;
  As: number;
  bars: string;
  stirrups: string;
  hRecommended: number;
  status: Status;
  notes: string[];
}

export interface PillarResult {
  id: string;
  code: string;
  levelId: string;
  p: Vec2;
  b: number;
  h: number;
  rotation: number;
  loads: LoadItem[];
  N: number;
  position: 'interno' | 'extremidade' | 'canto';
  alpha: number;
  gammaN: number;
  Nd: number;
  AcReq: number;
  Ac: number;
  As: number;
  bars: string;
  lambda: number;
  suggestion?: { b: number; h: number };
  status: Status;
  notes: string[];
}

export interface FootingResult {
  id: string;
  code: string;
  pillarId: string;
  p: Vec2;
  rotation: number;
  N: number;
  kind: 'sapata' | 'estaca' | 'radier';
  B: number;
  L: number;
  h: number;
  piles: number;
  status: Status;
  notes: string[];
}

export interface StructureResult {
  slabs: SlabResult[];
  beams: BeamResult[];
  pillars: PillarResult[];
  footings: FootingResult[];
  issues: Issue[];
  roof: RoofResult | null;
  totals: {
    weight: number;
    footprint: number;
    perArea: number;
    radierStress?: number;
    levels: { levelId: string; name: string; weight: number }[];
  };
}

const GAMMA_C = 25; // kN/m³ concreto armado
const GAMMA_F = 1.4;
const ceil5 = (cm: number) => Math.ceil(cm / 5) * 5;
const r2 = (v: number) => (Math.round(v * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const TRELICADA = [
  { name: 'Treliçada H8+4', h: 12, weight: 1.7, max: 4.0 },
  { name: 'Treliçada H12+4', h: 16, weight: 2.1, max: 5.0 },
  { name: 'Treliçada H16+4', h: 20, weight: 2.5, max: 6.0 },
  { name: 'Treliçada H20+5', h: 25, weight: 3.0, max: 7.0 },
];

const BAR_SETS = [
  { n: 2, d: 8 },
  { n: 2, d: 10 },
  { n: 3, d: 10 },
  { n: 2, d: 12.5 },
  { n: 3, d: 12.5 },
  { n: 4, d: 12.5 },
  { n: 3, d: 16 },
  { n: 4, d: 16 },
  { n: 5, d: 16 },
  { n: 4, d: 20 },
  { n: 5, d: 20 },
];
const PILLAR_BARS = [
  { n: 4, d: 10 },
  { n: 4, d: 12.5 },
  { n: 6, d: 12.5 },
  { n: 4, d: 16 },
  { n: 6, d: 16 },
  { n: 8, d: 16 },
  { n: 8, d: 20 },
  { n: 12, d: 20 },
];
export const PILLAR_SECTIONS = [
  [14, 30],
  [14, 40],
  [19, 30],
  [19, 40],
  [20, 50],
  [25, 50],
  [30, 50],
  [30, 60],
  [40, 60],
];
const barArea = (d: number) => (Math.PI * (d / 10) ** 2) / 4;
const fmtBars = (n: number, d: number) => `${n} Ø${String(d).replace('.', ',')}`;

function pickBars(As: number, sets = BAR_SETS) {
  return sets.find((s) => s.n * barArea(s.d) >= As) ?? null;
}

const worst = (a: Status, b: Status): Status => (a === 'fail' || b === 'fail' ? 'fail' : a === 'warn' || b === 'warn' ? 'warn' : 'ok');

export function wallLoadPerMeter(s: StructureSettings, plan: Plan, wallId: string): number {
  const w = plan.walls[wallId];
  const L = dist(plan.nodes[w.a], plan.nodes[w.b]);
  if (L < 1e-6) return 0;
  const perArea = s.wallUnitWeight * w.thickness + s.wallFinishLoad;
  const holes = Object.values(plan.openings)
    .filter((o) => o.wallId === wallId)
    .reduce((acc, o) => acc + o.width * Math.min(o.height, w.height - o.sill), 0);
  return (perArea * Math.max(0, L * w.height - holes)) / L;
}

/** Resolve uma viga biapoiada com carga distribuída q e cargas concentradas. */
function solveBeam(L: number, q: number, points: { P: number; a: number }[]) {
  let Ra = (q * L) / 2;
  let Rb = (q * L) / 2;
  for (const { P, a } of points) {
    Ra += (P * (L - a)) / L;
    Rb += (P * a) / L;
  }
  let Mk = 0;
  for (let i = 0; i <= 100; i++) {
    const x = (L * i) / 100;
    let M = Ra * x - (q * x * x) / 2;
    for (const { P, a } of points) if (x > a) M -= P * (x - a);
    Mk = Math.max(Mk, M);
  }
  return { Ra, Rb, Mk, Vk: Math.max(Ra, Rb) };
}

export function analyzeStructure(building: Building): StructureResult {
  const s = building.structure.settings;
  const fcd = s.fck / GAMMA_F / 10; // kN/cm²
  const fyd = s.fyk / 1.15 / 10; // kN/cm²
  const levels = building.levels;
  const roofMaterial: RoofKind = (building.roof?.type ?? 'duas_aguas') === 'plano' ? 'laje' : s.roof;
  const issues: Issue[] = [];
  const allPillars = Object.values(building.structure.pillars);
  const allBeams = Object.values(building.structure.beams);
  const pillarById = new Map(allPillars.map((p) => [p.id, p]));

  // numeração dos pilares por eixo (mesmo número em todos os pavimentos)
  const axes: Vec2[] = [];
  for (const p of allPillars) if (!axes.some((a) => dist(a, p) < 0.05)) axes.push({ x: p.x, y: p.y });
  axes.sort((a, b) => Math.round(a.y * 20) - Math.round(b.y * 20) || a.x - b.x);
  const pillarCode = (p: Pillar) => `P${axes.findIndex((a) => dist(a, p) < 0.05) + 1}`;

  const levelIndex = new Map(levels.map((l, i) => [l.id, i]));
  const pillarsOf = (levelId: string) => allPillars.filter((p) => p.levelId === levelId);
  const beamsOf = (levelId: string) =>
    allBeams.filter((v) => v.levelId === levelId && pillarById.has(v.a) && pillarById.has(v.b) && v.a !== v.b);

  const slabs: SlabResult[] = [];
  const beams: BeamResult[] = [];
  const pillars: PillarResult[] = [];
  const pillarN = new Map<string, number>(); // carga na base de cada pilar (kN, característica)

  const beamGeom = (v: Beam) => {
    const A = pillarById.get(v.a)!;
    const B = pillarById.get(v.b)!;
    return { a: { x: A.x, y: A.y }, b: { x: B.x, y: B.y }, L: dist(A, B) };
  };

  const designBeam = (v: Beam, code: string, levelId: string, loads: LoadItem[], points: { label: string; P: number; a: number }[]): BeamResult => {
    const g = beamGeom(v);
    const q = loads.reduce((acc, l) => acc + l.value, 0);
    const { Ra, Rb, Mk, Vk } = solveBeam(g.L, q, points);
    const notes: string[] = [];
    let status: Status = 'ok';
    const d = v.h - 4;
    const Md = GAMMA_F * Mk * 100; // kN·cm
    const Kmd = Md / (v.bw * d * d * fcd);
    let As = 0;
    let hReq = v.h;
    if (Kmd > 0.251) {
      status = 'fail';
      hReq = ceil5(Math.sqrt(Md / (0.251 * v.bw * fcd)) + 4);
      notes.push(`Seção insuficiente à flexão (KMD = ${r2(Kmd)} > 0,251). Altura necessária ≈ ${hReq} cm.`);
    } else {
      const a = 0.272;
      const bq = 0.68 * d;
      const x = (bq - Math.sqrt(bq * bq - (4 * a * Md) / (v.bw * fcd))) / (2 * a);
      As = Md / (fyd * (d - 0.4 * x));
    }
    As = Math.max(As, 0.0015 * v.bw * v.h);
    const bars = pickBars(As);
    const Vd = GAMMA_F * Vk;
    const VRd2 = 0.27 * (1 - s.fck / 250) * fcd * v.bw * d;
    const fctd = (0.21 * Math.pow(s.fck, 2 / 3)) / GAMMA_F / 10;
    const Vc = 0.6 * fctd * v.bw * d;
    const aswMin = ((0.2 * 0.3 * Math.pow(s.fck, 2 / 3)) / s.fyk) * v.bw * 100; // cm²/m
    const asw = Math.max(aswMin, ((Vd - Vc) / (0.9 * d * fyd)) * 100);
    const spacing = Math.max(7, Math.min(Math.floor((2 * barArea(5) * 100) / asw), Math.floor(0.6 * d), 30));
    if (Vd > VRd2) {
      status = 'fail';
      notes.push(`Esmagamento da biela: Vd = ${r2(Vd)} kN > VRd2 = ${r2(VRd2)} kN. Aumentar a seção.`);
    }
    const hRec = Math.max(30, ceil5((g.L * 100) / 10));
    if (v.h < (g.L * 100) / 12) {
      status = worst(status, 'warn');
      notes.push(`Altura abaixo de L/12 (${Math.ceil((g.L * 100) / 12)} cm): verificar flecha. Recomendado ${hRec} cm.`);
    }
    if (g.L > 6) {
      status = worst(status, 'warn');
      notes.push(`Vão de ${r2(g.L)} m é grande para residência: considerar pilar intermediário.`);
    }
    if (!bars) {
      status = 'fail';
      notes.push('Armadura acima das bitolas usuais: aumentar a seção.');
    }
    return {
      id: v.id,
      code,
      levelId,
      a: g.a,
      b: g.b,
      L: g.L,
      bw: v.bw,
      h: v.h,
      loads,
      q,
      points,
      Ra,
      Rb,
      Mk,
      Vk,
      As,
      bars: bars ? fmtBars(bars.n, bars.d) : '-',
      stirrups: `Ø5 c/ ${spacing} cm`,
      hRecommended: Math.max(hRec, hReq),
      status,
      notes,
    };
  };

  // ---------- de cima para baixo ----------
  for (let i = levels.length - 1; i >= 0; i--) {
    const level = levels[i];
    const plan = level.plan;
    const above: Level | undefined = levels[i + 1];
    const isTop = !above;
    const rooms = detectRooms(plan);
    const levelBeams = beamsOf(level.id).map((v) => ({ v, ...beamGeom(v) }));
    const beamLoads = new Map<string, LoadItem[]>(levelBeams.map((x) => [x.v.id, [{ label: 'Peso próprio', value: (x.v.bw * x.v.h * GAMMA_C) / 1e4 }]]));
    const beamPoints = new Map<string, { label: string; P: number; a: number }[]>();
    const addBeamLoad = (id: string, label: string, value: number) => {
      const arr = beamLoads.get(id)!;
      const ex = arr.find((l) => l.label === label);
      if (ex) ex.value += value;
      else arr.push({ label, value });
    };

    // paredes do pavimento de cima: sobre vigas ou sobre a laje?
    const extraOnSlab = new Map<number, { W: number; label: string }[]>();
    if (above) {
      for (const w of Object.values(above.plan.walls)) {
        const A = above.plan.nodes[w.a];
        const B = above.plan.nodes[w.b];
        const Lw = dist(A, B);
        if (Lw < 0.05) continue;
        const qw = wallLoadPerMeter(s, above.plan, w.id);
        let covered = 0;
        for (const x of levelBeams) {
          const ov = collinearOverlap(x.a, x.b, A, B);
          if (ov > 0) {
            addBeamLoad(x.v.id, `Paredes do ${above.name}`, (qw * ov) / x.L);
            covered += ov;
          }
        }
        const rest = Lw - covered;
        if (rest > 0.1) {
          const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
          const ri = rooms.findIndex((r) => pointInPolygon(mid, r.polygon));
          if (ri >= 0) {
            extraOnSlab.set(ri, [...(extraOnSlab.get(ri) ?? []), { W: qw * rest, label: `Parede do ${above.name}` }]);
          } else {
            issues.push({ status: 'fail', text: `Parede do ${above.name} (${r2(rest)} m) sem apoio: não há viga nem laje embaixo.` });
          }
        }
      }
    }

    // lajes no topo deste pavimento
    rooms.forEach((r, ri) => {
      const xs = r.polygon.map((p) => p.x);
      const ys = r.polygon.map((p) => p.y);
      const dx = Math.max(...xs) - Math.min(...xs);
      const dy = Math.max(...ys) - Math.min(...ys);
      const lx = Math.min(dx, dy);
      const ly = Math.max(dx, dy);
      const area = Math.abs(signedArea(r.polygon));
      const notes: string[] = [];
      let status: Status = 'ok';
      let system: string;
      let thickness: number;
      let self: number;
      if (s.slab === 'macica') {
        thickness = Math.max(isTop ? 7 : 8, 10, Math.ceil((lx * 100) / 40));
        system = 'Maciça';
        self = (thickness / 100) * GAMMA_C;
        if (lx > 6) {
          status = 'warn';
          notes.push('Vão acima de 6 m para laje maciça: considerar viga intermediária.');
        }
      } else {
        const t = TRELICADA.find((x) => x.max >= lx);
        if (!t) {
          status = 'fail';
          notes.push(`Vão de ${r2(lx)} m acima do limite das treliçadas usuais (7 m): dividir com viga.`);
        }
        const tt = t ?? TRELICADA[TRELICADA.length - 1];
        thickness = tt.h;
        system = tt.name;
        self = tt.weight;
        notes.push('Peso e vão máximo da treliçada são valores típicos: confirmar na tabela do fabricante.');
      }
      const loads: LoadItem[] = [
        { label: 'Peso próprio', value: self },
        { label: 'Contrapiso e revestimento', value: s.finishLoad },
      ];
      // vão de escada (escada deste pavimento chega no pavimento de cima atravessando esta laje)
      const stairs = above ? Object.values(plan.furniture).filter((f) => isStair(f) && pointInPolygon(f, r.polygon)) : [];
      const holeArea = Math.min(area * 0.6, stairs.reduce((acc, f) => acc + f.width * f.depth, 0));
      const effArea = area - holeArea;
      if (holeArea > 0) notes.push(`Abertura para escada: ${r2(holeArea)} m² (laje calculada com ${r2(effArea)} m²; bordas do vão precisam de reforço).`);
      if (isTop) {
        const roof = ROOFS.find((x) => x.key === roofMaterial)!;
        loads.push({ label: roof.name, value: roof.load }, { label: 'Sobrecarga de cobertura', value: s.roofLiveLoad });
      } else {
        loads.push({ label: 'Sobrecarga de uso (NBR 6120)', value: s.liveLoad });
      }
      if (holeArea > 0) {
        // escada de concreto ≈ 5 kN/m² + sobrecarga 2,5 kN/m² (NBR 6120), metade apoiada nesta laje
        const Ws = holeArea * (5 + 2.5) * 0.5;
        loads.push({ label: 'Escada (metade do lance)', value: Ws / effArea });
      }
      for (const e of extraOnSlab.get(ri) ?? []) {
        loads.push({ label: `${e.label} (sobre a laje)`, value: e.W / effArea });
        status = worst(status, 'warn');
        notes.push(`${e.label} apoiada direto na laje (${r2(e.W)} kN): recomenda-se viga sob a parede.`);
      }
      const q = loads.reduce((acc, l) => acc + l.value, 0);
      const code = `L${ri + 1}`;

      // reações nas bordas: área de influência (triângulo borda–centro)
      const c = centroid(r.polygon);
      const n = r.polygon.length;
      let unsupported = 0;
      for (let k = 0; k < n; k++) {
        const a = r.polygon[k];
        const b = r.polygon[(k + 1) % n];
        const trib = Math.abs(cross(sub(a, c), sub(b, c))) / 2;
        const F = trib * q * (effArea / area);
        const Le = dist(a, b);
        let covered = 0;
        for (const x of levelBeams) {
          const ov = collinearOverlap(x.a, x.b, a, b);
          if (ov > 0) {
            addBeamLoad(x.v.id, `Laje ${code}`, (F * (ov / Le)) / x.L);
            covered += ov;
          }
        }
        if (covered < Le - 0.1) unsupported += F * (1 - covered / Le);
      }
      if (unsupported > 0.5) {
        status = worst(status, 'warn');
        notes.push(`${r2(unsupported)} kN da laje descarregam em alvenaria sem viga.`);
      }
      slabs.push({ id: `${level.id}:${r.id}`, code, levelId: level.id, name: r.name, polygon: r.polygon, area, holeArea, holes: stairs.map(stairRect), lx, ly, system, thickness, loads, q, total: q * effArea, status, notes });
    });

    // pilares do pavimento de cima sem pilar embaixo → carga concentrada em viga (transição)
    if (above) {
      for (const pu of pillarsOf(above.id)) {
        if (pillarsOf(level.id).some((p) => dist(p, pu) < 0.05)) continue;
        const N = pillarN.get(pu.id) ?? 0;
        const host = levelBeams.find((x) => {
          const o = onSegment(pu, x.a, x.b);
          return o.dist < 0.12 && o.t > 0.02 && o.t < 0.98;
        });
        if (host) {
          const a = onSegment(pu, host.a, host.b).t * host.L;
          beamPoints.set(host.v.id, [...(beamPoints.get(host.v.id) ?? []), { label: `${pillarCode(pu)} (${above.name}) nasce na viga`, P: N, a }]);
        } else {
          issues.push({ status: 'fail', text: `${pillarCode(pu)} do ${above.name} não tem pilar nem viga embaixo (${r2(N)} kN sem caminho até a fundação).`, ref: { kind: 'pillar', id: pu.id, levelId: above.id } });
        }
      }
    }

    // vigas
    const ordered = [...levelBeams].sort((x, y) => Math.round(((x.a.y + x.b.y) / 2) * 20) - Math.round(((y.a.y + y.b.y) / 2) * 20) || (x.a.x + x.b.x) - (y.a.x + y.b.x));
    const levelBeamResults = ordered.map((x, k) => designBeam(x.v, `V${k + 1}`, level.id, beamLoads.get(x.v.id)!, beamPoints.get(x.v.id) ?? []));
    beams.push(...levelBeamResults);

    // pilares
    for (const p of pillarsOf(level.id)) {
      const loads: LoadItem[] = [];
      const connected = levelBeamResults.filter((v) => {
        const src = building.structure.beams[v.id];
        return src.a === p.id || src.b === p.id;
      });
      for (const v of connected) loads.push({ label: `Viga ${v.code}`, value: building.structure.beams[v.id].a === p.id ? v.Ra : v.Rb });
      const up = above ? pillarsOf(above.id).find((q) => dist(q, p) < 0.05) : undefined;
      if (up) loads.push({ label: `${pillarCode(up)} do ${above!.name}`, value: pillarN.get(up.id) ?? 0 });
      loads.push({ label: 'Peso próprio', value: ((p.b * p.h) / 1e4) * level.height * GAMMA_C });
      const N = loads.reduce((acc, l) => acc + l.value, 0);
      pillarN.set(p.id, N);
      pillars.push(designPillar(p, pillarCode(p), level, loads, N, connected.length, connected.map((v) => ({ x: v.b.x - v.a.x, y: v.b.y - v.a.y }))));
    }
  }

  // ---------- baldrames ----------
  const ground = levels[0];
  const baldrameBeams = beamsOf(BALDRAME).map((v) => ({ v, ...beamGeom(v) }));
  const baldrameResults: BeamResult[] = [];
  if (ground) {
    const loadsMap = new Map<string, LoadItem[]>(baldrameBeams.map((x) => [x.v.id, [{ label: 'Peso próprio', value: (x.v.bw * x.v.h * GAMMA_C) / 1e4 }]]));
    for (const w of Object.values(ground.plan.walls)) {
      const A = ground.plan.nodes[w.a];
      const B = ground.plan.nodes[w.b];
      const qw = wallLoadPerMeter(s, ground.plan, w.id);
      for (const x of baldrameBeams) {
        const ov = collinearOverlap(x.a, x.b, A, B);
        if (ov > 0) {
          const arr = loadsMap.get(x.v.id)!;
          const ex = arr.find((l) => l.label === `Paredes do ${ground.name}`);
          if (ex) ex.value += (qw * ov) / x.L;
          else arr.push({ label: `Paredes do ${ground.name}`, value: (qw * ov) / x.L });
        }
      }
    }
    const ordered = [...baldrameBeams].sort((x, y) => Math.round(((x.a.y + x.b.y) / 2) * 20) - Math.round(((y.a.y + y.b.y) / 2) * 20) || (x.a.x + x.b.x) - (y.a.x + y.b.x));
    ordered.forEach((x, k) => baldrameResults.push(designBeam(x.v, `VB${k + 1}`, BALDRAME, loadsMap.get(x.v.id)!, [])));
    beams.push(...baldrameResults);
  }

  // ---------- fundação ----------
  const footings: FootingResult[] = [];
  const groundPillars = ground ? pillarsOf(ground.id) : [];
  const footprint = ground ? detectRooms(ground.plan).reduce((acc, r) => acc + Math.abs(signedArea(r.polygon)), 0) : 0;
  for (const p of groundPillars) {
    let N = pillarN.get(p.id) ?? 0;
    for (const v of baldrameResults) {
      const src = building.structure.beams[v.id];
      if (src.a === p.id) N += v.Ra;
      if (src.b === p.id) N += v.Rb;
    }
    const code = pillarCode(p).replace('P', 'S');
    const notes: string[] = [];
    let status: Status = 'ok';
    if (s.foundation === 'estaca') {
      const piles = Math.max(1, Math.ceil((N * 1.05) / s.pileCapacity));
      if (piles > 4) {
        status = 'warn';
        notes.push(`${piles} estacas num só bloco: avaliar estaca de maior capacidade.`);
      }
      const side = piles === 1 ? 0.6 : piles === 2 ? 1.3 : 1.5;
      footings.push({ id: `f-${p.id}`, code: code.replace('S', 'B'), pillarId: p.id, p: { x: p.x, y: p.y }, rotation: p.rotation, N, kind: 'estaca', B: piles === 1 ? 0.6 : 0.6, L: side, h: 0.5, piles, status, notes: [...notes, `Bloco sobre ${piles} estaca(s) de ${s.pileCapacity} kN.`] });
      continue;
    }
    const Nf = N * 1.1; // + peso próprio da sapata e do solo sobre ela
    const A = Nf / s.soilStress;
    const b0 = p.b / 100;
    const h0 = p.h / 100;
    const diff = h0 - b0;
    let B = (-diff + Math.sqrt(diff * diff + 4 * A)) / 2;
    B = Math.max(0.6, Math.ceil(B * 20) / 20);
    const L = Math.max(0.6, Math.ceil((B + diff) * 20) / 20);
    const hS = Math.max(0.25, Math.ceil((Math.max(L - h0, B - b0) / 3) * 20) / 20);
    const stress = Nf / (B * L);
    notes.push(`Tensão no solo: ${r2(stress)} kPa (admissível ${s.soilStress} kPa).`);
    if (stress > s.soilStress * 1.001) status = 'fail';
    footings.push({ id: `f-${p.id}`, code, pillarId: p.id, p: { x: p.x, y: p.y }, rotation: p.rotation, N, kind: s.foundation === 'radier' ? 'radier' : 'sapata', B, L, h: hS, piles: 0, status, notes });
  }

  // sobreposição de sapatas
  if (s.foundation === 'sapata') {
    for (let i = 0; i < footings.length; i++) {
      for (let j = i + 1; j < footings.length; j++) {
        const a = footings[i];
        const b = footings[j];
        const ra = Math.max(a.B, a.L) / 2;
        const rb = Math.max(b.B, b.L) / 2;
        const ext = (f: FootingResult) => {
          const c = Math.abs(Math.cos(f.rotation));
          return { hx: (c > 0.7 ? f.L : f.B) / 2, hy: (c > 0.7 ? f.B : f.L) / 2 };
        };
        const ea = ext(a);
        const eb = ext(b);
        if (dist(a.p, b.p) < ra + rb && Math.abs(a.p.x - b.p.x) < ea.hx + eb.hx && Math.abs(a.p.y - b.p.y) < ea.hy + eb.hy) {
          a.status = worst(a.status, 'warn');
          b.status = worst(b.status, 'warn');
          a.notes.push(`Sobrepõe a sapata ${b.code}: usar sapata associada ou radier.`);
          b.notes.push(`Sobrepõe a sapata ${a.code}: usar sapata associada ou radier.`);
        }
      }
    }
    const footArea = footings.reduce((acc, f) => acc + f.B * f.L, 0);
    if (footprint > 0 && footArea > 0.5 * footprint) {
      issues.push({ status: 'warn', text: `As sapatas ocupam ${Math.round((footArea / footprint) * 100)}% da projeção da casa: avaliar radier.` });
    }
  }

  const weight = footings.reduce((acc, f) => acc + f.N, 0);
  let radierStress: number | undefined;
  if (s.foundation === 'radier' && footprint > 0) {
    radierStress = weight / footprint + 0.15 * GAMMA_C;
    const ok = radierStress <= s.soilStress;
    issues.push({
      status: ok ? 'ok' : 'fail',
      text: `Radier (h ≈ 15 cm): tensão média ${r2(radierStress)} kPa ${ok ? '≤' : '>'} ${s.soilStress} kPa admissível.`,
    });
  }
  const perArea = footprint > 0 ? weight / (footprint * Math.max(1, levels.length)) : 0;
  if (footprint > 0 && (perArea < 5 || perArea > 16)) {
    issues.push({ status: 'warn', text: `Carga média de ${r2(perArea)} kN/m² por pavimento fora da faixa usual de residências (≈ 6 a 14 kN/m²): conferir o lançamento.` });
  }

  // problemas por elemento
  const push = (status: Status, kind: ElementKind, id: string, levelId: string, label: string, notes: string[]) => {
    if (status !== 'ok') issues.push({ status, text: `${label}: ${notes[0] ?? 'verificar'}`, ref: { kind, id, levelId } });
  };
  const levelName = (id: string) => (id === BALDRAME ? 'baldrame' : levels.find((l) => l.id === id)?.name ?? '');
  for (const x of slabs) push(x.status, 'slab', x.id, x.levelId, `Laje ${x.code} (${levelName(x.levelId)})`, x.notes.filter((n) => !n.startsWith('Peso e vão')));
  for (const x of beams) push(x.status, 'beam', x.id, x.levelId, `Viga ${x.code} (${levelName(x.levelId)})`, x.notes);
  for (const x of pillars) push(x.status, 'pillar', x.id, x.levelId, `Pilar ${x.code} (${levelName(x.levelId)})`, x.notes);
  for (const x of footings) push(x.status, 'footing', x.id, BALDRAME, `Fundação ${x.code}`, x.notes.filter((n) => !n.startsWith('Tensão no solo') || x.status === 'fail'));
  if (allPillars.length === 0) issues.push({ status: 'warn', text: 'Nenhum pilar lançado: use "Gerar estrutura".' });

  const roofResult = analyzeRoof(building, roofMaterial, ROOFS.find((x) => x.key === roofMaterial)!.load, s.roofLiveLoad);
  if (roofResult && roofResult.status !== 'ok') {
    for (const n of roofResult.notes.slice(0, roofResult.notes.length - 2)) issues.push({ status: roofResult.status, text: `Telhado: ${n}` });
  }

  const order = { fail: 0, warn: 1, ok: 2 };
  issues.sort((a, b) => order[a.status] - order[b.status]);

  return {
    slabs,
    beams,
    pillars,
    footings,
    issues,
    roof: roofResult,
    totals: {
      weight,
      footprint,
      perArea,
      radierStress,
      levels: levels.map((l) => ({
        levelId: l.id,
        name: l.name,
        weight: slabs.filter((x) => x.levelId === l.id).reduce((acc, x) => acc + x.total, 0),
      })),
    },
  };

  function designPillar(p: Pillar, code: string, level: Level, loads: LoadItem[], N: number, nBeams: number, dirs: Vec2[]): PillarResult {
    const notes: string[] = [];
    let status: Status = 'ok';
    // posição: canto (2 vigas em ângulo ou 1), extremidade (3 ou 2 alinhadas), interno (4+)
    let position: PillarResult['position'] = 'interno';
    if (nBeams <= 1) position = 'canto';
    else if (nBeams === 2) {
      const [d1, d2] = dirs;
      const c = Math.abs(cross(d1, d2)) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y));
      position = c > 0.5 ? 'canto' : 'extremidade';
    } else if (nBeams === 3) position = 'extremidade';
    const alpha = position === 'interno' ? 1.3 : position === 'extremidade' ? 1.5 : 1.8;
    const bmin = Math.min(p.b, p.h);
    const gammaN = bmin < 19 ? 1.95 - 0.05 * bmin : 1;
    const Nd = GAMMA_F * gammaN * N;
    const sigma = 0.85 * fcd + 0.01 * 42; // kN/cm² (ρ = 1%, σs a 0,2%)
    const AcReq = (alpha * Nd) / sigma;
    const Ac = p.b * p.h;
    if (bmin < 14) {
      status = 'fail';
      notes.push('Menor dimensão abaixo de 14 cm (NBR 6118).');
    }
    if (Ac < 360) {
      status = 'fail';
      notes.push(`Área ${Ac} cm² abaixo do mínimo de 360 cm² (NBR 6118).`);
    }
    let suggestion: { b: number; h: number } | undefined;
    if (Ac < AcReq) {
      status = worst(status, Ac >= 0.9 * AcReq ? 'warn' : 'fail');
      const sec = PILLAR_SECTIONS.find(([b, h]) => b * h >= AcReq && b * h >= Ac);
      if (sec) suggestion = { b: sec[0], h: sec[1] };
      notes.push(`Área necessária ${Math.ceil(AcReq)} cm² > ${Ac} cm²${suggestion ? `: usar ${suggestion.b}×${suggestion.h}` : ''}.`);
    }
    const AsNeeded = Math.max(0.004 * Ac, (0.15 * Nd) / fyd, (alpha * Nd - 0.85 * fcd * Ac) / 42);
    const bars = pickBars(AsNeeded, PILLAR_BARS);
    if (!bars || AsNeeded > 0.04 * Ac) {
      status = 'fail';
      notes.push('Armadura acima de 4% da seção: aumentar o pilar.');
    }
    const lambda = (3.46 * level.height * 100) / bmin;
    if (lambda > 90) {
      status = worst(status, 'warn');
      notes.push(`Esbeltez λ = ${Math.round(lambda)} > 90: aumentar a menor dimensão.`);
    } else if (lambda > 35) {
      notes.push(`Esbeltez λ = ${Math.round(lambda)} (35 a 90): exige verificação de 2ª ordem no projeto final.`);
    }
    if (levelIndex.get(level.id)! > 0 && !allPillars.some((q) => q.levelId === levels[levelIndex.get(level.id)! - 1].id && dist(q, p) < 0.05)) {
      notes.push('Nasce sobre viga de transição.');
    }
    return {
      id: p.id,
      code,
      levelId: level.id,
      p: { x: p.x, y: p.y },
      b: p.b,
      h: p.h,
      rotation: p.rotation,
      loads,
      N,
      position,
      alpha,
      gammaN,
      Nd,
      AcReq,
      Ac,
      As: AsNeeded,
      bars: bars ? fmtBars(bars.n, bars.d) : '-',
      lambda,
      suggestion,
      status,
      notes,
    };
  }
}

/** Ajusta automaticamente as seções que não passaram (pilares e vigas), em até 4 rodadas. */
export function autoSize(building: Building): number {
  let changes = 0;
  for (let round = 0; round < 4; round++) {
    const r = analyzeStructure(building);
    let changed = 0;
    for (const p of r.pillars) {
      if (p.suggestion) {
        const src = building.structure.pillars[p.id];
        src.b = p.suggestion.b;
        src.h = p.suggestion.h;
        changed++;
      }
    }
    for (const v of r.beams) {
      const src = building.structure.beams[v.id];
      if (src && v.hRecommended > src.h && v.status !== 'ok') {
        src.h = v.hRecommended;
        if (src.h > 60 && src.bw < 19) src.bw = 19;
        changed++;
      }
    }
    changes += changed;
    if (!changed) break;
  }
  return changes;
}
