import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { ApiError, NoServerError, apiLogin, apiMe, daysLeft } from '../auth/api';
import { type Session, clearSession, getSession, setSession } from '../auth/session';
import { APP_VERSION } from '../version';

/** Senha do modo local (sem servidor PHP, ex.: rodando com "pnpm dev"). No site, vale a conta do servidor. */
const LOCAL_USER = 'admin';
const LOCAL_PASS = 'admin2410';
const RECHECK_MS = 20 * 60 * 1000;

export function logout() {
  clearSession();
  location.reload();
}

const remembered = () => {
  try {
    return !!localStorage.getItem('planta3d.session');
  } catch {
    return false;
  }
};

/** Confere no servidor se a conta continua ativa e dentro da validade. */
async function revalidate(s: Session): Promise<{ ok: true; session: Session } | { ok: false; message: string }> {
  if (s.local || !s.token) return { ok: true, session: s };
  try {
    const r = await apiMe(s.token);
    return { ok: true, session: r.session };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, message: e.message };
    // servidor fora do ar: mantém a sessão, mas respeita a validade já conhecida
    const d = daysLeft(s.expires);
    if (d !== null && d < 0) return { ok: false, message: 'Sua licença venceu. Fale com o administrador para renovar.' };
    return { ok: true, session: s };
  }
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'login' | 'ok'>(() => (getSession() ? 'checking' : 'login'));
  const [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState('');

  useEffect(() => {
    const s = getSession();
    if (!s) return;
    let alive = true;
    revalidate(s).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setSession(r.session, remembered());
        setState('ok');
      } else {
        clearSession();
        setNotice(r.message);
        setState('login');
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // checagem periódica: inativação ou vencimento durante o uso bloqueiam a tela
  useEffect(() => {
    if (state !== 'ok') return;
    const t = setInterval(async () => {
      const s = getSession();
      if (!s) return;
      const r = await revalidate(s);
      if (r.ok) setSession(r.session, remembered());
      else setBlocked(r.message);
    }, RECHECK_MS);
    return () => clearInterval(t);
  }, [state]);

  if (state === 'checking') return <div className="login-page"><div className="login-card"><p className="login-sub">Verificando acesso…</p></div></div>;
  if (state === 'login') return <LoginForm notice={notice} />;
  return (
    <>
      {children}
      {blocked && (
        <div className="modal-backdrop">
          <div className="login-card blocked-card">
            <div className="login-brand">
              <b>Acesso</b> <span>bloqueado</span>
            </div>
            <p className="login-error">{blocked}</p>
            <p className="login-sub">Salve seu projeto (.json) antes de sair, se precisar.</p>
            <button type="submit" onClick={logout}>
              Voltar ao login
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function LoginForm({ notice }: { notice: string }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState(notice);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await apiLogin(user.trim(), pass);
      setSession(r.session, remember);
      location.reload();
    } catch (err) {
      if (err instanceof NoServerError) {
        // sem servidor (desenvolvimento ou arquivo local): só a conta do proprietário
        if (user.trim().toLowerCase() === LOCAL_USER && pass === LOCAL_PASS) {
          setSession({ user: 'admin', name: 'Proprietário', role: 'owner', expires: null, local: true }, remember);
          location.reload();
          return;
        }
        setError('Usuário ou senha incorretos.');
      } else setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      setPass('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <b>Planta3D</b> <span>Casas</span>
          <small>v{APP_VERSION}</small>
        </div>
        <p className="login-sub">Entre para acessar o sistema</p>
        <label>
          <span>Usuário</span>
          <input autoFocus autoComplete="username" value={user} onChange={(e) => { setUser(e.target.value); setError(''); }} />
        </label>
        <label>
          <span>Senha</span>
          <input type="password" autoComplete="current-password" value={pass} onChange={(e) => { setPass(e.target.value); setError(''); }} />
        </label>
        <label className="login-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Manter conectado neste computador</span>
        </label>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

/** Aviso de licença perto do vencimento (7 dias, ou sempre para planos curtos). */
export function LicenseBanner() {
  const s = getSession();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('planta3d.banner') === new Date().toDateString();
    } catch {
      return false;
    }
  });
  if (!s || s.role === 'owner' || hidden) return null;
  const d = daysLeft(s.expires);
  if (d === null || d > 7) return null;
  const date = new Date(s.expires!).toLocaleDateString('pt-BR');
  const text = d < 0 ? `Sua licença venceu em ${date}.` : d === 0 ? `Sua licença vence hoje (${date}).` : d === 1 ? `Sua licença vence amanhã (${date}).` : `Sua licença vence em ${d} dias (${date}).`;
  return (
    <div className={`license-banner ${d <= 1 ? 'urgent' : ''}`} role="status">
      <span>⚠ {text} Fale com o administrador do sistema para renovar e não perder o acesso.</span>
      <button
        onClick={() => {
          try {
            sessionStorage.setItem('planta3d.banner', new Date().toDateString());
          } catch {
            /* sem armazenamento */
          }
          setHidden(true);
        }}
        aria-label="Fechar aviso"
      >
        ✕
      </button>
    </div>
  );
}
