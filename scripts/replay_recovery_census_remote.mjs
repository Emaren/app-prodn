// Loaded only by census-replay-recovery-v2.py after the canonical read-only Truth OS helpers.
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { publicReplayIdentity, cleanPublicGameRows } from '@/lib/publicReplayTruth';
import { publicReplayRosterV2DisplayState } from '@/lib/publicReplayRosterV2';
import { isPublicBattleArchiveRow } from '@/lib/publicBattleArchiveEligibility';
const hashOf = b => createHash('sha256').update(b).digest('hex');
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
function exactRoster(g) { const ps = normalizeReplayPlayers(g.players); return ps.length >= 2 && ps.every(p => p.steamId) && new Set(ps.map(p => p.steamId)).size === ps.length ? ps.map(p => `${p.steamId}:${p.teamId}`).sort().join('|') : null; }
function resultKey(g) { const p = participantProjection(g); return p.coherent ? p.outcomes.map(o => `${o.stablePlayerKey}:${o.result}`).sort().join('|') : null; }
function candidate(run) {
    if (!run?.candidateOutputStorageKey)
        return { status: 'missing' };
    const p = resolve(run.candidateOutputStorageKey);
    if (!insideTruthRoot(p, TRUTH_CANDIDATE_ROOT))
        return { status: 'outside_root' };
    try {
        if (lstatSync(p).isSymbolicLink() || !insideTruthRoot(realpathSync(p), TRUTH_CANDIDATE_ROOT))
            return { status: 'symlink' };
        if (!lstatSync(p).isFile() || lstatSync(p).size > 64 * 1024 * 1024)
            return { status: 'candidate_size_or_type_rejected' };
        const stored = readFileSync(p);
        const bytes = p.endsWith('.gz') ? gunzipSync(stored, { maxOutputLength: 256 * 1024 * 1024 }) : stored;
        const actual = hashOf(stored);
        if (actual !== run.candidateOutputHash)
            return { status: 'hash_mismatch', actual };
        const c = JSON.parse(bytes.toString('utf8'));
        const projection = c.projection ?? c.effective_projection ?? null;
        const result = projection ? { truth: publicReplayWinnerTruth({ ...projection, is_final: true, replayHash: run.inputHash }), participants: participantProjection({ ...projection, is_final: true, replayHash: run.inputHash }) } : null;
        const expectedParser = { implementation: HD_REPLAY_PARSER_CONTRACT.parserName, implementation_version: HD_REPLAY_PARSER_CONTRACT.parserVersion, schema_version: HD_REPLAY_PARSER_CONTRACT.schemaVersion, pass_name: HD_REPLAY_PARSER_CONTRACT.passName, pass_version: HD_REPLAY_PARSER_CONTRACT.passVersion };
        if (!run.candidateOnly || run.affectsPublicAggregates || run.artifact.sha256 !== run.inputHash || !Object.entries(expectedParser).every(([k, v]) => c.parser?.[k] === v) || c.parser?.options?.apply_hd_early_exit_rules !== true)
            return { status: 'candidate_contract_mismatch', sha256: actual };
        if (c.artifact?.sha256 !== run.inputHash || c.candidate?.promotion_status !== 'candidate_only' || c.candidate?.changes_effective_truth !== false)
            return { status: 'candidate_binding_mismatch', sha256: actual };
        return { status: 'verified_candidate_output_only', sha256: actual, rootKeys: Object.keys(c), projection: projection ? { winner: projection.winner, players: projection.players, parse_reason: projection.parse_reason, parse_source: projection.parse_source, disconnect_detected: projection.disconnect_detected, key_events: { result_resolution: projection.key_events?.result_resolution, team_resolution: projection.key_events?.team_resolution, final_battle_eligible: projection.key_events?.final_battle_eligible }, event_types: projection.event_types } : null, parser: c.parser, run: c.run, candidateState: c.candidate, candidateOutputStorageKey: p, terminal: c.evidence?.terminal ? { artifact: c.evidence.terminal.artifact, authority_scope: c.evidence.terminal.authority_scope, candidate_result: c.evidence.terminal.candidate_result, framing: { complete: c.evidence.terminal.framing?.complete, failure: c.evidence.terminal.framing?.failure, framed_packets_sha256: c.evidence.terminal.framing?.framed_packets_sha256, operation_count: c.evidence.terminal.framing?.operation_count, metadata_only: c.evidence.terminal.framing?.metadata_only }, projection_decision: c.evidence.terminal.projection_decision } : null, coherentCandidateResult: result?.participants.coherent === true, candidateStatsEligible: result?.truth.statsEligible === true };
    }
    catch (e) {
        return { status: 'unreadable', reason: String(e.message) };
    }
}
const recoveryEvidenceHelper = await import('__RECOVERY_HELPER_MODULE_URL__');
const receiptSnapshotSql = __RECEIPT_SNAPSHOT_SQL__;
const recoveryAliasSql = `SELECT g.id, g.replay_hash AS "replayHash", g.is_final, g.players, g.winner, g.parse_reason, g.parse_source, g.key_events, g.disconnect_detected, g.replay_file, g.original_filename FROM game_stats g WHERE NOT g.is_final AND (g.replay_hash=ANY($1::text[]) OR g.key_events->>'platform_match_id'=ANY($2::text[])) ORDER BY g.id`;
async function recoveryCensus() {
    const prisma = getPrisma();
    try {
        const data = await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
            const readOnly = await proveReadOnly(tx);
            const raw = await tx.gameStats.findMany({ where: { is_final: true }, orderBy: { id: 'asc' }, select: { ...baseSelect, parse_iteration: true, game_type: true, game_version: true, replay_file: true, original_filename: true, userUid: true, createdAt: true, played_on: true, timestamp: true } });
            const currentRunIds = await loadExactCurrentParserRunGameIds(tx, raw);
            const games = raw.map(g => ({ ...g, hasExactCurrentParserRun: currentRunIds.has(g.id) }));
            const attempts = await tx.replayParseAttempt.findMany({ orderBy: { id: 'asc' }, select: { id: true, gameStatsId: true, replayHash: true, userUid: true, status: true, uploadMode: true, detail: true, createdAt: true, evidence: true } });
            // Arrays bind once each: large live history must not expand Prisma relation parameters.
            const aliases = await tx.$queryRawUnsafe(recoveryAliasSql, games.map(g=>g.replayHash), games.map(g=>g.key_events?.platform_match_id).filter(Boolean));
            const runs = await tx.replayParseRun.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, gameStatsId: true, inputHash: true, artifact: { select: { sha256: true } }, parserName: true, parserVersion: true, schemaVersion: true, passName: true, passVersion: true, status: true, candidateOnly: true, affectsPublicAggregates: true, candidateOutputHash: true, candidateOutputStorageKey: true, createdAt: true } });
            const adjudications = await tx.replayResultAdjudication.findMany({ orderBy: { id: 'asc' } });
            const projections = await tx.replayStatProjection.findMany({ orderBy: { id: 'asc' }, select: { id: true, gameStatsId: true, parseRunId: true, supersedesId: true, sourceKind: true, sourceIdentity: true, sourceHash: true, resultEligibility: true, projectionStatus: true, affectsResults: true, affectsBets: true, settlementAuthority: true, provenance: true } });
            const incidents = await tx.replayDesyncIncident.findMany({ orderBy: { id: 'asc' }, select: { id: true, gameStatsId: true, desyncOccurred: true } });
            const allGames = [...games, ...aliases];
            const modernIds = games.filter(g => !participantProjection(g).coherent && attempts.some(t => obj(t.evidence).schema === 'aoe2war-watcher-final-observation/v1' && (t.gameStatsId === g.id || t.replayHash === g.replayHash || (g.key_events?.platform_match_id && (t.evidence.platform_match_id === g.key_events.platform_match_id || allGames.some(a => a.id === t.gameStatsId && a.key_events?.platform_match_id === g.key_events.platform_match_id)))))).map(g => g.id);
            const modernSnapshots = [];
            for (const id of modernIds) {
                const rows = await tx.$queryRawUnsafe(receiptSnapshotSql, id, null);
                modernSnapshots.push({ gameStatsId: id, snapshotJson: rows[0].snapshot_json });
            }
            return { readOnly, observationTimestamp: new Date().toISOString(), games, aliases, attempts, runs, adjudications, projections, incidents, modernSnapshots };
        }, { timeout: 120000 });
        const { games, aliases, attempts, runs, adjudications, projections, incidents } = data;
        const groups = new Map();
        for (const g of games) {
            const key = publicReplayIdentity(g);
            const list = groups.get(key) ?? [];
            list.push(g);
            groups.set(key, list);
        }
        const reasons = Object.create(null), shapes = Object.create(null), cases = [];
        const resolved = games.filter(g => participantProjection(g).coherent).length;
        for (const g of games) {
            const a = { truth: publicReplayWinnerTruth(g), participants: participantProjection(g) };
            if (a.participants.coherent)
                continue;
            const siblings = [...(groups.get(publicReplayIdentity(g)) ?? []).filter(s => s.id !== g.id), ...aliases.filter(s => s.replayHash === g.replayHash || (g.key_events?.platform_match_id && s.key_events?.platform_match_id === g.key_events.platform_match_id))];
            const linked = attempts.filter(t => t.gameStatsId === g.id || t.replayHash === g.replayHash || siblings.some(s => s.id === t.gameStatsId) || (g.key_events?.platform_match_id && t.evidence?.platform_match_id === g.key_events.platform_match_id));
            const modern = linked.filter(t => obj(t.evidence).schema === 'aoe2war-watcher-final-observation/v1');
            const exactRuns = runs.filter(r => r.inputHash === g.replayHash && r.artifact.sha256 === g.replayHash);
            const current = exactRuns.find(r => r.status === 'completed' && Object.entries(HD_REPLAY_PARSER_CONTRACT).every(([k, v]) => r[k] === v));
            const c = candidate(current);
            const terminalResult = c.terminal?.candidate_result;
            const decisiveCandidate = terminalResult?.status === 'deterministic_candidate' && terminalResult.blockers?.length === 0 && c.terminal?.framing?.complete === true;
            const ledger = adjudications.filter(r => r.gameStatsId === g.id);
            const proj = projections.filter(r => r.gameStatsId === g.id);
            const acceptedRating = ledger.filter(r => r.decisionStatus === 'accepted' && r.affectsStats && /rating.delta/i.test(`${r.idempotencyKey} ${r.reason}`));
            const eligibleSiblings = siblings.filter(s => s.is_final && publicReplayWinnerTruth(s).statsEligible && exactRoster(g) && exactRoster(s) === exactRoster(g) && participantProjection(s).coherent);
            const allResultKeys = new Set([g, ...siblings].map(resultKey).filter(Boolean));
            const conflict = allResultKeys.size > 1 || a.truth.truthReasons.some(r => /conflict|contradict/.test(r));
            const artifactPresent = canonicalArchiveAvailable(g.replayHash);
            const shape = conflict ? 'conflicting_result_evidence' : eligibleSiblings.length ? 'accepted_sibling_result_needs_revalidation' : c.coherentCandidateResult && c.candidateStatsEligible ? 'current_parser_result_needs_revalidation' : modern.length ? 'modern_receipt_needs_quorum_revalidation' : acceptedRating.length ? 'accepted_rating_ledger_requires_revalidation' : ledger.some(r => r.decisionStatus === 'accepted') ? 'adjudication_history_requires_review' : artifactPresent ? 'archive_present_no_accepted_result' : 'source_artifact_missing';
            increment(reasons, g.parse_reason);
            increment(shapes, shape);
            cases.push({ gameStatsId: g.id, replayHash: g.replayHash, logicalIdentity: publicReplayIdentity(g), parseReason: g.parse_reason, parseSource: g.parse_source, parseIteration: g.parse_iteration, gameType: g.game_type, truthReasons: a.truth.truthReasons, disconnectDetected: g.disconnect_detected, playerCount: a.participants.playerCount, rosterComplete: publicReplayRosterV2DisplayState(g.players).complete, exactRoster: exactRoster(g), archivePresent: artifactPresent, siblingIds: siblings.map(s => s.id), acceptedSiblingIds: eligibleSiblings.map(s => s.id), conflictingEvidence: conflict, modernAttemptIds: modern.map(t => t.id), attemptIds: linked.map(t => t.id), acceptedRatingAdjudicationIds: acceptedRating.map(r => r.id), adjudicationIds: ledger.map(r => r.id), ledgerDetails: ledger, modernAttempts: modern, projectionIds: proj.map(r => r.id), desyncIncidentIds: incidents.filter(i => i.gameStatsId === g.id && i.desyncOccurred).map(i => i.id), exactParserRunIds: exactRuns.map(r => r.id), currentParserRunId: current?.id ?? null, candidate: c, decisiveCandidate, effectiveLedger: a.truth.statsEligible && a.truth.truthReasons.includes('replay_result_adjudication'), reviewHistory: ledger.length > 0 || incidents.some(i => i.gameStatsId === g.id), rawWinnerFlagsPresent: normalizeReplayPlayers(g.players).some(p => p.winner !== null), ratingDiagnosticsPresent: Array.isArray(g.players) && g.players.some(p => Object.keys(p).some(k => /rating/i.test(k) && p[k] !== null)), evidenceShape: shape, evidenceEmpty: !artifactPresent && !linked.length && !exactRuns.length && !ledger.length && !proj.length && !siblings.length });
        }
        const logical = cleanPublicGameRows(games.map(applyReplayAdjudicationToGameStats).filter(isPublicBattleArchiveRow), { includeReview: true, includeLive: false });
        const full = logical.filter(g => publicReplayWinnerTruth(g).statsEligible && publicReplayRosterV2DisplayState(g.players).complete).length;
        const count = p => cases.filter(p).length;
        const caseById = new Map(cases.map(c => [c.gameStatsId, c]));
        const summary = recoveryEvidenceHelper.buildRecoveryEvidenceSummary(games.map(g => { const c = caseById.get(g.id); return { gameStatsId: g.id, parseReason: g.parse_reason, resultResolved: !c, archivePresent: c?.archivePresent ?? false, attemptCount: c?.attemptIds.length ?? 0, exactParserRunCount: c?.exactParserRunIds.length ?? 0, currentParserCandidateStatus: c?.currentParserRunId ? c.candidate.status : null, decisiveCandidate: c?.decisiveCandidate ?? false, siblingIds: c?.siblingIds ?? [], authoritativeSiblingIds: c?.acceptedSiblingIds ?? [], modernAttemptIds: c?.modernAttemptIds ?? [], acceptedRatingAdjudicationIds: c?.acceptedRatingAdjudicationIds ?? [], adjudicationIds: c?.adjudicationIds ?? [], effectiveLedger: c?.effectiveLedger ?? false, conflicts: c?.conflictingEvidence ?? false, disconnected: g.disconnect_detected, review: c?.reviewHistory ?? false, staleParserEvidence: Boolean(c && c.exactParserRunIds.length && !c.currentParserRunId), rawWinnerFlagsPresent: c?.rawWinnerFlagsPresent ?? false, ratingDiagnosticsPresent: c?.ratingDiagnosticsPresent ?? false, acceptedRatingAuthority: Boolean(c?.effectiveLedger && c?.acceptedRatingAdjudicationIds.length), publicProjectionPresent: Boolean(c?.projectionIds.length) }; }));
        const safeRules = [{ rule: 'fresh_exact_byte_parser_result', prefilter: count(c => c.decisiveCandidate), safeYield: 0, validation: 'independent byte/parser/result proof and source conflict revalidation pending' }, { rule: 'accepted_exact_roster_sibling', prefilter: count(c => c.acceptedSiblingIds.length && !c.conflictingEvidence), safeYield: 0, validation: 'platform key alone insufficient; source/archive/side/exact game binding pending' }, { rule: 'modern_signed_cross_side_receipt', prefilter: count(c => c.modernAttemptIds.length), safeYield: 0, validation: 'fresh existing independent planner required' }, { rule: 'adjudication_history_revalidation', prefilter: count(c => c.adjudicationIds.length), safeYield: 0, validation: 'exact accepted source/roster/version and conflict checks required' }, { rule: 'accepted_exact_game_rating_authority', prefilter: count(c => c.acceptedRatingAdjudicationIds.length), safeYield: 0, validation: 'numeric zero sum alone is not accepted exact replay attribution' }];
        return { schema: 2, kind: 'aoe2war-recovery-v2-evidence-census', generatedAt: new Date().toISOString(), productionSource, observationTimestamp: data.observationTimestamp, sourceFingerprints: __SOURCE_FINGERPRINTS__, productionAuthorityFingerprints: Object.fromEntries(['publicReplayTruth','replayPlayerResult','unresolvedWatcherResult','replayAdjudications','replayResultAdjudications','teamResolution','replayPlayerIdentity','publicReplayRosterV2','publicBattleArchiveEligibility'].map(name=>['lib/'+name+'.ts',hashOf(readFileSync(join(process.cwd(),'lib',name+'.ts')))])), databaseReadOnly: data.readOnly, countingGrain: 'all is_final=true GameStats rows; coherent participant results under current public resolver', finalBattles: games.length, resolved, unresolved: cases.length, resolvedPercent: 100 * resolved / games.length, workshop: { logicalBattles: logical.length, fullTruth: full, fullTruthPercent: 100 * full / logical.length }, reasonCounts: orderedCounts(reasons), evidenceShapeCounts: orderedCounts(shapes), duplicateRehostSiblingEvidence: count(c => c.siblingIds.length), acceptedRatingAuthority: count(c => c.effectiveLedger && c.acceptedRatingAdjudicationIds.length), acceptedRatingLedgerPrefilter: count(c => c.acceptedRatingAdjudicationIds.length), conflictingEvidence: count(c => c.conflictingEvidence), trulyEvidenceEmpty: summary.evidenceShapeCounts.evidenceEmpty ?? 0, safeRules, sourceSnapshotSha256: hashOf(JSON.stringify(data)), cases, summary: { ...summary, cases: undefined }, modernSnapshots: data.modernSnapshots, databaseWrites: 0, authorityGranted: false };
    }
    finally {
        await prisma.$disconnect();
    }
}
recoveryCensus().then(r => process.stdout.write(JSON.stringify(r))).catch(e => { console.error(e.stack); process.exitCode = 1; });
