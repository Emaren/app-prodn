# Security Incident Notes

These notes capture watcher/download-adjacent operational truth without storing secrets or incident credentials.

## Watcher Package Pull Noise

Spikes in `/download/watcher/*` traffic can be scraper, probe, crawler, or direct package-link noise. A package pull is not a confirmed watcher install and is not a real watcher user by itself.

Treat the following as weak or suspicious signals:

- guest package pulls
- empty referer
- direct package URL hits without normal site browsing
- platform/user-agent mismatches
- multiple platforms or artifacts pulled in a tight burst
- bot, crawler, curl, wget, Python, Go HTTP, headless, or scanner user agents

Confirmed watcher activity requires watcher client telemetry or watcher-sourced parsed games.

## App Deploy Boundaries

Application deploys must not undo or weaken external hardening:

- systemd hardening
- firewall policy
- fail2ban policy
- noexec `/tmp` or related drop-ins
- quarantined/stopped services from unrelated incidents

AoE2HDBets deploys should restart only required AoE2HDBets services. Do not restart quarantined Llama Chat or unrelated TokenChain/WoloChain services as part of watcher analytics work.

## Secrets

Do not write secrets into docs, logs, telemetry metadata, admin UI, commits, or shell history. Watcher API keys are sent to the telemetry endpoint only as `x-api-key` headers for server-side identity resolution and are never stored in `watcher_client_events`.

## Production credential and hardening findings — 2026-07-26

The parity inspection identified two credential incidents without recording secret values in this document:

1. a deploy-hook credential is embedded in tracked `api-prodn/package.json`;
2. a database connection error printed the production database URL into an operator terminal/chat transcript.

Required remediation:

- revoke and rotate the deploy hook;
- remove the credential from tracked source and replace it with an environment/operator deployment mechanism;
- clean reachable Git history where practical and add a secret-scan gate;
- rotate the `aoe2hd_user` database password;
- update every production environment file that consumes that password;
- restart only the affected AoE2WAR web/API services and verify database, Prisma, and API health afterward;
- never paste the old values into tickets, docs, commits, or future diagnostics.

Sensitive file modes were otherwise appropriately restrictive at inspection: web and Wolo settlement environment files were mode `0600`; the API environment was mode `0600`; the OpenAI key file was mode `0640` owned by `root:tony` so the hardened web service can read it.

Systemd hardening is uneven. The web service uses `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, and `NoNewPrivileges=true`. The replay API and both settlement services lacked equivalent containment at the seal. Harden them through tested unit drop-ins with explicit writable paths; do not apply broad hardening blindly to signer/keyring services.

The root filesystem was 94% used with about 2.4 GB free. Capacity cleanup must preserve raw replay archives, parser evidence, database backups, settlement state, release artifacts, and incident receipts.
