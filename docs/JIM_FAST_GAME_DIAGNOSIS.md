# Jim Fast-Ending Team Session Diagnosis

## Record

- public `game_stats` row: `16735`;
- replay: `MP Replay v5.8 @2025.03.04 204106 (6).aoe2record`;
- SHA-256: `7879cc7d829dd1db1b9da3064671f73a00a8f6e6448436519de325301976288d`;
- archived bytes: `488,841`;
- parsed duration: `302` seconds;
- watcher: `1.5.3`, batch-import session `session_0cffaf693d594999966ed915c4a00ee7`;
- watcher upload status: HTTP `200`, `finality_status=final_recorded`, `finalAccepted=false`;
- market count: zero.

## End-to-end trace

1. Watcher scan found the historical file and marked the stable 488,841-byte fingerprint as a final batch-import candidate.
2. The API hashed the exact bytes and preserved them under the immutable replay archive path. A direct SHA-256 verification matches the database replay hash.
3. Earlier attempts on July 7 and July 14 could not parse the file. The current parser pass on July 15 parsed and stored the roster, teams, map, actions, chat, and 302-second duration.
4. The parser resolved two high-confidence explicit teams:
   - supermuca / Lord onix / Danny — team ID `0`;
   - att / okoe / Jim — team ID `1`.
5. No player resignation, postgame table, winner flag, score table, or completed-result signal exists.
6. The replay contains chat asking to “save and rehost,” followed by an actual `save` event at 302 seconds.
7. Result resolution correctly remained `review_required` / `insufficient_result_evidence`. No market was created and no settlement path ran.

## Diagnosis

The watcher and parser did not lose a valid result. This was an intentionally saved session that stopped for rehosting, not a completed battle that happened to end quickly.

The product defect was the presentation layer: the live-games card collapsed every final upload into “Final stored” plus “Review Result.” That made a deliberate no-result session look like missing winner evidence.

## Fix

`replaySessionDisposition` now classifies a completed upload as `saved_rehost` only when all of these hold:

- no trusted winner;
- no completed signal;
- no postgame;
- no resignations;
- an actual replay `save` event exists.

The live-games surface now says `Saved / rehosted`, explains that no result exists, offers session evidence, and suppresses the result-review action. Other short unresolved replays remain in result review. Betting eligibility and team-integrity gates are unchanged.

The stages for this session are therefore:

`detected → uploaded → archived → parsed → saved/rehosted disposition`

It is not `result-ready`, `stats-result-ready`, or `betting-eligible`.

This `.aoe2record` contains a real in-replay `save` event and is a preserved
save/rehost session. It is distinct from the frozen corpus's 202
`.aoe2mpgame` saved-game checkpoint containers: those are separately decoded
checkpoint artifacts, remain non-final, and never inherit a later recording's
winner merely because continuation identity is known.
