import { type FormEvent, useEffect, useState } from 'react';
import { type ApiUser, ApiError, PLANS, type PlanKey, apiCreate, apiDelete, apiList, apiUnlock, apiUpdate, planName } from '../auth/api';
import { getSession } from '../auth/session';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

function genPass() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return [...a].map((n) => abc[n % abc.length]).join('');
}

function LicenseBadge({ u }: { u: ApiUser }) {
  if (u.role === 'owner') return <span className="lic lic-owner">Proprietário</span>;
  if (!u.active) return <span className="lic lic-off">Inativo</span>;
  if (u.expires === null) return <span className="lic lic-ok">Vitalícia</span>;
  const d = u.daysLeft ?? 0;
  if (d < 0) return <span className="lic lic-off">Vencida em {fmtDate(u.expires)}</span>;
  if (d <= 7) return <span className="lic lic-warn">Vence em {d === 0 ? 'hoje' : `${d} dia${d > 1 ? 's' : ''}`}</span>;
  return <span className="lic lic-ok">Até {fmtDate(u.expires)}</span>;
}

/** Painel de acessos: só o proprietário abre, e sempre confirmando a senha dele. */
export function UsersPanel({ onClose }: { onClose: () => void }) {
  const session = getSession();
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [pass, setPass] = useState('');
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ login: '', name: '', pass: genPass(), plan: '1m' as PlanKey, notes: '' });
  const [renewPlan, setRenewPlan] = useState<Record<string, PlanKey>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (fn: () => Promise<{ users: ApiUser[] }>, ok?: string) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const r = await fn();
      setUsers(r.users);
      if (ok) setInfo(ok);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'admin') setAdminToken(null);
      setError(e instanceof Error ? e.message : 'Erro ao falar com o servidor.');
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!session?.token) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiUnlock(session.token, pass);
      setAdminToken(r.adminToken);
      setPass('');
      const l = await apiList(r.adminToken);
      setUsers(l.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desbloquear.');
    } finally {
      setBusy(false);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    const f = form;
    run(() => apiCreate(adminToken, f), `Acesso criado: login "${f.login}", senha "${f.pass}", licença ${planName(f.plan).toLowerCase()}. Anote e envie ao usuário.`).then(() =>
      setForm({ login: '', name: '', pass: genPass(), plan: f.plan, notes: '' }),
    );
  };

  const local = !session || session.local || !session.token;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal users-modal" role="dialog" aria-modal="true" aria-label="Usuários e licenças">
        <header>
          <h2>Usuários e licenças</h2>
          <button className="close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>
        <div className="modal-body">
          {session?.role !== 'owner' ? (
            <p className="login-error">Somente o proprietário do sistema acessa este painel.</p>
          ) : local ? (
            <div className="users-local">
              <p>
                <b>O painel de usuários funciona no site publicado (Hostinger).</b>
              </p>
              <p className="hint">
                Aqui o sistema está rodando sem o servidor PHP (modo local), então as contas não podem ser criadas. Publique o pacote na Hostinger, entre como
                admin e abra este painel por lá.
              </p>
            </div>
          ) : !adminToken ? (
            <form className="users-unlock" onSubmit={unlock}>
              <p>Por segurança, confirme a <b>senha do proprietário</b> para abrir o painel de acessos.</p>
              <input type="password" autoFocus autoComplete="current-password" placeholder="Senha do proprietário" value={pass} onChange={(e) => setPass(e.target.value)} />
              <button className="primary-btn" disabled={busy || !pass}>
                {busy ? 'Verificando…' : 'Desbloquear painel'}
              </button>
              {error && <p className="login-error">{error}</p>}
            </form>
          ) : (
            <>
              {error && <p className="login-error">{error}</p>}
              {info && <p className="done">✓ {info}</p>}
              <div className="users-stats">
                <div><b>{users.filter((u) => u.role !== 'owner').length}</b><span>usuários</span></div>
                <div><b>{users.filter((u) => u.role !== 'owner' && u.active && (u.daysLeft === null || u.daysLeft >= 0)).length}</b><span>ativos</span></div>
                <div><b>{users.filter((u) => u.role !== 'owner' && u.daysLeft !== null && u.daysLeft >= 0 && u.daysLeft <= 7).length}</b><span>vencendo em 7 dias</span></div>
                <div><b>{users.filter((u) => u.role !== 'owner' && u.daysLeft !== null && u.daysLeft < 0).length}</b><span>vencidos</span></div>
              </div>
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Licença</th>
                    <th>Situação</th>
                    <th>Último acesso</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.login} className={!u.active ? 'off' : ''}>
                      <td>
                        <b>{u.name}</b>
                        <small>{u.login}{u.notes ? ` • ${u.notes}` : ''}</small>
                      </td>
                      <td>
                        {u.role === 'owner' ? '—' : planName(u.plan)}
                        <small>{u.role === 'owner' ? '' : `criado em ${fmtDate(u.createdAt)}`}</small>
                      </td>
                      <td>
                        <LicenseBadge u={u} />
                      </td>
                      <td>{fmtDateTime(u.lastLogin)}</td>
                      <td className="users-actions">
                        {u.role !== 'owner' && (
                          <>
                            <span className="renew">
                              <select value={renewPlan[u.login] ?? u.plan} onChange={(e) => setRenewPlan({ ...renewPlan, [u.login]: e.target.value as PlanKey })}>
                                {PLANS.map((p) => (
                                  <option key={p.key} value={p.key}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                              <button disabled={busy} title="Soma o período ao vencimento atual (ou a partir de hoje, se já venceu)" onClick={() => run(() => apiUpdate(adminToken, u.login, { plan: renewPlan[u.login] ?? u.plan }), `Licença de ${u.name} renovada.`)}>
                                Renovar
                              </button>
                            </span>
                            <button disabled={busy} onClick={() => run(() => apiUpdate(adminToken, u.login, { active: !u.active }), u.active ? `${u.name} foi inativado.` : `${u.name} foi reativado.`)}>
                              {u.active ? 'Inativar' : 'Ativar'}
                            </button>
                          </>
                        )}
                        <button
                          disabled={busy}
                          onClick={() => {
                            const np = prompt(`Nova senha para ${u.name} (mínimo 6 caracteres):`, u.role === 'owner' ? '' : genPass());
                            if (np) run(() => apiUpdate(adminToken, u.login, { pass: np }), `Senha de ${u.name} alterada${u.role === 'owner' ? '' : `: ${np}`}.`);
                          }}
                        >
                          {u.role === 'owner' ? 'Trocar minha senha' : 'Nova senha'}
                        </button>
                        {u.role !== 'owner' && (
                          <button disabled={busy} className="danger-mini" onClick={() => confirm(`Excluir o acesso de ${u.name}? Essa ação não pode ser desfeita.`) && run(() => apiDelete(adminToken, u.login), `${u.name} foi excluído.`)}>
                            Excluir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <form className="users-new" onSubmit={create}>
                <h3>Novo acesso</h3>
                <div className="users-grid">
                  <label>
                    <span>Nome</span>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do cliente" />
                  </label>
                  <label>
                    <span>Login</span>
                    <input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value.replace(/\s/g, '').toLowerCase() })} placeholder="ex.: joao.silva" required />
                  </label>
                  <label>
                    <span>Senha</span>
                    <span className="pass-row">
                      <input value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} required minLength={6} />
                      <button type="button" onClick={() => setForm({ ...form, pass: genPass() })} title="Gerar outra senha">
                        ↻
                      </button>
                    </span>
                  </label>
                  <label>
                    <span>Licença</span>
                    <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as PlanKey })}>
                      {PLANS.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wide">
                    <span>Observações (pagamento, contato…)</span>
                    <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </label>
                </div>
                <button className="primary-btn" disabled={busy}>
                  Criar acesso
                </button>
              </form>
              <p className="hint">
                O painel fica desbloqueado por 20 minutos. Cada usuário trabalha no próprio computador: os projetos ficam salvos no navegador dele e podem ser
                levados para outro lugar com Salvar / Abrir (.json).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
