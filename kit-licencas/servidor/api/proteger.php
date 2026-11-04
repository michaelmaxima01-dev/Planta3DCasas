<?php
/**
 * Proteja outras páginas/rotas PHP com o Kit de Licenças.
 *
 *   require __DIR__ . '/api/proteger.php';
 *   $usuario = exigirLicenca();            // 401/403 em JSON se não tiver acesso válido
 *   // ... sua lógica; $usuario['login'], $usuario['role'], $usuario['expires']
 *
 *   $dono = exigirLicenca(true);           // só o proprietário
 *
 * O token vem do cliente (auth.sessao().token) no cabeçalho "Authorization: Bearer <token>"
 * ou no campo "token" do JSON/formulário.
 */
declare(strict_types=1);
require_once __DIR__ . '/auth.php';

function exigirLicenca(bool $somenteProprietario = false): array
{
    ensureStorage();
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $token = stripos($h, 'Bearer ') === 0 ? trim(substr($h, 7)) : null;
    if (!$token) {
        $in = json_decode((string)file_get_contents('php://input'), true);
        $token = is_array($in) ? ($in['token'] ?? null) : null;
        $token = $token ?? ($_POST['token'] ?? $_GET['token'] ?? null);
    }
    header('Content-Type: application/json; charset=utf-8');
    $p = readToken(is_string($token) ? $token : null, 'app');
    if (!$p) fail('session', 'Sessão expirada. Entre novamente.', 401);
    $users = loadUsers();
    $i = findUser($users, $p['u']);
    if ($i === null) fail('session', 'Acesso removido.', 401);
    $u = $users[$i];
    if (!$u['active']) fail('inactive', 'Este acesso está inativo.', 403);
    if (isExpired($u)) fail('expired', 'Sua licença venceu. Fale com o administrador para renovar.', 403);
    if ($somenteProprietario && $u['role'] !== 'owner') fail('forbidden', 'Somente o proprietário.', 403);
    return publicUser($u);
}
