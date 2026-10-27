<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_rol'])) {
    http_response_code(401);
    echo json_encode(['error' => 'No autenticado']);
    exit();
}

echo json_encode([
    'user_id'   => $_SESSION['user_id'] ?? null,
    'usuario'   => $_SESSION['user_name'] ?? 'Usuario',
    'rol'       => trim($_SESSION['user_rol']),
    'slug'      => $_SESSION['slug'] ?? 'GLOBAL'
]);