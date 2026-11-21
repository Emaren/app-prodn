# WE3 owner teaching exact admission — source proposal only, NOT installed.
# Applied only AFTER WE2 #1439 dual Bridge ingress is physically installed,
# source-pinned and independently T10 sealed; requires new distinct owner
# teaching authority, root preimages/inverse, and one reviewed host transaction.
# Place within the EXISTING HTTPS aoe2war.com server before location ^~ /api/.
# No new runtime, generic /api/ write, credentials, archive or prune executor.
#
# Existing GET /api/admin/storage-os/teaching must remain available only
# through the app's enrolled-owner requireAdmin fence.
location = /api/admin/storage-os/teaching {
    if ($request_method !~ "^(GET|HEAD|POST)$") { return 405; }
    client_max_body_size 2k;
    proxy_request_buffering on;
    proxy_pass http://127.0.0.1:3032/api/admin/storage-os/teaching;
    proxy_http_version 1.1;
    proxy_set_header Host aoe2war.com;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Origin $http_origin;
    proxy_set_header Sec-Fetch-Site $http_sec_fetch_site;
    proxy_set_header Cookie $http_cookie;
    proxy_set_header Authorization "";
    proxy_set_header Connection "";
    proxy_connect_timeout 3s;
    proxy_send_timeout 8s;
    proxy_read_timeout 8s;
    add_header Cache-Control "private, no-store" always;
}

# Manifest preview is non-executing and requires the enrolled owner session.
# It remains HOLD until independent exact-object source admission.
location = /api/admin/storage-os/dry-run {
    if ($request_method != POST) { return 405; }
    client_max_body_size 1k;
    proxy_request_buffering on;
    proxy_pass http://127.0.0.1:3032/api/admin/storage-os/dry-run;
    proxy_http_version 1.1;
    proxy_set_header Host aoe2war.com;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Origin $http_origin;
    proxy_set_header Sec-Fetch-Site $http_sec_fetch_site;
    proxy_set_header Cookie $http_cookie;
    proxy_set_header Authorization "";
    proxy_set_header Connection "";
    proxy_connect_timeout 3s;
    proxy_send_timeout 8s;
    proxy_read_timeout 8s;
    add_header Cache-Control "private, no-store" always;
}
