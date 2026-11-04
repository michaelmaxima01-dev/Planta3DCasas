# Kit de Licenças

Login, senha, criação de acessos e licenças com validade, em um kit independente para reaproveitar em qualquer projeto web.

- **Servidor:** um único arquivo PHP (7.4+), sem banco de dados. Funciona em hospedagem compartilhada (Hostinger, Locaweb, KingHost…).
- **Cliente:** JavaScript puro (ES module), sem dependências. Serve para HTML puro, React, Vue, Svelte e outros.
- **Telas prontas:** login, aviso de vencimento, tela de bloqueio e painel do proprietário, em duas versões: JavaScript puro e React.

## O que ele faz

| Recurso | Como funciona |
|---|---|
| Login e senha | Senhas guardadas com `password_hash` (bcrypt). A sessão usa um token assinado (HMAC-SHA256) com validade de 12 h. |
| Proprietário | Conta `owner` criada na primeira execução. Só ela vê e abre o painel de usuários. |
| Painel protegido | Para abrir o painel, o proprietário precisa digitar a senha de novo. O painel fica desbloqueado por 20 min (`ADMIN_TTL`). |
| Acessos | Criar, renovar, inativar/ativar, trocar senha e excluir. Também há campo de observações (pagamento, contato…). |
| Licenças | 1 dia, 1 semana, 1 mês, trimestral, semestral, anual e vitalícia. **Renovar** soma o período ao vencimento atual. |
| Vencimento | Aviso a partir de 7 dias antes. Login recusado quando a licença está vencida ou a conta inativa. Se isso acontecer durante o uso, a tela é bloqueada na próxima checagem (a cada 20 min). |
| Força bruta | Bloqueio de 15 min por IP depois de 8 tentativas erradas. |
| Armazenamento | `data/users.json`, numa pasta bloqueada por `.htaccess` (Apache e LiteSpeed). |

## Estrutura

```
kit-licencas/
├── servidor/api/auth.php          ← o servidor (configurações no topo)
├── servidor/api/proteger.php      ← exigirLicenca() para proteger suas rotas PHP
├── servidor/api/exemplo-protegido.php
├── servidor/api/data/.htaccess    ← bloqueia a pasta das contas
├── cliente/licencas.js            ← cliente JS (login, verificar, painel…)
├── cliente/licencas.d.ts          ← tipos para TypeScript
├── cliente/telas.js               ← telas prontas em JS puro
├── cliente/kit-licencas.css       ← estilos (prefixo lk-)
├── react/LicencasReact.tsx        ← LoginGate, LicenseBanner, UsersPanel
└── demo/index.html                ← exemplo completo funcionando
```

## Testar no seu computador (2 minutos)

Requer PHP instalado.

```bash
cd kit-licencas
```

```bash
php -S localhost:8000
```

1. Abra http://localhost:8000/demo/ e entre com **admin / admin2410**.
2. Clique em **Usuários**, confirme a senha e crie um acesso.
3. Saia e entre com o novo acesso.

As contas ficam em `servidor/api/data/users.json`. Para recomeçar do zero, apague esse arquivo.

## Instalar no seu projeto

### 1) Servidor
1. Copie a pasta `servidor/api/` para o seu site. Exemplo: `public_html/api/auth.php` e `public_html/api/data/`.
2. Abra o `auth.php` e ajuste o bloco **CONFIGURAÇÃO**:

```php
const OWNER_LOGIN = 'admin';          // login do proprietário (criado no 1º acesso)
const OWNER_PASS  = 'admin2410';      // senha inicial — troque pelo painel depois
const SESSION_TTL = 12 * 3600;        // sessão
const ADMIN_TTL   = 20 * 60;          // painel desbloqueado por
const MAX_FAILS   = 8;                // tentativas antes do bloqueio
const PLANS = ['1d' => 1, '1s' => 7, '1m' => 30, '3m' => 90, '6m' => 180, '12m' => 365, 'vitalicio' => 0];
```

Para criar um plano novo (ex.: 2 anos), acrescente `'2a' => 730` em `PLANS` e `{ key: '2a', name: '2 anos' }` em `PLANOS`, no `cliente/licencas.js`.

### 2) Cliente: HTML / JavaScript puro

```html
<link rel="stylesheet" href="cliente/kit-licencas.css">
<script type="module">
  import { createLicencas } from './cliente/licencas.js';
  import { protegerApp, abrirPainelUsuarios } from './cliente/telas.js';

  const auth = createLicencas({ url: 'api/auth.php', storageKey: 'meuapp.sessao' });

  protegerApp(auth, {
    titulo: 'Meu Sistema',
    onEntrar: (sessao) => {
      // inicie seu app aqui. sessao = { user, name, role, expires, token }
      if (sessao.role === 'owner') {
        document.querySelector('#btn-usuarios').onclick = () => abrirPainelUsuarios(auth);
      }
    },
  });
</script>
```

A função `protegerApp` cuida de tudo: mostra o login, revalida a sessão salva, exibe o aviso de vencimento e bloqueia a tela se a conta for inativada ou vencer durante o uso.

