/** Sessão do usuário logado (preenchida pela tela de login). */
export interface Session {
  user: string;
  name: string;
  role: 'owner' | 'user';
  /** Validade da licença (ISO) ou null = vitalícia. */
  expires: string | null;
  token?: string;
  /** Sem servidor (modo local / desenvolvimento). */
  local?: boolean;
}

const KEY = 'planta3d.session';

export function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session, remember: boolean) {
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento */
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
    localStorage.removeItem('planta3d.auth');
    sessionStorage.removeItem('planta3d.auth');
  } catch {
    /* sem armazenamento */
  }
}

/** Login do usuário atual (para separar os dados salvos no navegador por usuário). */
export const currentUser = () => getSession()?.user ?? 'local';
