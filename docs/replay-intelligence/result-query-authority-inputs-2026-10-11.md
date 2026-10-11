---
id: "aoe2war.replay-truth.result-query-authority-inputs-2026-10-11"
title: "Public Result Query Authority Inputs — 2026-10-11"
type: "reference"
status: "active"
owner: "aoe2war-replay-truth"
systems: ["app-prodn", "api-prodn"]
audience: ["developers", "operators"]
source_of_truth: "git"
authority: "public-result-input-contract"
reviewed_at: "2026-10-11"
review_interval_days: 30
sensitivity: "internal"
---

# Public Result Query Authority Inputs — 2026-10-11

The Workshop corpus query and the public leaderboard raw-game query omitted
the persisted `GameStats.disconnect_detected` column. A structured winner claim
could therefore reach the existing public resolver without its disconnect
counterevidence. The independent full-input audit is part of the read-only
[API Replay Truth campaign](https://github.com/Emaren/api-prodn/pull/46).

Implementation `48ccc4d64b9f609c9451cea947fb5d11ac6cda2b` selects the column in
both Workshop queries and the leaderboard corpus, declares it in the corpus
row type, and passes `is_final` and `disconnect_detected` into the Workshop's
existing result resolver. Result policy and adjudication precedence are
unchanged. The generated leaderboard page version reflects the query change.

`tests/public-result-query-authority.test.mts` executes the owning query
functions with a Prisma double that returns only selected columns. Its
synthetic disconnected structured claim remains unresolved in the Workshop,
viewer vault and leaderboard. A clean structured control retains its existing
stats eligibility. The test asserts no historical participant or outcome.

Validation: 44 focused result/leaderboard contracts passed; the complete active
Node inventory passed across 412 files; Prisma generation, TypeScript,
changed-source ESLint, the local application build, diff checks and tracked
secret scanning passed. Local validation reused the existing dependencies.
This source checkpoint performs no production write, deployment, adjudication
or result promotion. The corrected corpus census remains separate API evidence.
