/** Tipos do cliente do Kit de Licenças (licencas.js). */
export type PlanoKey = '1d' | '1s' | '1m' | '3m' | '6m' | '12m' | 'vitalicio';

export interface Sessao {
  user: string;
  name: string;
  role: 'owner' | 'user';
  /** Vencimento ISO, ou null = vitalícia. */
  expires: string | null;
  token: string;
}

export interface Usuario {
  login: string;
  name: string;
  role: 'owner' | 'user';
  active: boolean;
  plan: PlanoKey;
  expires: string | null;
  daysLeft: number | null;
  createdAt: string;
  lastLogin: string | null;
  notes: string;
}

export type Verificacao = { ok: true; sessao: Sessao; offline?: boolean } | { ok: false; motivo: string; mensagem: string };

export interface Licencas {
  call<T = Record<string, unknown>>(action: string, body?: Record<string, unknown>): Promise<T>;
  sessao(): Sessao | null;
  sair(): void;
  login(user: string, pass: string, lembrar?: boolean): Promise<Sessao>;
  verificar(): Promise<Verificacao>;
  vigiar(onBloqueio: (mensagem: string) => void, intervaloMs?: number): () => void;
  aviso(limiteDias?: number): { dias: number; data: string; texto: string; urgente: boolean } | null;
  desbloquear(senhaProprietario: string): Promise<string>;
  listar(adminToken: string): Promise<Usuario[]>;
  criar(adminToken: string, u: { login: string; name: string; pass: string; plan: PlanoKey; notes?: string }): Promise<Usuario[]>;
  alterar(adminToken: string, login: string, patch: Partial<{ name: string; notes: string; active: boolean; pass: string; plan: PlanoKey; fromToday: boolean }>): Promise<Usuario[]>;
  excluir(adminToken: string, login: string): Promise<Usuario[]>;
}

export const PLANOS: { key: PlanoKey; name: string }[];
export function nomePlano(k: string): string;
export function diasRestantes(expires: string | null): number | null;
export function gerarSenha(tamanho?: number): string;
export function createLicencas(opcoes?: { url?: string; storageKey?: string }): Licencas;
export class LicencaErro extends Error {
  code: string;
  constructor(code: string, message: string);
}
export class SemServidorErro extends Error {}
