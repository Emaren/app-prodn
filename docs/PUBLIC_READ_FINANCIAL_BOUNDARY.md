# Public-read financial wakeup separation (non-authorizing)

This candidate removes known public GET / SSR / prewarm pathways that
automatically enqueue settlement-capable work through `ensureBetMarkets`.

Affected read projections: homepage/lobby (`lib/lobbySnapshot.ts`),
`/api/live-games`, `/api/bets`, `/api/header-summary`, and War Chest.
These routes still load their existing projections. They do not directly
enqueue settlement or tournament-proof maintenance on user navigation.

Existing authenticated replay-ingest POSTs retain market admission and
reconciliation calls; the changed read surfaces no longer substitute for an
authenticated producer. Read-triggered opportunistic market generation may
therefore be delayed until an actual approved producer event. Product-owner
review must confirm that this is acceptable before merging.

**Not a website-only deployment permit.** The change does not prove that
deeply imported read projection code is side-effect-free; it does not fence
other API routes, systemd timers, DE services, Satchel custody, signer keys,
network traffic or historical in-flight transactions. The original
`Emaren/wolochain#5` HOLD is unchanged.

The bounded census `scripts/aoe2_financial_producer_source_census.py`
checks presence of existing financial writers and **absence** of direct
queue invocations in the five reviewed source modules. The census continues
to emit `safe_to_deploy=false`, `all_financial_producers_isolated=false`
and `cross_repo_runtime_attestation=UNKNOWN` even when those tests pass.

Do not activate this candidate ahead of the separately approved
`Emaren/app-prodn#665` scoped release authority. Do not silently replace
the prior website's validated `14a3fcb3` staged artifact; this is a
separately reviewed future implementation.
