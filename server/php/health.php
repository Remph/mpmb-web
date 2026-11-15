<?php
// The fallback of the M15 hosting spike: if Plesk's Node.js can't serve the sync service, a small PHP + MySQL one
// can. This page says which PHP the webspace runs and whether its MySQL drivers are there. No database login yet.
// Upload it next to the Node app (or into any folder of the subdomain) and open it in a browser.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: https://remph.de');
header('Cross-Origin-Resource-Policy: cross-origin');
header('X-Content-Type-Options: nosniff');

echo json_encode([
    'ok' => true,
    'service' => 'mpmb-web-sync (PHP fallback)',
    'php' => PHP_VERSION,
    'mysqli' => extension_loaded('mysqli'),
    'pdo_mysql' => in_array('mysql', PDO::getAvailableDrivers(), true),
    'sodium' => extension_loaded('sodium'), // for hashing the players' codes
    'time' => gmdate('c'),
]);
