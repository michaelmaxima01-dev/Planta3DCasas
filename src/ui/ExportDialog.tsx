import { useEffect, useState } from 'react';
import { buildDrawing } from '../export/drawing';
import { type DxfUnit, buildDxf, dxfToBytes } from '../export/dxf';
import { type Paper, buildPdf } from '../export/pdf';
import { buildSchedule } from '../export/schedule';
import { renderTour } from '../export/snapshots';
import { DEFAULT_META } from '../model/finishes';
import type { ProjectMeta } from '../model/types';
import { selectLevel, usePlan } from '../store/planStore';
import { addStructureToDrawing } from '../structure/drawingLayers';
import { cachedAnalysis } from '../structure/ops';
import { appendStructuralSheets, buildStructuralReport } from '../structure/report';
import { BALDRAME } from '../structure/types';

const META_FIELDS: { key: keyof ProjectMeta; label: string; placeholder: string }[] = [
  { key: 'title', label: 'Nome do projeto', placeholder: 'Residência Silva' },
  { key: 'client', label: 'Cliente', placeholder: 'Nome do cliente' },
  { key: 'address', label: 'Endereço da obra', placeholder: 'Rua, número - cidade/UF' },
  { key: 'author', label: 'Responsável técnico', placeholder: 'Arq. Nome Sobrenome' },
  { key: 'registry', label: 'Registro (CAU/CREA)', placeholder: 'CAU A00000-0' },
  { key: 'notes', label: 'Observações', placeholder: 'Opcional' },
];

const SCALE_OPTIONS = [0, 25, 50, 75, 100, 125];

export function slugify(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'projeto'
  );
}

