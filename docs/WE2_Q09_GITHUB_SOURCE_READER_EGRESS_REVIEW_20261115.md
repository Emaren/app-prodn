---
id: "aoe2war.app-prodn.we2-q09-github-source-reader-egress-review-20261115"
title: "WE2 Q09 GitHub Source Reader — Narrow Egress Design and Protected Review"
type: "adr"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "HEL1", "Q09", "Steam"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-b-security-design-no-firewall-permit-no-runtime-install-no-financial-access"
reviewed_at: "2026-11-15"
review_interval_days: 7
sensitivity: "restricted"
---

# WE2 Q09 GitHub Source Reader — Narrow Egress Design and Protected Review

## Status: SOURCE-ONLY DESIGN, NOT PRODUCTION AUTHORIZATION

This ADR contains directly checked production evidence and a proposed alternative to unrestricted UID990 Internet. It grants NO policy change, B source signature, root install permit, GitHub credential, service, nftables update or website activation.

Existing accepted public site: GitHub app-prodn main d36e9f98e44b0a4de438c5cc623706873c333ca5; complete source tree 5f2afed4f1fb7c7e6a0749c0ce78a362f3e96a78; deployed source e31e1c053a3b39904929a64a1a9af700a9ad5426; BUILD_ID dVF3e9_shOY_BRFdn5Zyl. **Do not redeploy these unchanged bytes.**

Source-backed Q09 contract from current main:
- lib/centralEvents.ts Git blob 01d86a83c7ffa7eaeb10b4d31bc8a4424e3d14dd; lib/centralWorkLedger.ts blob 11aa20a62564e64cdbc0b81ffa846f36f21ea87a.
- Actual authenticated route app/api/admin/central-command/work-ledger/route.ts blob df82f21a7ca8b79be3580a18367a28fa7856e274 already enforces requireAdmin and private no-store response.
- Exactly **37 known source reads**: six configured lane issue comment feeds, three central issue comment feeds, nine pull requests each with PR/commits/reviews (27 total), one app-prodn workflow-runs feed. Existing reader batches at most seven; 240KB/source; 2.4s fetch timeout; 55s cache TTL; 300s stale window; 90s 403/429 backoff. Issue comment reads may also request a validated last page; cap follow-up pagination and never accept an untrusted arbitrary URL. Preserve actual FRESH/PARTIAL/STALE/UNKNOWN and accepted/expected coverage and source-only CI/PR provenance. This feed is NOT an agent-heartbeat or live deployment certificate.

Actual HEL1 root read-only 2026-11-15 23:26 UTC:
- Active web UID990, PID600020, NRestarts0, expected source and BUILD_ID. /proc/600020/environ had 22 variable names but NO GITHUB_TOKEN, GH_TOKEN, GITHUB_PAT, GITHUB_API_TOKEN, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY or GITHUB_API_BASE_URL. ONLY boolean presence checks were returned, never secret values, cookies or raw environment.
- The LOADED nftables table inet aoe2war_web_prod has chain output priority -11, narrowly allowing UID990 local 3331/5432, DNS 127.0.0.53, Steam-only rotating steam4/steam6 HTTPS sets (five-minute TTL), established 3032 replies, followed by a final meta skuid 990 drop rule (loaded handle 11). GitHub is NOT admitted. Token or timeout tweaks cannot fix this outbound denial.
- The host's normal network path resolved api.github.com and returned HTTP200 from https://api.github.com/ with valid TLS. That does not confer network permission on UID990 or establish Q09 success. The existing Steam V27 lease and financial masks must remain unchanged.

## Proposed narrow dedicated GitHub evidence reader — independent B review required

Do NOT add wildcard GitHub or port443 egress to UID990 and do not reuse Steam's IP sets. Do not add a generic HTTP CONNECT/URL fetch proxy.

