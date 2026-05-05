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

