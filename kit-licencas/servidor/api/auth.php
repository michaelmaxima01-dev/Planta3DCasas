<?php
declare(strict_types=1);

/**
 * Kit de Licenças — login, senha, contas de usuário e licenças com validade.
 * Servidor em um único arquivo PHP (7.4+), sem banco de dados: as contas ficam em
 * data/users.json, numa pasta bloqueada para acesso pela web.
 *
 * - Senhas com password_hash (bcrypt) e tokens assinados com HMAC-SHA256.
 * - Só o proprietário (role "owner") gerencia contas; cada abertura do painel exige a senha dele
 *   (desbloqueio temporário, ADMIN_TTL).
 * - Licenças: 1d, 1s (semana), 1m, 3m (trimestre), 6m (semestre), 12m (anual) e vitalicio.
 * - Bloqueio temporário por IP após MAX_FAILS tentativas erradas.
 *
 * Ações (POST JSON {"action": ...}): login, me, unlock, list, create, update, delete.
 */

// ===================== CONFIGURAÇÃO =====================
const OWNER_LOGIN = 'admin';          // login do proprietário criado na 1ª execução
const OWNER_PASS = 'admin2410';       // senha inicial — troque pelo painel depois do 1º acesso
const OWNER_NAME = 'Proprietário';
const DATA_DIR = __DIR__ . '/data';   // pasta das contas (fica bloqueada por .htaccess)
const SESSION_TTL = 12 * 3600;        // validade do token de sessão (s)
const ADMIN_TTL = 20 * 60;            // painel do proprietário desbloqueado por (s)
const MAX_FAILS = 8;                  // tentativas erradas antes do bloqueio
const LOCK_SECONDS = 15 * 60;         // duração do bloqueio (s)
/** Planos: chave => dias (0 = vitalício). Pode acrescentar outros, ex.: '2a' => 730. */
const PLANS = ['1d' => 1, '1s' => 7, '1m' => 30, '3m' => 90, '6m' => 180, '12m' => 365, 'vitalicio' => 0];
// ========================================================


const USERS_FILE = DATA_DIR . '/users.json';
const SECRET_FILE = DATA_DIR . '/secret.key';
const ATTEMPTS_FILE = DATA_DIR . '/attempts.json';
const HTACCESS_DENY = "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order deny,allow\n  Deny from all\n</IfModule>\n";

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $error, string $message, int $code = 400): void
{
    out(['ok' => false, 'error' => $error, 'message' => $message], $code);
}

function ensureStorage(): void
{
    if (!is_dir(DATA_DIR) && !mkdir(DATA_DIR, 0750, true)) fail('storage', 'Não foi possível criar a pasta de dados no servidor (api/data).', 500);
    $ht = DATA_DIR . '/.htaccess';
    if (!file_exists($ht)) file_put_contents($ht, HTACCESS_DENY);
    if (!file_exists(DATA_DIR . '/index.html')) file_put_contents(DATA_DIR . '/index.html', '');
    if (!file_exists(SECRET_FILE)) file_put_contents(SECRET_FILE, bin2hex(random_bytes(32)));
    if (!file_exists(USERS_FILE)) {
        $now = gmdate('c');
        saveUsers([[
            'login' => OWNER_LOGIN,
            'name' => OWNER_NAME,
            'role' => 'owner',
            'hash' => password_hash(OWNER_PASS, PASSWORD_DEFAULT),
            'active' => true,
            'plan' => 'vitalicio',
            'expires' => null,
            'createdAt' => $now,
            'lastLogin' => null,
            'notes' => '',
        ]]);
    }
}

function loadUsers(): array
{
    $raw = @file_get_contents(USERS_FILE);
    $data = $raw ? json_decode($raw, true) : null;
    return is_array($data) ? $data : [];
}

