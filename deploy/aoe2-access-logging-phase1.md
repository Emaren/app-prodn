# AoE2 Access Logging Phase 1

## Scope

Phase 1 owns raw nginx request logging for `aoe2hdbets.com` only.

- nginx emits raw AoE2 request logs
- logrotate owns file rotation
- Traffic may ingest later
- Traffic does not become the raw log source of truth

## Broken layer

This is a VPS nginx/logrotate configuration problem, not a Next.js or Traffic app-code problem.

Live inspection on `hel1` showed:

- `/etc/nginx/nginx.conf` already defines the house JSON format: `traffic_master`
- `/etc/nginx/nginx.conf` already writes a shared catch-all log: `/var/log/nginx/access.log`
- `/etc/nginx/sites-available/aoe2hdbets.com` does **not** define a dedicated AoE2 access log
- the only `access_log off` lines in that vhost are the deny-list locations for dotfiles and secret-like extensions
- `/etc/logrotate.d/nginx` currently rotates `/var/log/nginx/*.log` daily

So the real gap is not "AoE2 is fully unlogged." The real gap is:

- AoE2 traffic falls back into the giant shared `/var/log/nginx/access.log`
- there is no dedicated AoE2 raw request log for clean forensics or later Traffic ingestion

## Exact owning files

These production files live outside the repo:

1. `/etc/nginx/sites-available/aoe2hdbets.com`
2. `/etc/logrotate.d/nginx`
3. `/etc/logrotate.d/00-aoe2hdbets-nginx`

This repo cannot honestly claim those files were changed unless the operator has sudo on `hel1`.

## Minimal safe Phase 1 changes

### 1) Add a dedicated AoE2 access log to the live vhost

Edit `/etc/nginx/sites-available/aoe2hdbets.com`.

Add this near the top of **both** the `443` and `80` server blocks:

```nginx
access_log /var/log/nginx/aoe2hdbets.access.log traffic_master;
```

Keep these existing location-level lines as-is:

```nginx
access_log off;
```

Those deny-list locations should stay quiet.

The live vhost should end up following this pattern:

```nginx
server {
    server_name aoe2hdbets.com www.aoe2hdbets.com;
    access_log /var/log/nginx/aoe2hdbets.access.log traffic_master;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    location ~* /\.(?!well-known) {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~* \.(?:env|log|sql|sqlite|bak|swp|pem|key)$ {
        deny all;
        access_log off;
        log_not_found off;
    }

    # existing proxy config unchanged
}

server {
    server_name aoe2hdbets.com www.aoe2hdbets.com;
    listen 80;
    listen [::]:80;
    access_log /var/log/nginx/aoe2hdbets.access.log traffic_master;

    location /.well-known/acme-challenge/ { root /var/www/html; }

    location ~* /\.(?!well-known) {
        deny all;
        access_log off;
        log_not_found off;
    }

    location ~* \.(?:env|log|sql|sqlite|bak|swp|pem|key)$ {
        deny all;
        access_log off;
        log_not_found off;
    }

    client_max_body_size 250m;
    location / { return 301 https://$host$request_uri; }
}
```

### 2) Prevent duplicate logrotate ownership

Because `/etc/logrotate.d/nginx` already rotates `/var/log/nginx/*.log`, a new dedicated file at:

```text
/var/log/nginx/aoe2hdbets.access.log
```

would otherwise overlap the wildcard rule.

To keep the dedicated AoE2 size-based rule authoritative without breaking the other vhosts, add:

```text
ignoreduplicates
```

inside the existing block in `/etc/logrotate.d/nginx`.

The relevant block should look like:

```conf
/var/log/nginx/*.log {
	daily
	missingok
	rotate 14
	compress
	delaycompress
	notifempty
	ignoreduplicates
	create 0640 www-data adm
	sharedscripts
	prerotate
		if [ -d /etc/logrotate.d/httpd-prerotate ]; then \
			run-parts /etc/logrotate.d/httpd-prerotate; \
		fi \
	endscript
	postrotate
		invoke-rc.d nginx rotate >/dev/null 2>&1
	endscript
}
```

### 3) Add the dedicated AoE2 size-based logrotate rule

Create `/etc/logrotate.d/00-aoe2hdbets-nginx` with:

```conf
/var/log/nginx/aoe2hdbets.access.log {
	size 100M
	rotate 7
	missingok
	compress
	delaycompress
	notifempty
	ignoreduplicates
	create 0640 www-data adm
	sharedscripts
	postrotate
		invoke-rc.d nginx rotate >/dev/null 2>&1
	endscript
}
```

This keeps the dedicated AoE2 log on size-based retention without changing the time-based rules for the other nginx logs.

## Production-safe apply flow

Because these files live under `/etc`, run the edits on `hel1` as a sudo-capable operator.

Suggested backup-first flow:

```bash
ssh hel1
sudo cp /etc/nginx/sites-available/aoe2hdbets.com /etc/nginx/sites-available/aoe2hdbets.com.bak.$(date +%Y%m%d-%H%M%S)
sudo cp /etc/logrotate.d/nginx /etc/logrotate.d/nginx.bak.$(date +%Y%m%d-%H%M%S)
```

Then edit:

```bash
sudoedit /etc/nginx/sites-available/aoe2hdbets.com
sudoedit /etc/logrotate.d/nginx
sudoedit /etc/logrotate.d/00-aoe2hdbets-nginx
```

## Verification commands

Validate nginx syntax:

```bash
sudo nginx -t
```

Reload nginx:

```bash
sudo systemctl reload nginx
```

Confirm the dedicated files exist:

```bash
ls -lah /var/log/nginx/aoe2hdbets*
```

Dry-run logrotate and confirm the dedicated AoE2 file is recognized cleanly:

```bash
sudo logrotate -d /etc/logrotate.conf 2>&1 | grep -n "aoe2hdbets.access.log\|duplicate"
```

Confirm live requests are landing in the dedicated AoE2 log:

```bash
curl -sSI https://aoe2hdbets.com/lobby >/dev/null && sudo tail -n 5 /var/log/nginx/aoe2hdbets.access.log
```

Optional sanity check that the dedicated AoE2 log is still using the JSON house format:

```bash
sudo tail -n 1 /var/log/nginx/aoe2hdbets.access.log | jq .
```

## Phase 2 handoff to Traffic

Do not move raw logging into Traffic.

Phase 2 should have Traffic **consume** the dedicated AoE2 file after nginx is already writing it.

Useful facts from current Traffic code:

- Traffic already parses JSON nginx lines in `traffic_master` shape
- current Traffic config is still single-path oriented through `TRAFFIC_LOG_PATH`

So the later Traffic work should be one of:

1. point a dedicated Traffic ingest path at `/var/log/nginx/aoe2hdbets.access.log`, or
2. extend Traffic to tail multiple source logs or a configured directory of project logs

In either case:

- nginx stays the raw request emitter
- AoE2 remains the owner of its public web surface
- Traffic remains the analytics/join/reporting layer
