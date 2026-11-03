/// <reference types="node" />
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildExamplePlan } from '../model/example';
import { buildDrawing } from './drawing';
import { buildDxf, dxfText, dxfToBytes } from './dxf';
import { buildSchedule } from './schedule';

const plan = buildExamplePlan();
const sch = buildSchedule(plan);

describe('levantamento do projeto', () => {
  it('numera portas e janelas e liga cada uma aos cômodos', () => {
    expect(sch.openings.filter((o) => o.op.kind === 'door').map((o) => o.tag)).toEqual(['P1', 'P2', 'P3', 'P4']);
    expect(sch.openings.filter((o) => o.op.kind === 'window')).toHaveLength(5);
    const front = sch.openings.find((o) => o.op.kind === 'door' && o.exterior)!;
    expect(front.rooms).toHaveLength(1);
  });

  it('distribui os móveis nos cômodos e calcula área de parede', () => {
    const banheiro = sch.rooms.find((r) => r.room.name === 'Banheiro')!;
    expect(banheiro.furniture.map((f) => f.catalogId).sort()).toEqual(['bath_sink', 'shower', 'toilet']);
    expect(banheiro.finish).toBe('Porcelanato cinza');
    expect(banheiro.netWallArea).toBeGreaterThan(10);
    expect(sch.furniture).toHaveLength(Object.keys(plan.furniture).length);
  });
});

describe('DXF', () => {
  const drawing = buildDrawing(plan, sch, { scale: 100 });
  const dxf = buildDxf(drawing, { unit: 'm', scale: 100, wallFill: true });

  it('tem as seções, camadas e blocos esperados', () => {
    expect(dxf.startsWith('0\r\nSECTION\r\n2\r\nHEADER')).toBe(true);
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    for (const layer of ['PAREDES', 'PORTAS', 'JANELAS', 'MOVEIS', 'COTAS', 'TEXTOS', 'COMODOS']) expect(dxf).toContain(`\r\n${layer}\r\n`);
    expect(dxf).toContain('MOV_DOUBLE_BED_160X205X105');
    expect(dxf).toContain('\r\nINSERT\r\n');
  });

  it('mantém acentos (ANSI 1252) e escapa o resto no padrão do AutoCAD', () => {
    expect(dxfText('ÁREA m²')).toBe('ÁREA m²');
    expect(dxfText('≥ 2')).toBe('\\U+2265 2');
    expect(dxf).toContain('ANSI_1252');
  });

  it('converte unidade', () => {
    const cm = buildDxf(drawing, { unit: 'cm', scale: 100, wallFill: false });
    expect(cm).toContain('$INSUNITS\r\n70\r\n5');
    expect(cm).not.toContain('PAREDES-HACHURA\r\n10');
  });

  if (process.env.DUMP_DIR) {
    it('grava arquivo de exemplo', () => {
      writeFileSync(`${process.env.DUMP_DIR}/exemplo.dxf`, dxfToBytes(dxf));
    });
  }
});

describe('PDF', () => {
  it('gera o caderno com capa, planta, quadros, cômodos e mobiliário', async () => {
    const { buildPdf, pickScale } = await import('./pdf');
    const meta = { title: 'Casa Exemplo', client: 'Maria Souza', address: 'Rua das Flores, 123 - São Paulo/SP', author: 'Arq. João Lima', registry: 'CAU A12345-6', notes: '' };
    const pdf = buildPdf([{ id: 't', name: 'Térreo', elevation: 0, height: 2.95, plan }], { paper: 'A3', scale: 0, roomPages: true, furnitureList: true, views3d: false, meta });
    if (process.env.DUMP_DIR) writeFileSync(`${process.env.DUMP_DIR}/caderno.pdf`, Buffer.from(pdf.output('arraybuffer')));
    // capa + planta + quadros + 4 cômodos + mobiliário
    expect(pdf.getNumberOfPages()).toBe(8);
    expect(pickScale(12, 10, { w: 380, h: 220 })).toBe(50);
    expect(pickScale(12, 10, { w: 200, h: 150 })).toBe(75);
  });
});

describe('estrutura nas exportações', () => {
  it('DXF ganha camadas da estrutura e a locação da fundação', async () => {
    const { buildExampleBuilding } = await import('../model/building');
    const { generateStructure } = await import('../structure/generate');
    const { analyzeStructure } = await import('../structure/analyze');
    const { addStructureToDrawing } = await import('../structure/drawingLayers');
    const { BALDRAME } = await import('../structure/types');
    const b = buildExampleBuilding();
    b.structure = generateStructure(b);
    const r = analyzeStructure(b);
    const ground = b.levels[0];
    const d = buildDrawing(ground.plan, buildSchedule(ground.plan), { scale: 50 });
    addStructureToDrawing(d, b, r, ground.id, 50);
    const dxf = buildDxf(d, { unit: 'm', scale: 50, wallFill: true });
    for (const layer of ['PILARES', 'VIGAS', 'LAJES']) expect(dxf).toContain(`8\r\n${layer}\r\n`);
    const f = buildDrawing(ground.plan, buildSchedule(ground.plan), { scale: 50, furniture: false, texts: false });
    addStructureToDrawing(f, b, r, BALDRAME, 50);
    const fdxf = buildDxf(f, { unit: 'm', scale: 50, wallFill: true });
    expect(fdxf).toContain('8\r\nFUNDACAO\r\n');
    expect(fdxf).toContain('VB1');
    if (process.env.DUMP_DIR) {
      writeFileSync(`${process.env.DUMP_DIR}/estrutura-terreo.dxf`, dxfToBytes(dxf));
      writeFileSync(`${process.env.DUMP_DIR}/fundacao.dxf`, dxfToBytes(fdxf));
    }
  });

  it('PDF do projeto termina com as folhas da estrutura e o termo do engenheiro', async () => {
    const { buildExampleBuilding } = await import('../model/building');
    const { generateStructure } = await import('../structure/generate');
    const { analyzeStructure } = await import('../structure/analyze');
    const { appendStructuralSheets } = await import('../structure/report');
    const { buildPdf } = await import('./pdf');
    const b = buildExampleBuilding();
    b.structure = generateStructure(b);
    b.meta = { ...b.meta!, engineer: 'Eng. Teste', engineerRegistry: 'SP-1', art: '123' };
    const meta = { title: 'Sobrado', client: '', address: '', author: 'Arq. A', registry: 'CAU 1', notes: '' };
    const opts = { paper: 'A3' as const, scale: 0, roomPages: false, furnitureList: false, views3d: false, meta };
    const sem = buildPdf(b.levels, opts);
    const com = buildPdf(b.levels, { ...opts, extraSheets: (doc) => appendStructuralSheets(doc, b, analyzeStructure(b)) });
    expect(com.getNumberOfPages()).toBeGreaterThan(sem.getNumberOfPages() + 8);
  });
});