function saveUsers(array $users): void
{
    $tmp = USERS_FILE . '.tmp';
    $fp = fopen($tmp, 'c');
    if (!$fp) fail('storage', 'Sem permissão de escrita em api/data.', 500);
    flock($fp, LOCK_EX);
    ftruncate($fp, 0);
    fwrite($fp, json_encode(array_values($users), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    rename($tmp, USERS_FILE);
}

function secret(): string
{
    return trim((string)file_get_contents(SECRET_FILE));
}

function b64u(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function unb64u(string $s): string
{
    return (string)base64_decode(strtr($s, '-_', '+/'));
}

function makeToken(array $payload): string
{
    $body = b64u(json_encode($payload));
    return $body . '.' . b64u(hash_hmac('sha256', $body, secret(), true));
}

function readToken(?string $token, string $scope): ?array
{
    if (!$token || strpos($token, '.') === false) return null;
    [$body, $sig] = explode('.', $token, 2);
    if (!hash_equals(b64u(hash_hmac('sha256', $body, secret(), true)), $sig)) return null;
    $p = json_decode(unb64u($body), true);
    if (!is_array($p) || ($p['scope'] ?? '') !== $scope || ($p['exp'] ?? 0) < time()) return null;
    return $p;
}

function findUser(array $users, string $login): ?int
{
    foreach ($users as $i => $u) if (strtolower($u['login']) === strtolower($login)) return $i;
    return null;
}

function isExpired(array $u): bool
{
    return $u['role'] !== 'owner' && $u['expires'] !== null && strtotime($u['expires']) < time();
}

function publicUser(array $u): array
{
    $secs = $u['expires'] === null ? null : strtotime($u['expires']) - time();
    $days = $secs === null ? null : (int)($secs < 0 ? floor($secs / 86400) : ceil($secs / 86400));
    return [
        'login' => $u['login'],
        'name' => $u['name'],
        'role' => $u['role'],
        'active' => (bool)$u['active'],
        'plan' => $u['plan'],
        'expires' => $u['expires'],
        'daysLeft' => $days,
        'createdAt' => $u['createdAt'],
        'lastLogin' => $u['lastLogin'],
        'notes' => $u['notes'] ?? '',
    ];
}

function session(array $u): array
{
    return [
        'user' => $u['login'],
        'name' => $u['name'],
        'role' => $u['role'],
        'expires' => $u['expires'],
        'token' => makeToken(['u' => $u['login'], 'scope' => 'app', 'exp' => time() + SESSION_TTL]),
    ];
}

/** Nova validade: soma o plano a partir de hoje ou do vencimento atual (renovação antecipada). */
function expiryFor(string $plan, ?string $current): ?string
{
    if (!array_key_exists($plan, PLANS)) fail('plan', 'Plano inválido.');
    $days = PLANS[$plan];
    if ($days === 0) return null;
    $base = ($current !== null && strtotime($current) > time()) ? strtotime($current) : time();
    return gmdate('c', $base + $days * 86400);
}

// ---------- proteção contra força bruta ----------
function clientIp(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? 'desconhecido';
}

function attempts(): array
{
    $raw = @file_get_contents(ATTEMPTS_FILE);
    $a = $raw ? json_decode($raw, true) : [];
    return is_array($a) ? $a : [];
}

function checkLock(): void
{
    $a = attempts()[clientIp()] ?? null;
    if ($a && $a['n'] >= MAX_FAILS && time() - $a['t'] < LOCK_SECONDS) {
        fail('locked', 'Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.', 429);
    }
}

function registerFail(): void
{
    $all = attempts();
    $ip = clientIp();
    $a = $all[$ip] ?? ['n' => 0, 't' => time()];
    if (time() - $a['t'] > LOCK_SECONDS) $a = ['n' => 0, 't' => time()];
    $a['n']++;
    $a['t'] = time();
    $all[$ip] = $a;
    @file_put_contents(ATTEMPTS_FILE, json_encode($all));
}

function clearFails(): void
{
    $all = attempts();
    unset($all[clientIp()]);
    @file_put_contents(ATTEMPTS_FILE, json_encode($all));
}

function requireAdmin(array $in): void
{
    $p = readToken($in['adminToken'] ?? null, 'admin');
    if (!$p) fail('admin', 'Painel bloqueado: informe novamente a senha do proprietário.', 401);
}

function validLogin(string $login): bool
{
    return (bool)preg_match('/^[a-zA-Z0-9._-]{3,32}$/', $login);
}

// ---------- requisição ----------
// Incluído por outro arquivo (ex.: proteger.php)? Então só disponibiliza as funções.
if (realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) !== __FILE__) return;
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] === 'GET') out(['ok' => true, 'service' => 'kit-licencas']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('method', 'Use POST.', 405);
ensureStorage();
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) fail('input', 'Requisição inválida.');
$action = (string)($in['action'] ?? '');

