SESSION B — PUBLIC PLAYER PROFILE MEMORY-PRESSURE BULKHEAD
UTC physical release: 2026-11-08 ~08:52.
Purpose: contain unusual burst/concurrency to the public /players/by-name/
SSR route while the underlying Next.js memory-pressure root cause is investigated.
This is not a substitute for repairing the underlying Node heap fault.

Global file is installed at /etc/nginx/conf.d/aoe2war-player-profile-pressure-20261108.conf
(Nginx http context). Location directives are inserted into ONLY the HTTPS
location ^~ /players/by-name/ of /etc/nginx/sites-available/aoe2war.com,
immediately after its GET/HEAD method gate. The HTTP port-80 redirect
location is not changed. All other website, Steam, API, staking and Chain
routes are untouched. Preserve upstream 3032 and old 3030 fallback.

PREIMAGE EXACT SHA256:
9192a8e775b4e94e59701ba0f7ad6e5373a88aa97f5a7c0f3f633b4ea3bfabc7
APPLIED VHOST EXACT SHA256:
811cb9f1d4152a8573bc83ba27002206dcd5db1b2272b796c2c6dd919436425f
ROOT PHYSICAL RECEIPT EXACT SHA256:
3146a054e86e5d46d246d43e097983ec2817d0c30c57a8fedada50dd86243967
Root0600 receipt and original:
 /root/aoe2war-session-b-profile-pressure-20261108/
 Installed admission: nginx -t PASS, guarded reload PASS, unchanged
 3030/3032/Wolo validator PIDs, public /, /bets and /api/bets/public-history
 HTTP200. No database/financial writes or financial permit.

The crash at 08:24:27 UTC was an actual V8 JavaScript heap abort near
1.94 GiB (not a kernel OOM kill). Read-only anonymized Nginx showed
130 GETs to /players/by-name/ during that minute across 126 profile
paths / 81 clients. Correlation, NOT proven causation.
The successor website candidate e0586a7b remains undeployed.
Global route safety: 2r/s, burst3 nodelay, 2 concurrent, 429 overload.
To roll back, restore exact root-private vhost preimage and remove ONLY
the above global zone file, nginx -t, reload, check all protected services.
Do not rollback the separately repaired consent-qualified PostgreSQL view.
