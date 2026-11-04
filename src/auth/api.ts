/** Cliente da API de contas (api/auth.php, roda no servidor PHP da hospedagem). */
import type { Session } from './session';

export interface ApiUser {
  login: string;
  name: string;
  role: 'owner' | 'user';
  active: boolean;
  plan: PlanKey;
  expires: string | null;
  daysLeft: number | null;
  createdAt: string;
  lastLogin: string | null;
  notes: string;
}

export type PlanKey = '1d' | '1s' | '1m' | '3m' | '6m' | '12m' | 'vitalicio';
export const PLANS: { key: PlanKey; name: string }[] = [
  { key: '1d', name: '1 dia' },
  { key: '1s', name: '1 semana' },
  { key: '1m', name: '1 mês' },
  { key: '3m', name: 'Trimestral (3 meses)' },
  { key: '6m', name: 'Semestral (6 meses)' },
  { key: '12m', name: 'Anual (12 meses)' },
  { key: 'vitalicio', name: 'Vitalícia' },
];
export const planName = (k: string) => PLANS.find((p) => p.key === k)?.name ?? k;

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Erro de rede/servidor sem PHP (ex.: rodando com "pnpm dev"): o login cai no modo local. */
export class NoServerError extends Error {}

const URL = 'api/auth.php';

export async function call<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  } catch {
    throw new NoServerError('sem servidor');
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new NoServerError('sem PHP');
  const data = (await res.json()) as { ok: boolean; error?: string; message?: string } & T;
  if (!data.ok) throw new ApiError(data.error ?? 'erro', data.message ?? 'Erro no servidor.');
  return data;
}

export const apiLogin = (user: string, pass: string) => call<{ session: Session }>('login', { user, pass });
export const apiMe = (token: string) => call<{ session: Session }>('me', { token });
export const apiUnlock = (token: string, pass: string) => call<{ adminToken: string }>('unlock', { token, pass });
export const apiList = (adminToken: string) => call<{ users: ApiUser[] }>('list', { adminToken });
export const apiCreate = (adminToken: string, u: { login: string; name: string; pass: string; plan: PlanKey; notes: string }) => call<{ users: ApiUser[] }>('create', { adminToken, ...u });
export const apiUpdate = (adminToken: string, login: string, patch: Partial<{ name: string; notes: string; active: boolean; pass: string; plan: PlanKey; fromToday: boolean }>) =>
  call<{ users: ApiUser[] }>('update', { adminToken, login, ...patch });
export const apiDelete = (adminToken: string, login: string) => call<{ users: ApiUser[] }>('delete', { adminToken, login });

/** Dias até o vencimento (null = vitalícia). */
export function daysLeft(expires: string | null): number | null {
  if (!expires) return null;
  const ms = new Date(expires).getTime() - Date.now();
  return ms < 0 ? Math.floor(ms / 86400000) : Math.ceil(ms / 86400000);
}