1. A separately admitted, nonfinancial and unprivileged fixed Linux UID/GID (NOT UID990, root, Steam watcher or C03) owns the **dedicated GitHub source reader**. Its root-managed service has NoNewPrivileges, empty ambient/bounding capabilities, private temp, restricted filesystem, source-owned allowlist and no ability to read PostgreSQL, Traffic SQLite, site session cookies, website release signers or Steam credentials. No public listener and no new HTTP listening port.
2. Its outbound network policy must be **separate per-reader UID, default deny**, allowing only the bounded destination set independently confirmed for api.github.com. Root-controlled, short-lived DNS A/AAAA destination refresh must be bounded and atomic, with no Steam-set or financial firewall modifications. Require TLS certificate and hostname validation, reject redirects and proxies; do not treat IP-only filtering as hostname authorization because other hosts can share IPs. The B reviewer must approve exact nft/source/credential design before installation. No generic public Internet.
3. Strict HTTP GET only, exact 37 allowlisted source families generated from the accepted config/central-command-lanes.json and nine PR/three central issue identities actually pinned in lib/centralEvents.ts. No arbitrary repo, host, ref, user-supplied path, issue number, query, Link header or method. Current comment last-page pagination is allowed only after validating bounded GitHub Link metadata. Cap response 240KB/source, active connections, total page count, timeouts, retries, memory, TTL, 90s backoff and aggregate network budget. Never promote a bad/oversize response to genuine GitHub evidence.
4. If a read-only GitHub credential is later admitted, store it only in dedicated protected reader credentials, never UID990 environment, browser bundle, API output, log or world-readable envfile. Token may be absent for public API but rate limits must produce honest PARTIAL/UNKNOWN, not fabricated FRESH. Do not invent/enroll a root signer.
5. Website UID990 may communicate with this reader **only via an explicitly permitted root-owned AF_UNIX socket**, for example a reviewed /run/aoe2war-q09-reader/reader.sock with restricted group and SO_PEERCRED peer UID verification. Fixed request GET_SOURCE_WINDOW only; NO arbitrary path, URL, Host, raw SQL, file or transport forwarding. Native Unix socket access must receive its own protected-mode and peer-auth review. Existing admin route must keep requireAdmin and private,no-store responses. Ordinary/anonymous users must not reach broker bytes. Replacing the current direct network fetch requires a distinct reviewed code change and a new signed Factory release for that NEW source; this doc is NOT a live repair and must NOT cause unchanged website deployment.
6. Preserve source event parsing/normalization, 37 actual source coverage, last-good stale bounds, source timestamps, no financial or agent-runtime claims. Never label a partially fetched or stale feed FRESH or call source CI success a live deployment.

## Mandatory negative/source/physical acceptance

Before root install, independent B reviewer must publish exact source SHA, effective new unit/nft fingerprints, explicit root-only permit, inverse and rollback. Prove:
- UID990 direct api.github.com access still blocked, and all Steam V27, original source/build, 3030 rollback, 3032 public, 3033 emergency, PAPER9447, 8092–8095 closed and financial masks unchanged.
- New reader can fetch ONLY pinned GitHub API read endpoints under valid TLS, and refuses non-GitHub domains, same-IP alternative hostnames, arbitrary URL/path/query, IPv4/IPv6 bypass, redirects, proxy env, unexpected HTTP verbs, oversize responses and rate-limit abuse.
- Non-UID990 socket caller refused, UID990 unauthorized socket action refused, no token or raw API key leakage, no root privilege escalation, no write actions and no arbitrary file access. Socket absence/reader crash produces genuine UNKNOWN/STALE rather than fake FRESH.
- Read-only GitHub 37-source expected matrix genuinely succeeds with timestamp, exact GitHub source URL, status, sourceCoverage 37/37, no synthetic fixtures; 403/429 and outages honestly degrade. Admin existing browser GET of work-ledger returns actual source data after review, ordinary and anonymous denied, with no exported sessions/cookies.
- The approved source edit, if any, passes its OWN final GitHub exact-head CI and Linux artifact verification and uses existing B-signed Factory with new authenticated browser checks, new source/build/T10/no-op/stopwatch. No reuse of old website artifact or permit.
- An independently demonstrated inverse removes only the accepted new reader, socket/nft permit and new credentials, leaves Steam and financial network rules pinned, and preserves signed Factory receipts.

**Disposition:** actual root cause CONFIRMED; design is REVIEW-ONLY; no token, nft, systemd or website changes. NEED B independent source/security review and legitimate root permission before any change.
