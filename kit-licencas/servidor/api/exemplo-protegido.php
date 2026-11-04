<?php
/** Exemplo: rota que só responde para quem tem licença válida. Chame com Authorization: Bearer <token>. */
declare(strict_types=1);
require __DIR__ . '/proteger.php';

$usuario = exigirLicenca();
echo json_encode(['ok' => true, 'mensagem' => 'Olá, ' . $usuario['name'] . '! Este conteúdo é protegido.', 'licenca' => $usuario['expires'] ?? 'vitalícia'], JSON_UNESCAPED_UNICODE);
