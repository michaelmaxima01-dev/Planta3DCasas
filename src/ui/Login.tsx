import { type FormEvent, type ReactNode, useState } from 'react';
import { APP_VERSION } from '../version';

/**
 * Acesso simples por usuário e senha.
 * Observação: é uma trava de acesso feita no navegador (o site é estático, sem servidor),
 * suficiente para impedir uso casual — não substitui um login com servidor.
 */
const USER = 'admin';
const PASS = 'admin2410';
const KEY = 'planta3d.auth';

function readAuth(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1' || localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function logout() {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    /* navegador sem armazenamento */
  }
  location.reload();
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(readAuth);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');

  if (ok) return <>{children}</>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (user.trim().toLowerCase() === USER && pass === PASS) {
      try {
        (remember ? localStorage : sessionStorage).setItem(KEY, '1');
      } catch {
        /* segue sem lembrar */
      }
      setOk(true);
    } else {
      setError('Usuário ou senha incorretos.');
      setPass('');
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
        <button type="submit">Entrar</button>
      </form>
    </div>
  );
}
