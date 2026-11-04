/**
 * Kit de Licenças — cliente JavaScript (ES module, sem dependências).
 * Funciona em qualquer site/app: HTML puro, React, Vue, Svelte…
 *
 *   import { createLicencas } from './licencas.js';
 *   const auth = createLicencas({ url: 'api/auth.php', storageKey: 'meuapp.sessao' });
 *   await auth.login('admin', 'admin2410', true);   // true = manter conectado
 *   const ok = await auth.verificar();                // revalida no servidor (ativo e no prazo)
 */

/** Planos de licença (mesmas chaves do servidor). */
export const PLANOS = [
  { key: '1d', name: '1 dia' },
  { key: '1s', name: '1 semana' },
  { key: '1m', name: '1 mês' },
  { key: '3m', name: 'Trimestral (3 meses)' },
  { key: '6m', name: 'Semestral (6 meses)' },
  { key: '12m', name: 'Anual (12 meses)' },
  { key: 'vitalicio', name: 'Vitalícia' },
];
export const nomePlano = (k) => PLANOS.find((p) => p.key === k)?.name ?? k;

/** Erro devolvido pelo servidor (code: invalid, inactive, expired, locked, admin, forbidden…). */
export class LicencaErro extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Servidor indisponível ou sem PHP (ex.: rodando um servidor de desenvolvimento estático). */
export class SemServidorErro extends Error {}

/** Dias até o vencimento (null = vitalícia; negativo = vencida). */
export function diasRestantes(expires) {
  if (!expires) return null;
  const ms = new Date(expires).getTime() - Date.now();
  return ms < 0 ? Math.floor(ms / 86400000) : Math.ceil(ms / 86400000);
}

/** Senha aleatória legível (sem 0/O, 1/l). */
export function gerarSenha(tamanho = 10) {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(tamanho);
  crypto.getRandomValues(a);
  return [...a].map((n) => abc[n % abc.length]).join('');
}

/**
 * Cria o cliente.
 * @param {{ url?: string, storageKey?: string }} [opcoes]
 */
export function createLicencas(opcoes = {}) {
  const url = opcoes.url ?? 'api/auth.php';
  const KEY = opcoes.storageKey ?? 'kitlicencas.sessao';

  async function call(action, body = {}) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    } catch {
      throw new SemServidorErro('Servidor indisponível.');
    }
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new SemServidorErro('Servidor sem PHP.');
    const data = await res.json();
    if (!data.ok) throw new LicencaErro(data.error ?? 'erro', data.message ?? 'Erro no servidor.');
    return data;
  }

  // ---------- sessão no navegador ----------
  function sessao() {
    try {
      const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function lembrado() {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false;
    }
  }
  function salvarSessao(s, lembrar = lembrado()) {
    try {
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
      (lembrar ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s));
    } catch {
      /* sem armazenamento */
    }
  }
  function sair() {
    try {
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
    } catch {
      /* sem armazenamento */
    }
  }

  return {
    call,
    sessao,
    sair,

    /** Faz login e guarda a sessão. Lança LicencaErro (senha errada, inativo, vencido, bloqueado). */
    async login(user, pass, lembrar = false) {
      const r = await call('login', { user, pass });
      salvarSessao(r.session, lembrar);
      return r.session;
    },

    /**
     * Revalida a sessão no servidor (conta ativa e licença no prazo).
     * Retorna { ok: true, sessao } ou { ok: false, motivo, mensagem } — e limpa a sessão se negado.
     * Se o servidor estiver fora do ar, mantém a sessão (respeitando a validade já conhecida).
     */
    async verificar() {
      const s = sessao();
      if (!s?.token) return { ok: false, motivo: 'sem-sessao', mensagem: 'Entre para continuar.' };
      try {
        const r = await call('me', { token: s.token });
        salvarSessao(r.session);
        return { ok: true, sessao: r.session };
      } catch (e) {
        if (e instanceof LicencaErro) {
          sair();
          return { ok: false, motivo: e.code, mensagem: e.message };
        }
        const d = diasRestantes(s.expires);
        if (d !== null && d < 0) {
          sair();
          return { ok: false, motivo: 'expired', mensagem: 'Sua licença venceu. Fale com o administrador para renovar.' };
        }
        return { ok: true, sessao: s, offline: true };
      }
    },

    /** Verifica de tempos em tempos e chama onBloqueio(mensagem) se a conta for inativada/vencer. */
    vigiar(onBloqueio, intervaloMs = 20 * 60 * 1000) {
      const t = setInterval(async () => {
        const r = await this.verificar();
        if (!r.ok && r.motivo !== 'sem-sessao') onBloqueio(r.mensagem);
      }, intervaloMs);
      return () => clearInterval(t);
    },

    /** Aviso de vencimento: { dias, data, texto, urgente } quando faltar `limiteDias` ou menos. */
    aviso(limiteDias = 7) {
      const s = sessao();
      if (!s || s.role === 'owner') return null;
      const dias = diasRestantes(s.expires);
      if (dias === null || dias > limiteDias) return null;
      const data = new Date(s.expires).toLocaleDateString('pt-BR');
      const texto =
        dias < 0 ? `Sua licença venceu em ${data}.` : dias === 0 ? `Sua licença vence hoje (${data}).` : dias === 1 ? `Sua licença vence amanhã (${data}).` : `Sua licença vence em ${dias} dias (${data}).`;
      return { dias, data, texto, urgente: dias <= 1 };
    },

    // ---------- painel do proprietário ----------
    /** Confirma a senha do proprietário e devolve o adminToken (vale ADMIN_TTL no servidor). */
    async desbloquear(senhaProprietario) {
      const s = sessao();
      const r = await call('unlock', { token: s?.token, pass: senhaProprietario });
      return r.adminToken;
    },
    listar: (adminToken) => call('list', { adminToken }).then((r) => r.users),
    criar: (adminToken, u) => call('create', { adminToken, ...u }).then((r) => r.users),
    /** patch: { name, notes, active, pass, plan, fromToday } — plan renova (soma ao vencimento atual). */
    alterar: (adminToken, login, patch) => call('update', { adminToken, login, ...patch }).then((r) => r.users),
    excluir: (adminToken, login) => call('delete', { adminToken, login }).then((r) => r.users),
  };
}
