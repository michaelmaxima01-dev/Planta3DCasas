import { useMemo, useState } from 'react';
import { currentUser } from '../auth/session';
import { type BudgetProfile, type LaborMode, STAGE_NAMES, brl, buildBudget, loadProfiles, saveProfiles } from '../model/budget';
import type { Quantities, StageKey } from '../structure/quantities';

const uid = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const num = (t: string) => {
  const v = parseFloat(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
};
const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function MoneyInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
  const [text, setText] = useState(fmt(value));
  const [focus, setFocus] = useState(false);
  return (
    <span className="money-input">
      <input
        value={focus ? text : fmt(value)}
        inputMode="decimal"
        onFocus={() => {
          setText(fmt(value));
          setFocus(true);
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocus(false);
          onChange(num(text));
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

/** Editor do perfil de preços (materiais, mão de obra, outros custos, imprevistos e BDI). */
export function BudgetEditor({ q, area, profileId, onClose, onSaved }: { q: Quantities; area: number; profileId: string; onClose: () => void; onSaved: (id: string) => void }) {
  const user = currentUser();
  const [profiles, setProfiles] = useState(() => loadProfiles(user));
  const [draft, setDraft] = useState<BudgetProfile>(() => structuredClone(profiles.find((p) => p.id === profileId) ?? profiles[0]));
  const budget = useMemo(() => buildBudget(q, draft, area), [q, draft, area]);
  const builtIn = draft.id === 'padrao';

  const setPrice = (key: string, v: number) => setDraft({ ...draft, prices: { ...draft.prices, [key]: v } });
  const setLabor = (k: StageKey, patch: Partial<{ mode: LaborMode; value: number }>) =>
    setDraft({ ...draft, labor: { ...draft.labor, [k]: { mode: 'pct', value: 0, ...draft.labor[k], ...patch } } });
  const persist = (list: BudgetProfile[]) => {
    saveProfiles(user, list);
    setProfiles(loadProfiles(user));
  };
  const save = (asNew: boolean) => {
    let p = { ...draft, updatedAt: new Date().toISOString() };
    if (asNew || builtIn) {
      const name = prompt('Nome do perfil de orçamento:', builtIn ? 'Meu perfil' : `${draft.name} (cópia)`);
      if (!name) return;
      p = { ...p, id: uid(), name: name.trim() };
    }
    const list = [...profiles.filter((x) => x.id !== p.id), p];
    persist(list);
    setDraft(p);
    onSaved(p.id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal budget-modal" role="dialog" aria-modal="true" aria-label="Orçamento">
        <header>
          <h2>Valores do orçamento</h2>
          <button className="close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <div className="budget-top">
            <label className="select-field">
              <span>Perfil de preços</span>
              <select
                value={draft.id}
                onChange={(e) => {
                  const p = profiles.find((x) => x.id === e.target.value);
                  if (p) setDraft(structuredClone(p));
                }}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="budget-total">
              <small>Total estimado</small>
              <b>{brl(budget.total)}</b>
              <small>{brl(budget.perM2)} / m² • {fmt(area)} m²</small>
            </div>
          </div>
          {builtIn && <p className="hint">Este é o perfil de referência. Ao salvar, uma cópia com o nome que você escolher é criada.</p>}

          {budget.stages.map((st) => {
            const lb = draft.labor[st.key] ?? { mode: 'pct' as LaborMode, value: 0 };
            return (
              <section key={st.key} className="budget-stage">
                <h3>
                  {st.name}
                  <span className="budget-sub">{brl(st.total)}</span>
                </h3>
                <table className="budget-table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Qtd.</th>
                      <th>Un</th>
                      <th>Valor unitário (R$)</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {st.lines.map((l) => (
                      <tr key={l.key + st.key} className={l.missing ? 'zero' : ''} title={l.key.startsWith('Concreto') && l.price === 0 ? 'Concreto virado em obra: o custo está no cimento, areia e brita. Para concreto usinado, informe o preço do m³ e zere cimento/areia/brita da estrutura.' : undefined}>
                        <td>{l.item}</td>
                        <td className="num">{fmt(l.qty)}</td>
                        <td>{l.unit}</td>
                        <td>
                          <MoneyInput value={l.price} onChange={(v) => setPrice(l.key, v)} />
                        </td>
                        <td className="num">{brl(l.total)}</td>
                      </tr>
                    ))}
                    <tr className="labor">
                      <td colSpan={3}>
                        Mão de obra{' '}
                        <select value={lb.mode} onChange={(e) => setLabor(st.key, { mode: e.target.value as LaborMode })}>
                          <option value="pct">% sobre os materiais</option>
                          <option value="m2">R$ por m² construído</option>
                          <option value="fixo">Valor fechado (R$)</option>
                        </select>
                      </td>
                      <td>
                        <MoneyInput value={lb.value} onChange={(v) => setLabor(st.key, { value: v })} suffix={lb.mode === 'pct' ? '%' : 'R$'} />
                      </td>
                      <td className="num">{brl(st.labor)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            );
          })}

          <section className="budget-stage">
            <h3>Outros custos (projetos, taxas, instalações, acabamentos…)</h3>
            {draft.extras.map((e, i) => (
              <div key={i} className="budget-extra">
                <input value={e.name} placeholder="Descrição" onChange={(ev) => setDraft({ ...draft, extras: draft.extras.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)) })} />
                <MoneyInput value={e.value} onChange={(v) => setDraft({ ...draft, extras: draft.extras.map((x, j) => (j === i ? { ...x, value: v } : x)) })} suffix="R$" />
                <button className="link-btn" onClick={() => setDraft({ ...draft, extras: draft.extras.filter((_, j) => j !== i) })}>
                  remover
                </button>
              </div>
            ))}
            <button onClick={() => setDraft({ ...draft, extras: [...draft.extras, { name: '', value: 0 }] })}>+ Adicionar custo</button>
            <div className="budget-pcts">
              <label>
                Imprevistos <MoneyInput value={draft.contingency} onChange={(v) => setDraft({ ...draft, contingency: v })} suffix="%" />
              </label>
              <label>
                BDI / encargos <MoneyInput value={draft.bdi} onChange={(v) => setDraft({ ...draft, bdi: v })} suffix="%" />
              </label>
            </div>
          </section>

          <div className="budget-actions">
            {!builtIn && (
              <button
                className="link-btn"
                onClick={() => {
                  if (!confirm(`Excluir o perfil "${draft.name}"?`)) return;
                  persist(profiles.filter((p) => p.id !== draft.id));
                  setDraft(structuredClone(loadProfiles(user)[0]));
                  onSaved('padrao');
                }}
              >
                Excluir perfil
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button onClick={() => save(true)}>Salvar como novo perfil</button>
            <button className="primary-btn" onClick={() => save(false)}>
              {builtIn ? 'Salvar como meu perfil' : 'Salvar perfil'}
            </button>
          </div>
          <p className="hint">Etapas: {Object.values(STAGE_NAMES).join(' • ')}. Os perfis ficam salvos neste computador, no seu usuário.</p>
        </div>
      </div>
    </div>
  );
}
