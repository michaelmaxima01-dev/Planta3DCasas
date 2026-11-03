/**
 * Exportação DXF (formato aberto do AutoCAD), versão R12 (AC1009) em texto:
 * é a variante mais compatível — abre em qualquer AutoCAD, BricsCAD, DraftSight, LibreCAD e QCAD.
 *
 * - Camadas: PAREDES, PORTAS, JANELAS, MOVEIS, COTAS, TEXTOS, COMODOS (+ PAREDES-HACHURA)
 * - Móveis viram blocos (INSERT), reaproveitáveis e móveis no AutoCAD
 * - Paredes: contorno fechado + preenchimento sólido opcional
 * - Cômodos: polilinha fechada (o comando ÁREA/AREA mede direto)
 * - Eixo Y invertido (na planta ele cresce para baixo; no CAD, para cima)
 */
import earcut from 'earcut';
import { type Vec2 } from '../geometry/vec';
import { LAYERS, type Drawing, type Prim } from './drawing';

export type DxfUnit = 'm' | 'cm' | 'mm';

export interface DxfOptions {
  unit: DxfUnit;
  /** Denominador da escala usada no tamanho dos textos (100 = textos de 1:100). */
  scale: number;
  wallFill: boolean;
}

const UNIT_FACTOR: Record<DxfUnit, number> = { m: 1, cm: 100, mm: 1000 };
/** Código $INSUNITS: 4 = mm, 5 = cm, 6 = m. */
const INSUNITS: Record<DxfUnit, number> = { m: 6, cm: 5, mm: 4 };

/**
 * O arquivo é gravado em ANSI 1252 (padrão do AutoCAD em português): acentos e "²" vão como estão.
 * Caracteres fora dessa tabela viram \U+XXXX, que o AutoCAD também entende.
 */