switch ($action) {
    case 'login': {
        checkLock();
        $users = loadUsers();
        $i = findUser($users, (string)($in['user'] ?? ''));
        if ($i === null || !password_verify((string)($in['pass'] ?? ''), $users[$i]['hash'])) {
            registerFail();
            fail('invalid', 'Usuário ou senha incorretos.', 401);
        }
        $u = $users[$i];
        if (!$u['active']) fail('inactive', 'Este acesso está inativo. Fale com o administrador do sistema.', 403);
        if (isExpired($u)) fail('expired', 'Sua licença venceu em ' . date('d/m/Y', strtotime($u['expires'])) . '. Fale com o administrador para renovar.', 403);
        clearFails();
        $users[$i]['lastLogin'] = gmdate('c');
        saveUsers($users);
        out(['ok' => true, 'session' => session($users[$i])]);
    }

    case 'me': {
        $p = readToken($in['token'] ?? null, 'app');
        if (!$p) fail('session', 'Sessão expirada. Entre novamente.', 401);
        $users = loadUsers();
        $i = findUser($users, $p['u']);
        if ($i === null) fail('session', 'Acesso removido.', 401);
        $u = $users[$i];
        if (!$u['active']) fail('inactive', 'Este acesso foi inativado pelo administrador.', 403);
        if (isExpired($u)) fail('expired', 'Sua licença venceu em ' . date('d/m/Y', strtotime($u['expires'])) . '. Fale com o administrador para renovar.', 403);
        out(['ok' => true, 'session' => session($u)]);
    }

    case 'unlock': {
        checkLock();
        $p = readToken($in['token'] ?? null, 'app');
        $users = loadUsers();
        $i = $p ? findUser($users, $p['u']) : null;
        if ($i === null || $users[$i]['role'] !== 'owner') fail('forbidden', 'Somente o proprietário acessa o painel de usuários.', 403);
        if (!password_verify((string)($in['pass'] ?? ''), $users[$i]['hash'])) {
            registerFail();
            fail('invalid', 'Senha do proprietário incorreta.', 401);
        }
        clearFails();
        out(['ok' => true, 'adminToken' => makeToken(['u' => $users[$i]['login'], 'scope' => 'admin', 'exp' => time() + ADMIN_TTL])]);
    }

    case 'list': {
        requireAdmin($in);
        out(['ok' => true, 'users' => array_map('publicUser', loadUsers()), 'plans' => array_keys(PLANS)]);
    }

    case 'create': {
        requireAdmin($in);
        $login = trim((string)($in['login'] ?? ''));
        $pass = (string)($in['pass'] ?? '');
        if (!validLogin($login)) fail('login', 'Login deve ter de 3 a 32 caracteres (letras, números, ponto, hífen ou sublinhado).');
        if (strlen($pass) < 6) fail('pass', 'A senha precisa ter pelo menos 6 caracteres.');
        $users = loadUsers();
        if (findUser($users, $login) !== null) fail('exists', 'Já existe um usuário com esse login.');
        $plan = (string)($in['plan'] ?? '1m');
        $users[] = [
            'login' => $login,
            'name' => trim((string)($in['name'] ?? $login)) ?: $login,
            'role' => 'user',
            'hash' => password_hash($pass, PASSWORD_DEFAULT),
            'active' => true,
            'plan' => $plan,
            'expires' => expiryFor($plan, null),
            'createdAt' => gmdate('c'),
            'lastLogin' => null,
            'notes' => trim((string)($in['notes'] ?? '')),
        ];
        saveUsers($users);
        out(['ok' => true, 'users' => array_map('publicUser', $users)]);
    }

    case 'update': {
        requireAdmin($in);
        $users = loadUsers();
        $i = findUser($users, (string)($in['login'] ?? ''));
        if ($i === null) fail('notfound', 'Usuário não encontrado.', 404);
        $u = &$users[$i];
        if (isset($in['name'])) $u['name'] = trim((string)$in['name']) ?: $u['name'];
        if (isset($in['notes'])) $u['notes'] = trim((string)$in['notes']);
        if (isset($in['active'])) {
            if ($u['role'] === 'owner' && !$in['active']) fail('owner', 'O proprietário não pode ser inativado.');
            $u['active'] = (bool)$in['active'];
        }
        if (isset($in['pass']) && $in['pass'] !== '') {
            if (strlen((string)$in['pass']) < 6) fail('pass', 'A senha precisa ter pelo menos 6 caracteres.');
            $u['hash'] = password_hash((string)$in['pass'], PASSWORD_DEFAULT);
        }
        if (isset($in['plan']) && $u['role'] !== 'owner') {
            $plan = (string)$in['plan'];
            // renovar soma ao vencimento atual; "trocar" recomeça a contar de hoje
            $u['expires'] = expiryFor($plan, !empty($in['fromToday']) ? null : $u['expires']);
            $u['plan'] = $plan;
        }
        unset($u);
        saveUsers($users);
        out(['ok' => true, 'users' => array_map('publicUser', $users)]);
    }

    case 'delete': {
        requireAdmin($in);
        $users = loadUsers();
        $i = findUser($users, (string)($in['login'] ?? ''));
        if ($i === null) fail('notfound', 'Usuário não encontrado.', 404);
        if ($users[$i]['role'] === 'owner') fail('owner', 'O proprietário não pode ser excluído.');
        array_splice($users, $i, 1);
        saveUsers($users);
        out(['ok' => true, 'users' => array_map('publicUser', $users)]);
    }

    default:
        fail('action', 'Ação desconhecida.');
}
