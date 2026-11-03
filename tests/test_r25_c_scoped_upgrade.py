"""Native 3032-only repair guards. Never grants production custody authority."""
import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
PATH=ROOT/"scripts/r25_c_scoped_upgrade_v1.py"
spec=importlib.util.spec_from_file_location("scoped_upgrade",PATH)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Upgrade(unittest.TestCase):
    def test_pinned_stage_and_financial_scope(self):
        self.assertEqual(m.SOURCE,"175e896c59bf48eda44c15d664d940f5ac40b436")
        self.assertEqual(m.OLD_SOURCE,"886dac221e73167621d6bbfa89cd30edf6b632a3")
        self.assertEqual(m.STAGE.name,"aoe2war-web-prod-"+m.SOURCE[:12])
        self.assertEqual(m.UNIT.name,"aoe2hdbets-web-prod.service")
        self.assertEqual(len(m.TABLES),6)
        self.assertEqual(m.COLUMNS["trophies"],("id","display_name"))
        self.assertFalse(any("wolo" in t or "wager" in t or "claim" in t or "users" in t for t in m.TABLES+tuple(m.COLUMNS.keys())))

    def test_exact_grants_and_revokes_never_mutate_finance(self):
        for enabled in (True,False):
            sql=m.acl_delta(enabled)
            self.assertIn("BEGIN;",sql)
            self.assertIn("COMMIT;",sql)
            self.assertIn("SET LOCAL lock_timeout=",sql)
            self.assertEqual(sql.count(" ON "),4)
            self.assertEqual(sql.count("aoe2war_web_prod;"),4)
            for table in m.TABLES: self.assertIn("public."+table,sql)
            for table,fields in m.COLUMNS.items():
                self.assertIn("(" + ",".join(fields) + ") ON public."+table,sql)
            for forbidden in ("pending_wolo_claims","bet_wagers","users","CREATE ROLE",
                              "ALTER ROLE","DROP ROLE","UPDATE ","INSERT ","DELETE "):
                self.assertNotIn(forbidden,sql)
        self.assertIn("GRANT SELECT",m.acl_delta(True))
        self.assertIn("REVOKE SELECT",m.acl_delta(False))

    def test_visible_parser_excludes_injected_script_content(self):
        source='<html><script>Monday Night Mayhem</script><style>fake</style>' + (
            '<main>Monday Night Mayhem</main><noscript>other</noscript></html>')
        self.assertEqual(m.visible(source)," Monday Night Mayhem ".strip())

    def test_nonce_cannot_be_replayed_or_guessed(self):
        for invalid in ("","ABC","ab"*15,"ab"*17,"_"*32):
            self.assertIsNone(m.re.fullmatch(r"[0-9a-f]{32}",invalid))
        self.assertIsNotNone(m.re.fullmatch(r"[0-9a-f]{32}","a"*32))

    def test_public_content_rejects_july_fallback_and_empty_traffic(self):
        with mock.patch.object(m,"native_sql",return_value="BEGIN\nMonday Night Mayhem\nROLLBACK"):
            with mock.patch.object(m,"page",side_effect=[
                "Monday Night Mayhem","WOLOMANIA I"
            ]):
                with self.assertRaisesRegex(m.Hold,"CANDIDATE_PUBLISHED_EVENT_MISSING"):
                    m.candidate_content()
            with mock.patch.object(m,"page",side_effect=[
                "Monday Night Mayhem","Monday Night Mayhem","No published completed-day Traffic report is available"
            ]):
                with self.assertRaisesRegex(m.Hold,"CANDIDATE_CERTIFIED_AND_OBSERVED_TRAFFIC_MISSING"):
                    m.candidate_content()

    def test_execute_is_nonpublic_and_journalled_before_mutation(self):
        source=PATH.read_text()
        self.assertIn('seal(journal/"entered.json"',source)
        self.assertLess(source.index('seal(journal/"entered.json"'),source.index('invoke("/usr/bin/systemctl","stop",new.PROD_UNIT'))
        self.assertIn('need(not journal.exists(),"NONCE_ALREADY_USED")',source)
        self.assertIn('no_public_cutover":True',source)
        self.assertIn('financial_authorized":False',source)
        self.assertIn('seal(journal/"rollback.json"',source)
        self.assertIn('rollback_witness_dir=journal/"rollback-requalification"',source)
        self.assertIn('seal(rollback_witness_dir/"runtime-admission.json"',source)
        self.assertIn('prior["journal_path"]=str(rollback_witness_dir)',source)
        self.assertNotIn('seal(journal/"runtime-admission.json",restore_admission)',source)
        self.assertIn("new.production_witness(",source)
        self.assertIn("old.production_witness(",source)
        self.assertNotIn('systemctl","restart","aoe2hdbets-web.service"',source)
        self.assertNotIn('systemctl","stop","aoe2hdbets-web.service"',source)

if __name__=="__main__":
    unittest.main()
