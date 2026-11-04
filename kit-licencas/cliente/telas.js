/**
 * Kit de Licenças — telas prontas em JavaScript puro (sem framework).
 *
 *   import { createLicencas } from './licencas.js';
 *   import { protegerApp, mostrarAviso, abrirPainelUsuarios } from './telas.js';
 *   const auth = createLicencas({ url: 'api/auth.php' });
 *   protegerApp(auth, { titulo: 'Meu Sistema', onEntrar: (sessao) => iniciarMeuApp(sessao) });
 *
 * Requer kit-licencas.css.
 */
import { PLANOS, diasRestantes, gerarSenha, nomePlano } from './licencas.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtData = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const fmtDataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');
const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

/**
 * Mostra a tela de login até o usuário entrar; depois chama onEntrar(sessao).
 * Revalida a sessão salva ao abrir e vigia inativação/vencimento durante o uso.
 */
export async function protegerApp(auth, { titulo = 'Entrar', subtitulo = 'Entre para acessar o sistema', onEntrar, container = document.body } = {}) {
  const tela = el(`<div class="lk-page"><div class="lk-card"><p class="lk-sub">Verificando acesso…</p></div></div>`);
  container.appendChild(tela);
  let aviso = '';
  if (auth.sessao()) {
    const r = await auth.verificar();
    if (r.ok) {
      tela.remove();
      iniciar(r.sessao);
      return;
    }
    aviso = r.mensagem;
  }
  tela.innerHTML = `
    <form class="lk-card">
      <h1 class="lk-title">${esc(titulo)}</h1>
      <p class="lk-sub">${esc(subtitulo)}</p>
      <label>Usuário<input name="u" autocomplete="username" autofocus></label>
      <label>Senha<input name="p" type="password" autocomplete="current-password"></label>
      <label class="lk-remember"><input name="r" type="checkbox"> Manter conectado neste computador</label>
      <div class="lk-error" ${aviso ? '' : 'hidden'}>${esc(aviso)}</div>
      <button class="lk-btn lk-primary">Entrar</button>
    </form>`;
  const form = tela.querySelector('form');
  const erro = tela.querySelector('.lk-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      const s = await auth.login(form.u.value.trim(), form.p.value, form.r.checked);
      tela.remove();
      iniciar(s);
    } catch (err) {
      erro.hidden = false;
      erro.textContent = err.message;
      form.p.value = '';
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  function iniciar(sessao) {
    onEntrar?.(sessao);
    mostrarAviso(auth);
    auth.vigiar((mensagem) => bloquear(auth, mensagem));
  }
}

/** Tela de bloqueio (conta inativada ou licença vencida durante o uso). */
export function bloquear(auth, mensagem) {
  const b = el(`<div class="lk-backdrop"><div class="lk-card"><h1 class="lk-title">Acesso bloqueado</h1><div class="lk-error"></div><button class="lk-btn lk-primary">Voltar ao login</button></div></div>`);
  b.querySelector('.lk-error').textContent = mensagem;
  b.querySelector('button').onclick = () => {
    auth.sair();
    location.reload();
  };
  document.body.appendChild(b);
}

/** Faixa de aviso de vencimento (some ao fechar até o dia seguinte). */
export function mostrarAviso(auth, limiteDias = 7) {
  const a = auth.aviso(limiteDias);
  const chave = 'kitlicencas.aviso';
  try {
    if (!a || sessionStorage.getItem(chave) === new Date().toDateString()) return;
  } catch {
    if (!a) return;
  }
  const b = el(`<div class="lk-banner ${a.urgente ? 'lk-urgent' : ''}" role="status"><span></span><button aria-label="Fechar">✕</button></div>`);
  b.querySelector('span').textContent = `⚠ ${a.texto} Fale com o administrador para renovar e não perder o acesso.`;
  b.querySelector('button').onclick = () => {
    try {
      sessionStorage.setItem(chave, new Date().toDateString());
    } catch {
      /* sem armazenamento */
    }
    b.remove();
  };
  document.body.appendChild(b);
}

function badge(u) {
  if (u.role === 'owner') return '<span class="lk-badge lk-badge-owner">Proprietário</span>';
  if (!u.active) return '<span class="lk-badge lk-badge-off">Inativo</span>';
  if (u.expires === null) return '<span class="lk-badge lk-badge-ok">Vitalícia</span>';
  const d = diasRestantes(u.expires);
  if (d < 0) return `<span class="lk-badge lk-badge-off">Vencida em ${fmtData(u.expires)}</span>`;
  if (d <= 7) return `<span class="lk-badge lk-badge-warn">Vence em ${d === 0 ? 'hoje' : `${d} dia${d > 1 ? 's' : ''}`}</span>`;
  return `<span class="lk-badge lk-badge-ok">Até ${fmtData(u.expires)}</span>`;
}

/** Painel de usuários e licenças (só abre para o proprietário, pedindo a senha dele). */
export function abrirPainelUsuarios(auth) {
  const s = auth.sessao();
  const root = el(`<div class="lk-backdrop"><div class="lk-panel" role="dialog" aria-label="Usuários e licenças"><header><h2>Usuários e licenças</h2><button class="lk-btn" data-x>✕</button></header><div class="lk-body"></div></div></div>`);
  const body = root.querySelector('.lk-body');
  const fechar = () => root.remove();
  root.querySelector('[data-x]').onclick = fechar;
  root.addEventListener('mousedown', (e) => e.target === root && fechar());
  document.body.appendChild(root);
  let adminToken = null;
  let users = [];
  let msg = { ok: '', erro: '' };

  if (s?.role !== 'owner') {
    body.innerHTML = '<p class="lk-error">Somente o proprietário do sistema acessa este painel.</p>';
    return;
  }

  const run = async (fn, ok) => {
    msg = { ok: '', erro: '' };
    try {
      users = await fn();
      msg.ok = ok ?? '';
    } catch (e) {
      if (e.code === 'admin') adminToken = null;
      msg.erro = e.message;
    }
    render();
  };

  function telaDesbloqueio() {
    body.innerHTML = `
      <form class="lk-unlock">
        <p>Por segurança, confirme a <b>senha do proprietário</b> para abrir o painel.</p>
        <input type="password" autocomplete="current-password" placeholder="Senha do proprietário" autofocus>
        <button class="lk-btn lk-primary">Desbloquear painel</button>
        <div class="lk-error" ${msg.erro ? '' : 'hidden'}>${esc(msg.erro)}</div>
      </form>`;
    const f = body.querySelector('form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        adminToken = await auth.desbloquear(f.querySelector('input').value);
        users = await auth.listar(adminToken);
        msg = { ok: '', erro: '' };
      } catch (err) {
        msg.erro = err.message;
      }
      render();
    };
  }

  function render() {
    if (!adminToken) return telaDesbloqueio();
    const comuns = users.filter((u) => u.role !== 'owner');
    const ativos = comuns.filter((u) => u.active && (u.expires === null || diasRestantes(u.expires) >= 0)).length;
    const vencendo = comuns.filter((u) => u.expires && diasRestantes(u.expires) >= 0 && diasRestantes(u.expires) <= 7).length;
    const vencidos = comuns.filter((u) => u.expires && diasRestantes(u.expires) < 0).length;
    const opts = (sel) => PLANOS.map((p) => `<option value="${p.key}" ${p.key === sel ? 'selected' : ''}>${p.name}</option>`).join('');
    body.innerHTML = `
      ${msg.erro ? `<p class="lk-error">${esc(msg.erro)}</p>` : ''}
      ${msg.ok ? `<p class="lk-ok">✓ ${esc(msg.ok)}</p>` : ''}
      <div class="lk-stats">
        <div><b>${comuns.length}</b><span>usuários</span></div>
        <div><b>${ativos}</b><span>ativos</span></div>
        <div><b>${vencendo}</b><span>vencendo em 7 dias</span></div>
        <div><b>${vencidos}</b><span>vencidos</span></div>
      </div>
      <table class="lk-table">
        <thead><tr><th>Usuário</th><th>Licença</th><th>Situação</th><th>Último acesso</th><th>Ações</th></tr></thead>
        <tbody>${users
          .map(
            (u) => `<tr class="${u.active ? '' : 'lk-off'}" data-login="${esc(u.login)}">
              <td><b>${esc(u.name)}</b><small>${esc(u.login)}${u.notes ? ` • ${esc(u.notes)}` : ''}</small></td>
              <td>${u.role === 'owner' ? '—' : esc(nomePlano(u.plan))}<small>${u.role === 'owner' ? '' : `criado em ${fmtData(u.createdAt)}`}</small></td>
              <td>${badge(u)}</td>
              <td>${fmtDataHora(u.lastLogin)}</td>
              <td class="lk-actions">${
                u.role === 'owner'
                  ? '<button class="lk-btn" data-a="senha">Trocar minha senha</button>'
                  : `<select data-plano>${opts(u.plan)}</select><button class="lk-btn" data-a="renovar">Renovar</button>
                     <button class="lk-btn" data-a="ativo">${u.active ? 'Inativar' : 'Ativar'}</button>
                     <button class="lk-btn" data-a="senha">Nova senha</button>
                     <button class="lk-btn lk-danger" data-a="excluir">Excluir</button>`
              }</td></tr>`,
          )
          .join('')}</tbody>
      </table>
      <form class="lk-new">
        <h3>Novo acesso</h3>
        <div class="lk-grid">
          <label class="lk-field">Nome<input name="name" placeholder="Nome do cliente"></label>
          <label class="lk-field">Login<input name="login" placeholder="ex.: joao.silva" required></label>
          <label class="lk-field">Senha<span class="lk-pass"><input name="pass" value="${gerarSenha()}" required minlength="6"><button type="button" class="lk-btn" data-gerar>↻</button></span></label>
          <label class="lk-field">Licença<select name="plan">${opts('1m')}</select></label>
          <label class="lk-field lk-wide">Observações (pagamento, contato…)<input name="notes"></label>
        </div>
        <button class="lk-btn lk-primary">Criar acesso</button>
      </form>
      <p class="lk-hint">O painel fica desbloqueado por alguns minutos (ADMIN_TTL no servidor).</p>`;

    body.querySelectorAll('tr[data-login]').forEach((tr) => {
      const u = users.find((x) => x.login === tr.dataset.login);
      tr.querySelectorAll('[data-a]').forEach((b) => {
        b.onclick = () => {
          const a = b.dataset.a;
          if (a === 'renovar') run(() => auth.alterar(adminToken, u.login, { plan: tr.querySelector('[data-plano]').value }), `Licença de ${u.name} renovada.`);
          if (a === 'ativo') run(() => auth.alterar(adminToken, u.login, { active: !u.active }), u.active ? `${u.name} foi inativado.` : `${u.name} foi reativado.`);
          if (a === 'senha') {
            const np = prompt(`Nova senha para ${u.name} (mínimo 6 caracteres):`, u.role === 'owner' ? '' : gerarSenha());
            if (np) run(() => auth.alterar(adminToken, u.login, { pass: np }), `Senha de ${u.name} alterada${u.role === 'owner' ? '' : `: ${np}`}.`);
          }
          if (a === 'excluir' && confirm(`Excluir o acesso de ${u.name}?`)) run(() => auth.excluir(adminToken, u.login), `${u.name} foi excluído.`);
        };
      });
    });
    const f = body.querySelector('.lk-new');
    f.querySelector('[data-gerar]').onclick = () => (f.pass.value = gerarSenha());
    f.login.oninput = () => (f.login.value = f.login.value.replace(/\s/g, '').toLowerCase());
    f.onsubmit = (e) => {
      e.preventDefault();
      const u = { login: f.login.value.trim(), name: f.name.value.trim(), pass: f.pass.value, plan: f.plan.value, notes: f.notes.value.trim() };
      run(() => auth.criar(adminToken, u), `Acesso criado: login "${u.login}", senha "${u.pass}", licença ${nomePlano(u.plan).toLowerCase()}. Anote e envie ao usuário.`);
    };
  }

  render();
}
