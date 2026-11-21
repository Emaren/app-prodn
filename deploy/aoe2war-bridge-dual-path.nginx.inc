# WE2 Bridge dual-path contract — include ONLY inside aoe2war.com's HTTPS
# server, BEFORE (and with higher exact-match precedence than) location ^~ /api/.
# Source-qualified but NOT installed by merely merging a PR.
#
# Both routes enforce POST-only. This proxy overwrites any client-supplied
# X-AoE2WAR-Bridge-Scope. Authentication remains the app's exact bridge token;
# storage_visual additionally verifies independently signed per-plane receipts.
# No generic POST permission is added to location ^~ /api/.
location = /api/internal/aoe2war-os/bridge {
    if ($request_method != POST) { return 405; }
    client_max_body_size 256k;
    proxy_pass http://127.0.0.1:3032/api/internal/aoe2war-os/bridge;
    proxy_http_version 1.1;
    proxy_set_header Host aoe2war.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-AoE2WAR-Bridge-Scope operator_control;
    proxy_set_header X-AoE2WAR-OS-Key $http_x_aoe2war_os_key;
    proxy_set_header Cookie "";
    proxy_set_header Connection "";
    proxy_connect_timeout 5s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;
    proxy_request_buffering on;
    proxy_buffering off;
    add_header Cache-Control "no-store" always;
}

location = /api/internal/aoe2war-os/storage-visual {
    if ($request_method != POST) { return 405; }
    client_max_body_size 48k;
    # Crucial: exact alias routes into the ORIGINAL Next POST handler; the
    # protected Node guard still sees only /api/internal/aoe2war-os/bridge.
    proxy_pass http://127.0.0.1:3032/api/internal/aoe2war-os/bridge;
    proxy_http_version 1.1;
    proxy_set_header Host aoe2war.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-AoE2WAR-Bridge-Scope storage_visual;
    proxy_set_header X-AoE2WAR-OS-Key $http_x_aoe2war_os_key;
    proxy_set_header Cookie "";
    proxy_set_header Connection "";
    proxy_connect_timeout 5s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
    proxy_request_buffering on;
    proxy_buffering off;
    add_header Cache-Control "no-store" always;
}
