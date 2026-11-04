/**
 * Kit de Licenças — componentes React (opcional).
 *
 *   import { createLicencas } from '../cliente/licencas.js';
 *   import { LoginGate, LicenseBanner, UsersPanel } from './LicencasReact';
 *   import '../cliente/kit-licencas.css';
 *   const auth = createLicencas({ url: 'api/auth.php' });
 *
 *   <LoginGate auth={auth} titulo="Meu Sistema">
 *     <LicenseBanner auth={auth} />
 *     <MeuApp />                       // dentro dele: {auth.sessao()?.role === 'owner' && <UsersPanel auth={auth} onClose={...} />}
 *   </LoginGate>
 */
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { type Licencas, type PlanoKey, type Usuario, PLANOS, diasRestantes, gerarSenha, nomePlano } from '../cliente/licencas.js';

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const fmtDataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

/** Mostra o login até entrar; revalida a sessão e bloqueia se a conta for inativada/vencer. */
export function LoginGate({ auth, children, titulo = 'Entrar', subtitulo = 'Entre para acessar o sistema' }: { auth: Licencas; children: ReactNode; titulo?: string; subtitulo?: string }) {
  const [estado, setEstado] = useState<'verificando' | 'login' | 'ok'>(() => (auth.sessao() ? 'verificando' : 'login'));
  const [aviso, setAviso] = useState('');
  const [bloqueio, setBloqueio] = useState('');
  const [form, setForm] = useState({ user: '', pass: '', lembrar: false });
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!auth.sessao()) return;
    auth.verificar().then((r) => {
      if (r.ok) setEstado('ok');
      else {
        setAviso(r.mensagem);
        setEstado('login');
      }
    });
  }, [auth]);
  useEffect(() => (estado === 'ok' ? auth.vigiar(setBloqueio) : undefined), [auth, estado]);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setAviso('');
    try {
      await auth.login(form.user.trim(), form.pass, form.lembrar);
      setEstado('ok');
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'Não foi possível entrar.');
      setForm({ ...form, pass: '' });
    } finally {
      setOcupado(false);
    }
  };

  if (estado === 'verificando') return <div className="lk-page"><div className="lk-card"><p className="lk-sub">Verificando acesso…</p></div></div>;
  if (estado === 'login')
    return (
      <div className="lk-page">
        <form className="lk-card" onSubmit={entrar}>
          <h1 className="lk-title">{titulo}</h1>
          <p className="lk-sub">{subtitulo}</p>
          <label>
            Usuário
            <input autoFocus autoComplete="username" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
          </label>
          <label>
            Senha
            <input type="password" autoComplete="current-password" value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} />
          </label>
          <label className="lk-remember">
            <input type="checkbox" checked={form.lembrar} onChange={(e) => setForm({ ...form, lembrar: e.target.checked })} /> Manter conectado neste computador
          </label>
          {aviso && <div className="lk-error">{aviso}</div>}
          <button className="lk-btn lk-primary" disabled={ocupado}>
            {ocupado ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    );
  return (
    <>
      {children}
      {bloqueio &&
        createPortal(
          <div className="lk-backdrop">
            <div className="lk-card">
              <h1 className="lk-title">Acesso bloqueado</h1>
              <div className="lk-error">{bloqueio}</div>
              <button
                className="lk-btn lk-primary"
                onClick={() => {
                  auth.sair();
                  location.reload();
                }}
              >
                Voltar ao login
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Faixa de aviso quando faltar `limiteDias` ou menos para vencer. */
export function LicenseBanner({ auth, limiteDias = 7 }: { auth: Licencas; limiteDias?: number }) {
  const [fechado, setFechado] = useState(false);
  const a = auth.aviso(limiteDias);
  if (!a || fechado) return null;
  return (
    <div className={`lk-banner ${a.urgente ? 'lk-urgent' : ''}`} role="status">
      <span>⚠ {a.texto} Fale com o administrador para renovar e não perder o acesso.</span>
      <button onClick={() => setFechado(true)} aria-label="Fechar">
        ✕
      </button>
    </div>
  );
}

function Badge({ u }: { u: Usuario }) {
  if (u.role === 'owner') return <span className="lk-badge lk-badge-owner">Proprietário</span>;
  if (!u.active) return <span className="lk-badge lk-badge-off">Inativo</span>;
  if (u.expires === null) return <span className="lk-badge lk-badge-ok">Vitalícia</span>;
  const d = diasRestantes(u.expires) ?? 0;
  if (d < 0) return <span className="lk-badge lk-badge-off">Vencida em {fmtData(u.expires)}</span>;
  if (d <= 7) return <span className="lk-badge lk-badge-warn">Vence em {d === 0 ? 'hoje' : `${d} dia${d > 1 ? 's' : ''}`}</span>;
  return <span className="lk-badge lk-badge-ok">Até {fmtData(u.expires)}</span>;
}

/** Painel de usuários e licenças — só o proprietário, sempre confirmando a senha. */
export function UsersPanel({ auth, onClose }: { auth: Licencas; onClose: () => void }) {
  const sessao = auth.sessao();
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [users, setUsers] = useState<Usuario[]>([]);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [novo, setNovo] = useState({ login: '', name: '', pass: gerarSenha(), plan: '1m' as PlanoKey, notes: '' });
  const [planos, setPlanos] = useState<Record<string, PlanoKey>>({});

  const run = async (fn: () => Promise<Usuario[]>, msg = '') => {
    setOcupado(true);
    setErro('');
    setOk('');
    try {
      setUsers(await fn());
      setOk(msg);
    } catch (e) {
      if ((e as { code?: string }).code === 'admin') setAdminToken(null);
      setErro(e instanceof Error ? e.message : 'Erro no servidor.');
    } finally {
      setOcupado(false);
    }
  };

  const desbloquear = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setErro('');
    try {
      const t = await auth.desbloquear(senha);
      setAdminToken(t);
      setSenha('');
      setUsers(await auth.listar(t));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível desbloquear.');
    } finally {
      setOcupado(false);
    }
  };

  const comuns = users.filter((u) => u.role !== 'owner');
  const conteudo =
    sessao?.role !== 'owner' ? (
      <p className="lk-error">Somente o proprietário do sistema acessa este painel.</p>
    ) : !adminToken ? (
      <form className="lk-unlock" onSubmit={desbloquear}>
        <p>
          Por segurança, confirme a <b>senha do proprietário</b> para abrir o painel.
        </p>
        <input type="password" autoFocus autoComplete="current-password" placeholder="Senha do proprietário" value={senha} onChange={(e) => setSenha(e.target.value)} />
        <button className="lk-btn lk-primary" disabled={ocupado || !senha}>
          Desbloquear painel
        </button>
        {erro && <div className="lk-error">{erro}</div>}
      </form>
    ) : (
      <>
        {erro && <p className="lk-error">{erro}</p>}
        {ok && <p className="lk-ok">✓ {ok}</p>}
        <div className="lk-stats">
          <div><b>{comuns.length}</b><span>usuários</span></div>
          <div><b>{comuns.filter((u) => u.active && (u.expires === null || (diasRestantes(u.expires) ?? 0) >= 0)).length}</b><span>ativos</span></div>
          <div><b>{comuns.filter((u) => u.expires && (diasRestantes(u.expires) ?? 0) >= 0 && (diasRestantes(u.expires) ?? 0) <= 7).length}</b><span>vencendo em 7 dias</span></div>
          <div><b>{comuns.filter((u) => u.expires && (diasRestantes(u.expires) ?? 0) < 0).length}</b><span>vencidos</span></div>
        </div>
        <table className="lk-table">
          <thead>
            <tr><th>Usuário</th><th>Licença</th><th>Situação</th><th>Último acesso</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.login} className={u.active ? '' : 'lk-off'}>
                <td><b>{u.name}</b><small>{u.login}{u.notes ? ` • ${u.notes}` : ''}</small></td>
                <td>{u.role === 'owner' ? '—' : nomePlano(u.plan)}<small>{u.role === 'owner' ? '' : `criado em ${fmtData(u.createdAt)}`}</small></td>
                <td><Badge u={u} /></td>
                <td>{fmtDataHora(u.lastLogin)}</td>
                <td className="lk-actions">
                  {u.role !== 'owner' && (
                    <>
                      <select value={planos[u.login] ?? u.plan} onChange={(e) => setPlanos({ ...planos, [u.login]: e.target.value as PlanoKey })}>
                        {PLANOS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                      </select>
                      <button className="lk-btn" disabled={ocupado} onClick={() => run(() => auth.alterar(adminToken, u.login, { plan: planos[u.login] ?? u.plan }), `Licença de ${u.name} renovada.`)}>Renovar</button>
                      <button className="lk-btn" disabled={ocupado} onClick={() => run(() => auth.alterar(adminToken, u.login, { active: !u.active }), u.active ? `${u.name} foi inativado.` : `${u.name} foi reativado.`)}>{u.active ? 'Inativar' : 'Ativar'}</button>
                    </>
                  )}
                  <button
                    className="lk-btn"
                    disabled={ocupado}
                    onClick={() => {
                      const np = prompt(`Nova senha para ${u.name} (mínimo 6 caracteres):`, u.role === 'owner' ? '' : gerarSenha());
                      if (np) run(() => auth.alterar(adminToken, u.login, { pass: np }), `Senha de ${u.name} alterada${u.role === 'owner' ? '' : `: ${np}`}.`);
                    }}
                  >
                    {u.role === 'owner' ? 'Trocar minha senha' : 'Nova senha'}
                  </button>
                  {u.role !== 'owner' && (
                    <button className="lk-btn lk-danger" disabled={ocupado} onClick={() => confirm(`Excluir o acesso de ${u.name}?`) && run(() => auth.excluir(adminToken, u.login), `${u.name} foi excluído.`)}>Excluir</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          className="lk-new"
          onSubmit={(e) => {
            e.preventDefault();
            const n = novo;
            run(() => auth.criar(adminToken, n), `Acesso criado: login "${n.login}", senha "${n.pass}", licença ${nomePlano(n.plan).toLowerCase()}.`).then(() => setNovo({ login: '', name: '', pass: gerarSenha(), plan: n.plan, notes: '' }));
          }}
        >
          <h3>Novo acesso</h3>
          <div className="lk-grid">
            <label className="lk-field">Nome<input value={novo.name} onChange={(e) => setNovo({ ...novo, name: e.target.value })} /></label>
            <label className="lk-field">Login<input value={novo.login} required onChange={(e) => setNovo({ ...novo, login: e.target.value.replace(/\s/g, '').toLowerCase() })} /></label>
            <label className="lk-field">
              Senha
              <span className="lk-pass">
                <input value={novo.pass} required minLength={6} onChange={(e) => setNovo({ ...novo, pass: e.target.value })} />
                <button type="button" className="lk-btn" onClick={() => setNovo({ ...novo, pass: gerarSenha() })}>↻</button>
              </span>
            </label>
            <label className="lk-field">
              Licença
              <select value={novo.plan} onChange={(e) => setNovo({ ...novo, plan: e.target.value as PlanoKey })}>
                {PLANOS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
              </select>
            </label>
            <label className="lk-field lk-wide">Observações<input value={novo.notes} onChange={(e) => setNovo({ ...novo, notes: e.target.value })} /></label>
          </div>
          <button className="lk-btn lk-primary" disabled={ocupado}>Criar acesso</button>
        </form>
      </>
    );

  return createPortal(
    <div className="lk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lk-panel" role="dialog" aria-label="Usuários e licenças">
        <header>
          <h2>Usuários e licenças</h2>
          <button className="lk-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        <div className="lk-body">{conteudo}</div>
      </div>
    </div>,
    document.body,
  );
}
