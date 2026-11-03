import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_META } from '../model/finishes';
import type { ProjectMeta } from '../model/types';
import { usePlan } from '../store/planStore';
import { useUI } from '../store/uiStore';
import { NumberField } from '../ui/Fields';
import { fmtNumber } from '../ui/format';
import type { Issue, LoadItem, Status } from './analyze';
import { cachedAnalysis, removePillar } from './ops';
import { buildStructuralReport } from './report';
import { STATUS_COLOR } from './StructPlan2D';
import { ROOF_TYPES } from '../roof/roof';
import { buildQuantities, fmtQty } from './quantities';
import { BALDRAME } from './types';

const LABEL: Record<Status, string> = { ok: 'Atende', warn: 'Atenção', fail: 'Não atende' };
const f = (v: number, d = 2) => fmtNumber(v, d);

function Badge({ status }: { status: Status }) {
  return (
    <span className="badge" style={{ background: `${STATUS_COLOR[status]}1f`, color: STATUS_COLOR[status], borderColor: `${STATUS_COLOR[status]}66` }}>
      {LABEL[status]}
    </span>
  );
}

function Loads({ title, items, unit }: { title: string; items: LoadItem[]; unit: string }) {
  const total = items.reduce((s, l) => s + l.value, 0);
  return (
    <>
      <h4>{title}</h4>
      <table className="calc">
        <tbody>
          {items.map((l, i) => (
            <tr key={i}>
              <td>{l.label}</td>
              <td>{f(l.value)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Total</td>
            <td>
              {f(total)} {unit}
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

function Notes({ notes }: { notes: string[] }) {
  return notes.length ? (
    <ul className="notes">
      {notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  ) : null;
}

function MetaInput({ label, field }: { label: string; field: keyof ProjectMeta }) {
  const value = usePlan((s) => s.building.meta?.[field] ?? '');
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="meta-field">
      <span>{label}</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && updateBuilding((b) => void (b.meta = { ...DEFAULT_META, ...b.meta, [field]: text.trim() }))}
      />
    </label>
  );
}

export function StructPanel() {
  const building = usePlan((s) => s.building);
  const updateBuilding = usePlan((s) => s.updateBuilding);
  const setLevel = usePlan((s) => s.setLevel);
  const selection = useUI((s) => s.selection);
  const select = useUI((s) => s.select);
  const setUI = useUI((s) => s.set);
  const r = useMemo(() => cachedAnalysis(building), [building]);
  const quantities = useMemo(() => buildQuantities(building, r), [building, r]);
  const levelName = (id: string) => (id === BALDRAME ? 'Baldrame' : building.levels.find((l) => l.id === id)?.name ?? '');

  const goTo = (i: Issue) => {
    if (!i.ref) return;
    if (i.ref.levelId === BALDRAME) setUI({ foundationView: true });
    else {
      setLevel(i.ref.levelId);
      setUI({ foundationView: false });
    }
    select({ kind: i.ref.kind, id: i.ref.id });
  };

  const body = (() => {
    if (!selection) return null;
    if (selection.kind === 'pillar') {
      const p = r.pillars.find((x) => x.id === selection.id);
      const src = building.structure.pillars[selection.id];
      if (!p || !src) return null;
      const below = r.pillars.find((q) => q.code === p.code && building.levels.findIndex((l) => l.id === q.levelId) === building.levels.findIndex((l) => l.id === p.levelId) - 1);
      const footing = r.footings.find((x) => x.pillarId === p.id);
      return (
        <>
          <h3>
            Pilar {p.code} • {levelName(p.levelId)} <Badge status={p.status} />
          </h3>
          <NumberField label="Largura b" value={src.b} suffix="cm" digits={0} min={12} max={100} onCommit={(v) => updateBuilding((b) => void (b.structure.pillars[src.id].b = v))} />
          <NumberField label="Comprimento h" value={src.h} suffix="cm" digits={0} min={12} max={200} onCommit={(v) => updateBuilding((b) => void (b.structure.pillars[src.id].h = v))} />
          <button onClick={() => updateBuilding((b) => void (b.structure.pillars[src.id].rotation += Math.PI / 2))}>↻ Girar seção 90°</button>
          <Loads title="Cargas recebidas (kN)" items={p.loads} unit="kN" />
          <h4>Verificação</h4>
          <Row k="Posição / coeficiente α" v={`${p.position} / ${f(p.alpha, 1)}`} />
          <Row k="γn (seção < 19 cm)" v={f(p.gammaN)} />
          <Row k="Nd = 1,4 · γn · Nk" v={`${f(p.Nd, 1)} kN`} />
          <Row k="Área necessária (α·Nd/σ)" v={`${Math.ceil(p.AcReq)} cm²`} />
          <Row k="Área da seção" v={`${p.Ac} cm²`} />
          <Row k="Armadura longitudinal" v={`${p.bars} (${f(p.As)} cm²)`} />
          <Row k="Esbeltez λ" v={f(p.lambda, 0)} />
          {p.suggestion && <button onClick={() => updateBuilding((b) => void Object.assign(b.structure.pillars[src.id], p.suggestion))}>Aplicar seção sugerida {p.suggestion.b}×{p.suggestion.h}</button>}
          <Notes notes={p.notes} />
          <p className="hint">Descarrega em: {below ? `${below.code} do ${levelName(below.levelId)}` : footing ? `fundação ${footing.code}` : 'viga de transição'}.</p>
          <button className="danger" onClick={() => (updateBuilding((b) => removePillar(b, src.id)), select(null))}>🗑 Excluir pilar</button>
        </>
      );
    }
    if (selection.kind === 'beam') {
      const v = r.beams.find((x) => x.id === selection.id);
      const src = building.structure.beams[selection.id];
      if (!v || !src) return null;
      const pa = r.pillars.find((p) => p.id === src.a && p.levelId !== undefined);
      const pb = r.pillars.find((p) => p.id === src.b);
      return (
        <>
          <h3>
            Viga {v.code} • {levelName(v.levelId)} <Badge status={v.status} />
          </h3>
          <NumberField label="Largura bw" value={src.bw} suffix="cm" digits={0} min={10} max={60} onCommit={(x) => updateBuilding((b) => void (b.structure.beams[src.id].bw = x))} />
          <NumberField label="Altura h" value={src.h} suffix="cm" digits={0} min={20} max={150} onCommit={(x) => updateBuilding((b) => void (b.structure.beams[src.id].h = x))} />
          <Row k="Vão L" v={`${f(v.L)} m`} />
          <Loads title="Carga distribuída (kN/m)" items={v.loads} unit="kN/m" />
          {v.points.length > 0 && (
            <>
              <h4>Cargas concentradas</h4>
              {v.points.map((pt, i) => (
                <Row key={i} k={`${pt.label} (a = ${f(pt.a)} m)`} v={`${f(pt.P, 1)} kN`} />
              ))}
            </>
          )}
          <h4>Esforços e armadura</h4>
          <Row k="Momento máximo Mk" v={`${f(v.Mk, 1)} kN·m`} />
          <Row k="Cortante máxima Vk" v={`${f(v.Vk, 1)} kN`} />
          <Row k="Armadura de flexão" v={`${v.bars} (${f(v.As)} cm²)`} />
          <Row k="Estribos" v={v.stirrups} />
          <Row k={`Reação em ${pa?.code ?? 'A'}`} v={`${f(v.Ra, 1)} kN`} />
          <Row k={`Reação em ${pb?.code ?? 'B'}`} v={`${f(v.Rb, 1)} kN`} />
          {v.hRecommended > src.h && <button onClick={() => updateBuilding((b) => void (b.structure.beams[src.id].h = v.hRecommended))}>Aplicar altura recomendada {v.hRecommended} cm</button>}
          <Notes notes={v.notes} />
          <button className="danger" onClick={() => (updateBuilding((b) => void delete b.structure.beams[src.id]), select(null))}>🗑 Excluir viga</button>
        </>
      );
    }
    if (selection.kind === 'slab') {
      const x = r.slabs.find((s) => s.id === selection.id);
      if (!x) return null;
      const supports = r.beams.filter((v) => v.levelId === x.levelId && v.loads.some((l) => l.label === `Laje ${x.code}`)).map((v) => v.code);
      return (
        <>
          <h3>
            Laje {x.code} • {x.name} <Badge status={x.status} />
          </h3>
          <Row k="Pavimento (teto)" v={levelName(x.levelId)} />
          <Row k="Sistema" v={x.system} />
          <Row k="Espessura" v={`${x.thickness} cm`} />
          <Row k="Vãos lx × ly" v={`${f(x.lx)} × ${f(x.ly)} m`} />
          <Row k="Área" v={`${f(x.area)} m²`} />
          <Loads title="Cargas (kN/m²)" items={x.loads} unit="kN/m²" />
          <Row k="Carga total da laje" v={`${f(x.total, 1)} kN`} />
          <p className="hint">Descarrega nas vigas: {supports.join(', ') || 'nenhuma (alvenaria)'}.</p>
          <Notes notes={x.notes} />
        </>
      );
    }
    if (selection.kind === 'footing') {
      const x = r.footings.find((s) => s.id === selection.id);
      if (!x) return null;
      const p = r.pillars.find((q) => q.id === x.pillarId);
      return (
        <>
          <h3>
            Fundação {x.code} <Badge status={x.status} />
          </h3>
          <Row k="Pilar" v={p?.code ?? ''} />
          <Row k="Carga Nk (pilar + baldrames)" v={`${f(x.N, 1)} kN`} />
          {x.kind === 'estaca' ? (
            <Row k="Estacas" v={String(x.piles)} />
          ) : (
            <>
              <Row k="Dimensões B × L" v={`${f(x.B)} × ${f(x.L)} m`} />
              <Row k="Altura (sapata rígida)" v={`${f(x.h)} m`} />
              <Row k="Área de apoio" v={`${f(x.B * x.L)} m²`} />
            </>
          )}
          <Row k="Assentamento" v={`${f(building.structure.settings.foundationDepth)} m`} />
          <Notes notes={x.notes} />
        </>
      );
    }
    return null;
  })();

  if (body) return <aside className="properties">{body}</aside>;

  const count = (arr: { status: Status }[], s: Status) => arr.filter((x) => x.status === s).length;
  const all = [...r.slabs, ...r.beams, ...r.pillars, ...r.footings];
  const download = () => {
    const pdf = buildStructuralReport(building, r);
    pdf.save('relatorio-estrutural.pdf');
  };

  return (
    <aside className="properties">
      <h3>Verificação estrutural</h3>
      <div className="status-row">
        <span style={{ color: STATUS_COLOR.ok }}>● {count(all, 'ok')} atendem</span>
        <span style={{ color: STATUS_COLOR.warn }}>● {count(all, 'warn')} atenção</span>
        <span style={{ color: STATUS_COLOR.fail }}>● {count(all, 'fail')} não atendem</span>
      </div>
      <Row k="Peso total na fundação" v={`${f(r.totals.weight, 0)} kN`} />
      <Row k="Carga média / pavimento" v={`${f(r.totals.perArea, 1)} kN/m²`} />
      <Row k="Pilares / vigas / lajes" v={`${r.pillars.length} / ${r.beams.length} / ${r.slabs.length}`} />
      <Row k="Fundações" v={String(r.footings.length)} />

      <h4>Pendências ({r.issues.filter((i) => i.status !== 'ok').length})</h4>
      <div className="issues">
        {r.issues.length === 0 && <p className="hint">Nenhuma pendência.</p>}
        {r.issues.map((i, k) => (
          <button key={k} className={`issue issue-${i.status}`} onClick={() => goTo(i)} disabled={!i.ref}>
            <i style={{ background: STATUS_COLOR[i.status] }} />
            <span>{i.text}</span>
          </button>
        ))}
      </div>

      {r.roof && (
        <>
          <h4>Telhado</h4>
          <Row k="Tipo / inclinação" v={`${ROOF_TYPES.find((t) => t.key === r.roof!.type)?.name} / ${building.roof?.slope ?? 0}%`} />
          <Row k="Área real" v={`${f(r.roof.geometry.realArea, 1)} m²`} />
          {r.roof.purlin && <Row k="Terça 6×16" v={r.roof.purlin.sigma <= r.roof.purlin.fd ? 'atende' : 'não atende'} />}
          {r.roof.elements.slice(0, 2).map((e) => (
            <Row key={e.name} k={e.name} v={e.quantity} />
          ))}
        </>
      )}

      <details className="materials" open>
        <summary>Quantitativo de materiais</summary>
        <table className="calc">
          <tbody>
            {quantities.summary.map((x) => (
              <tr key={x.item}>
                <td>{x.item}</td>
                <td>{fmtQty(x)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint small">Inclui perdas. Detalhamento por peça no relatório estrutural.</p>
      </details>

      <h4>Responsável técnico</h4>
      <MetaInput label="Engenheiro civil" field="engineer" />
      <MetaInput label="CREA" field="engineerRegistry" />
      <MetaInput label="Nº da ART" field="art" />
      <button className="primary-btn" onClick={download} disabled={r.pillars.length === 0}>
        ⬇ Relatório estrutural (PDF)
      </button>
      <p className="hint small">
        Pré-dimensionamento com critérios simplificados das NBR 6118, 6120, 6122 e 8681. Os resultados são validados e assinados pelo
        engenheiro responsável no termo de responsabilidade do relatório. A capacidade do solo deve vir de sondagem SPT.
      </p>
    </aside>
  );
}
