#!/usr/bin/env python3
"""Source-level contract for source-owned nonfinancial parser aggregate v8."""
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SQL=(ROOT/"config/nonfinancial-public-parser-observatory-v8.sql").read_text()
SRC=(ROOT/"lib/parserObservatory.ts").read_text()

class ParserObservatoryV8(unittest.TestCase):
    def test_exact_postgres_role_security_barrier_atomic_install(self):
        self.assertEqual(SQL.count("BEGIN;"),1)
        self.assertEqual(SQL.count("COMMIT;"),1)
        self.assertIn("current_user <> 'postgres'",SQL)
        self.assertIn("rolcanlogin AND NOT rolsuper AND NOT rolbypassrls",SQL)
        self.assertIn("WITH (security_barrier=true)",SQL)
        self.assertIn("GRANT SELECT ON aoe2war_public_v8.parser_observatory_snapshot TO aoe2war_web_prod",SQL)
        self.assertIn("has_schema_privilege('aoe2war_web_prod','aoe2war_public_v8','CREATE')",SQL)
        self.assertIn("PUBLIC_PARSER_V8_RAW_AUTHORITY_DRIFT",SQL)
        self.assertNotIn("GRANT SELECT ON ALL TABLES",SQL)

    def test_only_public_classified_metric_fields(self):
        for key in ("'allGameRows'","'artifacts'","'runStatus'","'parserVersions'",
                    "'fieldCoverage'","'observations'","'jobs'",
                    "'candidateFailures'","'latestArtifactRuns'",
                    "'effectiveProjectionReceipts'","'acceptedIdentitySnapshots'",
                    "'identityFoundation'"):
            self.assertIn(key,SQL)
        for forbidden in ("scope_hash","worker_key","checkpoint_cursor",
             "j.scope,","r.failure_detail","a.storage_key","j.requested_by_user_id",
             "'detail',e.detail", "'metrics',r.metrics,",
             "a.metadata,","s.provenance,","p.provenance,",
             "wallet_address","api_key","payout_tx_hash","user_email"):
            self.assertNotIn(forbidden,SQL)
        self.assertIn("'detail',NULL",SQL)
        self.assertIn("'parse_mode',r.metrics->>'parse_mode'",SQL)

    def test_effective_identity_projection_uses_anti_join_not_unbacked_reverse_field(self):
        self.assertIn("NOT EXISTS (SELECT 1 FROM public.replay_stat_projections successor",SQL)
        self.assertIn("successor.supersedes_id=p.id",SQL)
        self.assertNotIn("p.superseded_by",SQL)

    def test_nonfinancial_isolated_path_never_evaluates_legacy_private_orm(self):
        self.assertIn("if (views.length !== 1",SRC)
        self.assertIn("PUBLIC_PARSER_V8_VIEW_UNAVAILABLE_OR_MALFORMED",SRC)
        self.assertIn("PUBLIC_PARSER_V8_COUNTERS_UNAVAILABLE",SRC)
        self.assertIn("FROM aoe2war_public_v8.parser_observatory_snapshot",SRC)
        self.assertIn("? loadRestrictedParserObservatoryInputs()",SRC)
        self.assertIn(": loadLegacyParserObservatoryInputs()",SRC)
        self.assertIn("return Promise.all([",SRC)
        self.assertIn("prisma.replayParseRun.groupBy",SRC)
        self.assertIn("prisma.replayReprocessJob.findMany",SRC)
        self.assertIn("createdAt: new Date(String(job.createdAt))",SRC)
        self.assertIn("byteSize: BigInt(String(run.artifact.byteSize))",SRC)
        segment=SRC.split("async function loadRestrictedParserObservatoryInputs()",1)[1].split(
           "async function buildPublicParserObservatory()",1)[0]
        for forbidden in ("prisma.replayParseRun.", "prisma.replayArtifact.",
             "prisma.replayReprocessJob.", "prisma.warriorClaim.", "prisma.betWager."):
            self.assertNotIn(forbidden,segment)
        self.assertNotIn("catch (",segment)
        self.assertNotIn("return []",segment)

    def test_view_does_not_write_production_financial_objects(self):
        for blocked in ("INSERT INTO", "UPDATE public.", "DELETE FROM",
                        "CREATE TRIGGER", "ALTER TABLE", "SECURITY DEFINER",
                        "CREATE POLICY", "CREATE ROLE", "GRANT UPDATE",
                        "GRANT INSERT", "GRANT DELETE"):
            self.assertNotIn(blocked,SQL.upper() if blocked.isupper() else SQL)
        self.assertIn("WHERE evidence_kind='effective_projection_receipt'",SQL)
        self.assertIn("LIMIT 16",SQL)
        self.assertIn("LIMIT 80",SQL)
        self.assertIn("LIMIT 6",SQL)

if __name__=="__main__":unittest.main()