### 3) Cliente: React

```tsx
import { createLicencas } from './kit-licencas/cliente/licencas.js';
import { LoginGate, LicenseBanner, UsersPanel } from './kit-licencas/react/LicencasReact';
import './kit-licencas/cliente/kit-licencas.css';

const auth = createLicencas({ url: 'api/auth.php' });

export default function Root() {
  const [painel, setPainel] = useState(false);
  return (
    <LoginGate auth={auth} titulo="Meu Sistema">
      <LicenseBanner auth={auth} />
      {auth.sessao()?.role === 'owner' && <button onClick={() => setPainel(true)}>Usuários</button>}
      {painel && <UsersPanel auth={auth} onClose={() => setPainel(false)} />}
      <MeuApp />
    </LoginGate>
  );
}
```

### 4) Usando só o cliente (sua própria tela)

```js
const auth = createLicencas({ url: 'api/auth.php' });

await auth.login(usuario, senha, true);   // lança LicencaErro: invalid | inactive | expired | locked
const r = await auth.verificar();         // { ok: true, sessao } ou { ok: false, motivo, mensagem }
const aviso = auth.aviso(7);              // { dias, data, texto, urgente } ou null
auth.vigiar((msg) => alert(msg));         // checa a cada 20 min
auth.sair();

// painel do proprietário
const adminToken = await auth.desbloquear(senhaDoProprietario);
await auth.listar(adminToken);
await auth.criar(adminToken, { login: 'joao', name: 'João', pass: 'senha123', plan: '1m', notes: 'PIX 10/11' });
await auth.alterar(adminToken, 'joao', { plan: '12m' });     // renova (soma ao vencimento)
await auth.alterar(adminToken, 'joao', { active: false });   // inativa
await auth.alterar(adminToken, 'joao', { pass: 'nova123' }); // troca a senha
await auth.excluir(adminToken, 'joao');
```

## API do servidor

Todas as chamadas são `POST` para `auth.php`, com corpo JSON `{ "action": "...", ... }`. A resposta é `{ "ok": true, ... }` ou `{ "ok": false, "error": "código", "message": "texto para o usuário" }`.

| action | Envia | Devolve |
|---|---|---|
| `login` | `user`, `pass` | `session { user, name, role, expires, token }` |
| `me` | `token` | `session` renovada (ou erro `inactive` / `expired` / `session`) |
| `unlock` | `token` (do proprietário), `pass` | `adminToken` (vale `ADMIN_TTL`) |
| `list` | `adminToken` | `users[]` |
| `create` | `adminToken`, `login`, `name`, `pass`, `plan`, `notes` | `users[]` |
| `update` | `adminToken`, `login` + `name` / `notes` / `active` / `pass` / `plan` / `fromToday` | `users[]` |
| `delete` | `adminToken`, `login` | `users[]` |

Códigos de erro: `invalid`, `inactive`, `expired`, `locked`, `session`, `forbidden`, `admin`, `exists`, `login`, `pass`, `plan`, `notfound`, `owner`.

### Proteger outras rotas PHP do seu projeto
Use o `servidor/api/proteger.php` para que qualquer página ou API PHP só responda a quem tem licença válida:

```php
<?php
require __DIR__ . '/api/proteger.php';
$usuario = exigirLicenca();        // responde 401/403 em JSON e encerra se não tiver acesso
// $dono = exigirLicenca(true);    // só o proprietário
echo json_encode(['ok' => true, 'dados' => '...', 'usuario' => $usuario['login']]);
```

No cliente, envie o token da sessão:

```js
const r = await fetch('api/minha-rota.php', { headers: { Authorization: `Bearer ${auth.sessao().token}` } });
```

Há um exemplo pronto em `servidor/api/exemplo-protegido.php`. Os retornos são JSON comuns, então a API também pode ser chamada de Node, Python ou de um app mobile.

## Personalizar a aparência
Mude as variáveis no início de `kit-licencas.css` (`--lk-accent`, `--lk-text`…). Todas as classes começam com `lk-`, então não conflitam com o seu CSS.

## Atualizar o site sem perder as contas
**Nunca apague a pasta `api/data/`.** Ao subir uma versão nova, substitua só o `auth.php` e os arquivos do seu app.

Faça backup do `api/data/users.json` de vez em quando, baixando-o pelo Gerenciador de arquivos.

## Segurança: o que esperar
- As senhas não ficam legíveis em lugar nenhum: são guardadas só como hash bcrypt. Os tokens são assinados com uma chave secreta gerada no servidor (`data/secret.key`).
- Use o site com **HTTPS**, senão a senha trafega sem criptografia.
- O kit controla **quem entra no app**. Se o seu app é estático (HTML/JS), alguém com conhecimento técnico avançado consegue abrir os arquivos sem passar pelo login.
  - Para conteúdo realmente sensível, proteja também as rotas e dados no servidor, validando o `token` com a ação `me` (ou com `readToken`) antes de entregar a informação.
- Os arquivos `secret.key`, `users.json` e `attempts.json` são gerados no servidor. **Não os coloque no Git.**