export function dxfText(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    out += code < 128 || (code >= 0xa0 && code <= 0xff) ? ch : `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out;
}

/** Converte o texto DXF em bytes ANSI 1252 para download. */
export function dxfToBytes(dxf: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(dxf.length));
  for (let i = 0; i < dxf.length; i++) {
    const c = dxf.charCodeAt(i);
    out[i] = c < 256 ? c : 63; // "?" (não deve acontecer: dxfText já escapou)
  }
  return out;
}

class Writer {
  private lines: string[] = [];
  pair(code: number, value: string | number) {
    this.lines.push(String(code), typeof value === 'number' ? num(value) : value);
  }
  toString() {
    return this.lines.join('\r\n') + '\r\n';
  }
}

const num = (v: number) => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
};

export function buildDxf(drawing: Drawing, o: DxfOptions): string {
  const k = UNIT_FACTOR[o.unit];
  const P = (p: Vec2): Vec2 => ({ x: p.x * k, y: -p.y * k });
  const textH = (mm: number) => (mm * o.scale) / 1000 * k;
  const deg = (rad: number) => (-rad * 180) / Math.PI;
  const w = new Writer();

  const b = drawing.bounds;
  const min = P({ x: b.minX, y: b.maxY });
  const max = P({ x: b.maxX, y: b.minY });

  // ---------- HEADER ----------
  w.pair(0, 'SECTION');
  w.pair(2, 'HEADER');
  w.pair(9, '$ACADVER');
  w.pair(1, 'AC1009');
  w.pair(9, '$DWGCODEPAGE');
  w.pair(3, 'ANSI_1252');
  w.pair(9, '$INSBASE');
  pt(w, 10, { x: 0, y: 0 });
  w.pair(9, '$EXTMIN');
  pt(w, 10, min);
  w.pair(9, '$EXTMAX');
  pt(w, 10, max);
  w.pair(9, '$LIMMIN');
  w.pair(10, min.x);
  w.pair(20, min.y);
  w.pair(9, '$LIMMAX');
  w.pair(10, max.x);
  w.pair(20, max.y);
  w.pair(9, '$INSUNITS');
  w.pair(70, INSUNITS[o.unit]);
  w.pair(9, '$LTSCALE');
  w.pair(40, textH(4));
  w.pair(0, 'ENDSEC');

  // ---------- TABLES ----------
  w.pair(0, 'SECTION');
  w.pair(2, 'TABLES');

  w.pair(0, 'TABLE');
  w.pair(2, 'LTYPE');
  w.pair(70, 2);
  ltype(w, 'CONTINUOUS', 'Solid line', []);
  ltype(w, 'DASHED', 'Dashed __ __ __', [0.5, -0.25]);
  w.pair(0, 'ENDTAB');

  const layers = [...LAYERS.map((l) => ({ name: l.name as string, color: l.color })), { name: 'PAREDES-HACHURA', color: 8 }];
  w.pair(0, 'TABLE');
  w.pair(2, 'LAYER');
  w.pair(70, layers.length + 1);
  for (const l of [{ name: '0', color: 7 }, ...layers]) {
    w.pair(0, 'LAYER');
    w.pair(2, l.name);
    w.pair(70, 0);
    w.pair(62, l.color);
    w.pair(6, 'CONTINUOUS');
  }
  w.pair(0, 'ENDTAB');

  w.pair(0, 'TABLE');
  w.pair(2, 'STYLE');
  w.pair(70, 1);
  w.pair(0, 'STYLE');
  w.pair(2, 'STANDARD');
  w.pair(70, 0);
  w.pair(40, 0);
  w.pair(41, 1);
  w.pair(50, 0);
  w.pair(71, 0);
  w.pair(42, 2.5);
  w.pair(3, 'txt');
  w.pair(4, '');
  w.pair(0, 'ENDTAB');

  w.pair(0, 'ENDSEC');

  // ---------- BLOCKS (móveis) ----------
  w.pair(0, 'SECTION');
  w.pair(2, 'BLOCKS');
  for (const block of Object.values(drawing.blocks)) {
    w.pair(0, 'BLOCK');
    w.pair(8, '0');
    w.pair(2, block.name);
    w.pair(70, 0);
    pt(w, 10, { x: 0, y: 0 });
    w.pair(3, block.name);
    // dentro do bloco as coordenadas também são invertidas em Y (mesma convenção)
    for (const prim of block.prims) entity(w, prim, P, textH, deg, false);
    w.pair(0, 'ENDBLK');
    w.pair(8, '0');
  }
  w.pair(0, 'ENDSEC');

  // ---------- ENTITIES ----------
  w.pair(0, 'SECTION');
  w.pair(2, 'ENTITIES');
  for (const prim of drawing.prims) entity(w, prim, P, textH, deg, o.wallFill);
  w.pair(0, 'ENDSEC');
  w.pair(0, 'EOF');
  return w.toString();
}

function pt(w: Writer, code: number, p: Vec2) {
  w.pair(code, p.x);
  w.pair(code + 10, p.y);
  w.pair(code + 20, 0);
}

function ltype(w: Writer, name: string, desc: string, pattern: number[]) {
  w.pair(0, 'LTYPE');
  w.pair(2, name);
  w.pair(70, 0);
  w.pair(3, desc);
  w.pair(72, 65);
  w.pair(73, pattern.length);
  w.pair(40, pattern.reduce((s, v) => s + Math.abs(v), 0));
  for (const v of pattern) w.pair(49, v);
}

function entity(
  w: Writer,
  prim: Prim,
  P: (p: Vec2) => Vec2,
  textH: (mm: number) => number,
  deg: (rad: number) => number,
  wallFill: boolean,
) {
  switch (prim.t) {
    case 'poly': {
      if (prim.pts.length < 2) return;
      if (wallFill && prim.layer === 'PAREDES' && prim.closed) solidFill(w, prim.pts.map(P));
      if (prim.pts.length === 2 && !prim.closed) {
        const [a, c] = prim.pts.map(P);
        w.pair(0, 'LINE');
        w.pair(8, prim.layer);
        if (prim.dash) w.pair(6, 'DASHED');
        pt(w, 10, a);
        pt(w, 11, c);
        return;
      }
      w.pair(0, 'POLYLINE');
      w.pair(8, prim.layer);
      if (prim.dash) w.pair(6, 'DASHED');
      w.pair(66, 1);
      pt(w, 10, { x: 0, y: 0 });
      w.pair(70, prim.closed ? 1 : 0);
      for (const p of prim.pts.map(P)) {
        w.pair(0, 'VERTEX');
        w.pair(8, prim.layer);
        pt(w, 10, p);
      }
      w.pair(0, 'SEQEND');
      w.pair(8, prim.layer);
      return;
    }
    case 'arc': {
      // com Y invertido, o arco anti-horário de a0→a1 vira o arco anti-horário de -a1→-a0
      const c = P(prim.c);
      const start = norm360(deg(prim.a1));
      const end = norm360(deg(prim.a0));
      if (Math.abs(prim.a1 - prim.a0) >= Math.PI * 2 - 1e-6) {
        w.pair(0, 'CIRCLE');
        w.pair(8, prim.layer);
        pt(w, 10, c);
        w.pair(40, Math.hypot(P({ x: prim.r, y: 0 }).x, 0));
        return;
      }
      w.pair(0, 'ARC');
      w.pair(8, prim.layer);
      if (prim.dash) w.pair(6, 'DASHED');
      pt(w, 10, c);
      w.pair(40, Math.abs(P({ x: prim.r, y: 0 }).x - P({ x: 0, y: 0 }).x));
      w.pair(50, start);
      w.pair(51, end);
      return;
    }
    case 'text': {
      const p = P(prim.p);
      w.pair(0, 'TEXT');
      w.pair(8, prim.layer);
      pt(w, 10, p);
      w.pair(40, textH(prim.size));
      w.pair(1, dxfText(prim.text));
      w.pair(50, norm360(deg(prim.angle)));
      w.pair(7, 'STANDARD');
      w.pair(72, 1); // centralizado
      pt(w, 11, p);
      w.pair(73, 2); // meio
      return;
    }
    case 'insert': {
      w.pair(0, 'INSERT');
      w.pair(8, prim.layer);
      w.pair(2, prim.block);
      pt(w, 10, P(prim.p));
      w.pair(41, 1);
      w.pair(42, 1);
      w.pair(43, 1);
      w.pair(50, norm360(deg(prim.rotation)));
      return;
    }
  }
}

/** Preenchimento sólido (triângulos SOLID) — o "poché" escuro das paredes cortadas. */
function solidFill(w: Writer, pts: Vec2[]) {
  const flat = pts.flatMap((p) => [p.x, p.y]);
  const tri = earcut(flat);
  for (let i = 0; i < tri.length; i += 3) {
    const [a, b, c] = [pts[tri[i]], pts[tri[i + 1]], pts[tri[i + 2]]];
    w.pair(0, 'SOLID');
    w.pair(8, 'PAREDES-HACHURA');
    pt(w, 10, a);
    pt(w, 11, b);
    pt(w, 12, c);
    pt(w, 13, c);
  }
}

const norm360 = (d: number) => {
  const r = ((d % 360) + 360) % 360;
  return Math.round(r * 1e6) / 1e6;
};