function download(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function MetaField({ label, value, placeholder, onCommit }: { label: string; value: string; placeholder: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="meta-field">
      <span>{label}</span>
      <input value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => text !== value && onCommit(text.trim())} />
    </label>
  );
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const building = usePlan((s) => s.building);
  const level = usePlan(selectLevel);
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const meta = { ...DEFAULT_META, ...building.meta };

  const [paper, setPaper] = useState<Paper>('A3');
  const [scale, setScale] = useState(0);
  const [roomPages, setRoomPages] = useState(true);
  const [furnitureList, setFurnitureList] = useState(true);
  const [views3d, setViews3d] = useState(true);
  const hasStructure = Object.keys(building.structure.pillars).length > 0;
  const [pdfStructure, setPdfStructure] = useState(hasStructure);
  const [dxfStructure, setDxfStructure] = useState(hasStructure);

  const [unit, setUnit] = useState<DxfUnit>('m');
  const [dxfLevel, setDxfLevel] = useState(level.id);
  const [dxfScale, setDxfScale] = useState(50);
  const [wallFill, setWallFill] = useState(true);
  const [dxfFurniture, setDxfFurniture] = useState(true);
  const [dxfDims, setDxfDims] = useState(true);
  const [dxfTexts, setDxfTexts] = useState(true);

  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setMeta = (key: keyof ProjectMeta, value: string) =>
    updateBuilding((d) => {
      d.meta = { ...DEFAULT_META, ...d.meta, [key]: value };
    });

  const fileBase = slugify(meta.title);
  const empty = building.levels.every((l) => Object.keys(l.plan.walls).length === 0);

  const exportPdf = async () => {
    setBusy('pdf');
    setDone(null);
    await new Promise((r) => setTimeout(r, 30)); // deixa a interface mostrar "Gerando…"
    try {
      const tour = renderTour(building, { full: views3d });
      const pdf = buildPdf(
        building.levels,
        {
          paper,
          scale,
          roomPages,
          furnitureList,
          views3d,
          meta,
          extraSheets: pdfStructure && hasStructure ? (doc) => appendStructuralSheets(doc, building, cachedAnalysis(building)) : undefined,
        },
        { cover: tour.cover, views: tour.shots },
      );
      pdf.save(`${fileBase}.pdf`);
      setDone(`PDF gerado: ${pdf.getNumberOfPages()} folhas (${fileBase}.pdf)`);
    } catch (err) {
      console.error(err);
      alert('Não foi possível gerar o PDF. Veja o console para detalhes.');
    } finally {
      setBusy(null);
    }
  };

  const exportDxf = () => {
    const foundation = dxfLevel === BALDRAME;
    const dl = foundation ? building.levels[0] : building.levels.find((l) => l.id === dxfLevel) ?? level;
    const sch = buildSchedule(dl.plan);
    const drawing = buildDrawing(dl.plan, sch, {
      scale: dxfScale,
      furniture: dxfFurniture && !foundation,
      dimensions: dxfDims,
      texts: dxfTexts && !foundation,
    });
    if ((dxfStructure || foundation) && hasStructure) addStructureToDrawing(drawing, building, cachedAnalysis(building), foundation ? BALDRAME : dl.id, dxfScale);
    const dxf = buildDxf(drawing, { unit, scale: dxfScale, wallFill });
    const dxfName = foundation ? `${fileBase}-fundacao` : building.levels.length > 1 ? `${fileBase}-${slugify(dl.name)}` : fileBase;
    download(dxfToBytes(dxf), 'application/dxf', `${dxfName}.dxf`);
    setDone(`DXF gerado em ${unit === 'm' ? 'metros' : unit === 'cm' ? 'centímetros' : 'milímetros'} (${dxfName}.dxf)`);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Exportar projeto">
        <header>
          <h2>Exportar projeto</h2>
          <button className="close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <section className="meta">
            <h3>Dados do carimbo e da capa</h3>
            <div className="meta-grid">
              {META_FIELDS.map((f) => (
                <MetaField key={f.key} label={f.label} placeholder={f.placeholder} value={meta[f.key] ?? ""} onCommit={(v) => setMeta(f.key, v)} />
              ))}
            </div>
            <p className="hint">Esses dados ficam salvos no projeto.</p>
          </section>

          <div className="formats">
            <article className="format">
              <div className="format-head">
                <b>PDF</b>
                <span>Caderno do projeto para cliente e obra</span>
              </div>
              <p className="hint">
                Capa, planta baixa em escala com cotas, quadro de áreas, quadro de esquadrias, uma folha por cômodo
                (desenho, medidas, portas, janelas e móveis), lista de mobiliário e vistas 3D.
              </p>
              <div className="opts">
                <label>
                  Papel
                  <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
                    <option value="A3">A3 paisagem</option>
                    <option value="A4">A4 paisagem</option>
                  </select>
                </label>
                <label>
                  Escala da planta
                  <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                    {SCALE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s === 0 ? 'Automática' : `1:${s}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={roomPages} onChange={(e) => setRoomPages(e.target.checked)} /> Uma folha por cômodo
                </label>
                <label className="check">
                  <input type="checkbox" checked={furnitureList} onChange={(e) => setFurnitureList(e.target.checked)} /> Lista de mobiliário
                </label>
                <label className="check">
                  <input type="checkbox" checked={views3d} onChange={(e) => setViews3d(e.target.checked)} /> Vistas 3D ao redor da casa (8 perspectivas, 4 fachadas e vistas aéreas)
                </label>
                <label className="check" title={hasStructure ? '' : 'Gere a estrutura na aba Estrutura'}>
                  <input type="checkbox" disabled={!hasStructure} checked={pdfStructure && hasStructure} onChange={(e) => setPdfStructure(e.target.checked)} /> Estrutura (fôrmas,
                  fundação, verificação e termo do engenheiro)
                </label>
              </div>
              <button className="primary" disabled={!!busy || empty} onClick={exportPdf}>
                {busy === 'pdf' ? 'Gerando…' : 'Baixar PDF'}
              </button>
            </article>

            <article className="format">
              <div className="format-head">
                <b>DXF</b>
                <span>AutoCAD, BricsCAD, DraftSight, LibreCAD</span>
              </div>
              <p className="hint">
                Planta 2D em escala real com camadas (PAREDES, PORTAS, JANELAS, MOVEIS, COTAS, TEXTOS, COMODOS),
                móveis como blocos e contorno dos cômodos (o comando ÁREA mede direto). Para DWG, abra no AutoCAD e use
                Salvar como.
              </p>
              <div className="opts">
                {(building.levels.length > 1 || hasStructure) && (
                  <label>
                    Desenho
                    <select value={dxfLevel} onChange={(e) => setDxfLevel(e.target.value)}>
                      {building.levels.map((l) => (
                        <option key={l.id} value={l.id}>
                          Planta - {l.name}
                        </option>
                      ))}
                      {hasStructure && <option value={BALDRAME}>Locação da fundação</option>}
                    </select>
                  </label>
                )}
                <label>
                  Unidade
                  <select value={unit} onChange={(e) => setUnit(e.target.value as DxfUnit)}>
                    <option value="m">Metros</option>
                    <option value="cm">Centímetros</option>
                    <option value="mm">Milímetros</option>
                  </select>
                </label>
                <label>
                  Textos para plotar em
                  <select value={dxfScale} onChange={(e) => setDxfScale(Number(e.target.value))}>
                    {[25, 50, 75, 100].map((s) => (
                      <option key={s} value={s}>{`1:${s}`}</option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={wallFill} onChange={(e) => setWallFill(e.target.checked)} /> Hachura sólida nas paredes
                </label>
                <label className="check">
                  <input type="checkbox" checked={dxfFurniture} onChange={(e) => setDxfFurniture(e.target.checked)} /> Móveis
                </label>
                <label className="check">
                  <input type="checkbox" checked={dxfDims} onChange={(e) => setDxfDims(e.target.checked)} /> Cotas
                </label>
                <label className="check">
                  <input type="checkbox" checked={dxfTexts} onChange={(e) => setDxfTexts(e.target.checked)} /> Nomes, áreas e códigos
                </label>
              </div>
              <label className="check opts-extra" title={hasStructure ? '' : 'Gere a estrutura na aba Estrutura'}>
                <input type="checkbox" disabled={!hasStructure || dxfLevel === BALDRAME} checked={(dxfStructure || dxfLevel === BALDRAME) && hasStructure} onChange={(e) => setDxfStructure(e.target.checked)} /> Estrutura
                (camadas PILARES, VIGAS, LAJES)
              </label>
              <button className="primary" disabled={!!busy || empty} onClick={exportDxf}>
                Baixar DXF
              </button>
            </article>

            <article className="format">
              <div className="format-head">
                <b>Estrutura</b>
                <span>Relatório estrutural para o engenheiro</span>
              </div>
              <p className="hint">
                Premissas, pendências, plantas de fôrmas de cada pavimento, locação da fundação, tabelas de lajes, vigas,
                pilares e fundações, caminho das cargas e termo de responsabilidade técnica com campo de assinatura.
              </p>
              <p className="hint">
                Engenheiro: <b>{meta.engineer || 'não informado'}</b>
                {meta.engineerRegistry ? ` • CREA ${meta.engineerRegistry}` : ''}
                {meta.art ? ` • ART ${meta.art}` : ''}
                <br />
                Preencha esses dados no painel da aba Estrutura.
              </p>
              {!hasStructure && <p className="hint">Gere a estrutura na aba Estrutura para habilitar.</p>}
              <button
                className="primary"
                disabled={!hasStructure || !!busy}
                onClick={() => {
                  const pdf = buildStructuralReport(building, cachedAnalysis(building), paper);
                  pdf.save(`${fileBase}-estrutural.pdf`);
                  setDone(`Relatório estrutural gerado: ${pdf.getNumberOfPages()} folhas (${fileBase}-estrutural.pdf)`);
                }}
              >
                Baixar relatório estrutural
              </button>
            </article>
          </div>
          <p className="hint">Em desenvolvimento: IFC (Revit, Archicad, SketchUp Pro), glTF/OBJ (Blender, SketchUp), USDZ (realidade aumentada) e PNG/SVG.</p>
          {empty && <p className="hint">Desenhe ao menos uma parede para exportar.</p>}
          {done && <p className="done">✓ {done}</p>}
        </div>
      </div>
    </div>
  );
}
