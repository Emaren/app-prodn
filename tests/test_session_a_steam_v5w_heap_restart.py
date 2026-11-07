"""SHA-preserving v5w is a fresh PID-bound steam-only admission, not auto-repair."""
from __future__ import annotations
import hashlib
import importlib.util
from pathlib import Path
from unittest import TestCase, mock

ROOT=Path(__file__).resolve().parents[1]
OLD=ROOT/"scripts/release/r25_steam_refresh_v5v.py"
NEW=ROOT/"scripts/release/r25_steam_refresh_v5w.py"
REPLACEMENTS={
 "r25_steam_refresh_public_recovery_v5v.py":"r25_steam_refresh_public_recovery_v5w.py",
 "web-prod-v5v/steam-refresh-policy.json":"web-prod-v5w/steam-refresh-policy.json",
 "web-prod-v5v/runtime-restart-admission.json":"web-prod-v5w/runtime-restart-admission.json",
 "aoe2war.app.steam-runtime-readmission.v5v":"aoe2war.app.steam-runtime-readmission.v5w",
 "aoe2war.app.r25.steam-refresh-after-verified-public-cutover.v5v":"aoe2war.app.r25.steam-refresh-after-verified-public-cutover.v5w",
 "PASS:R25_STEAM_REFRESH_V5V_STATIC_POLICY_SHAPE":"PASS:R25_STEAM_REFRESH_V5W_STATIC_POLICY_SHAPE",
}

class V5wExactBoundSteamRestart(TestCase):
    def test_no_semantic_changes_to_fully_reviewed_steam_egress_controller(self):
        expected=OLD.read_text()
        for old,new in REPLACEMENTS.items():
            self.assertIn(old,expected)
            expected=expected.replace(old,new)
        self.assertEqual(NEW.read_text(),expected)

    def test_fresh_admission_is_required_and_not_reused(self):
        s=NEW.read_text()
        self.assertIn("web-prod-v5w/runtime-restart-admission.json",s)
        self.assertIn("web-prod-v5w/steam-refresh-policy.json",s)
        self.assertIn('a["current_public_pid"]>1',s)
        self.assertIn('proc_start_ticks(pid)==a["start_ticks"]',s)
        self.assertIn('"R25_PUBLIC_RUNTIME_CHANGED"',s)
        self.assertIn('a["approval_scope"]=="STEAM_ONLY_EXISTING_UID990_NFT_SETS"',s)
        self.assertIn('a["finance_authorized"] is False',s)
        self.assertIn('a["public_release_receipt_sha256"]==sha(rawfile(RECEIPT,0o600))',s)
        self.assertIn('check(obj==expected',s)
        self.assertIn('m.production_protected()==before',s)
        self.assertIn('validated=m.production_steam_dns_diversity',s)
        self.assertIn('"ttl_seconds":300',s)
        for banned in ("IGNORE_FINANCE_SNAPSHOT","ALLOW_ANY_PID","DISABLE_UNIT_CHECK","3040"):
            self.assertNotIn(banned,s)

    def test_old_original_source_and_release_pins_preserved(self):
        old=OLD.read_text()
        new=NEW.read_text()
        for constant in ("ORIG_SHA","WEB_UNIT_SHA","NGINX_SHA","RELEASE","BUILD_ID","GIT_SHA",
                         "ORIGINAL_NGINX_PREIMAGE_SHA","RECOVERY_MAP_SHA","TIMER_SHA","TIMER_SERVICE_SHA"):
            import re
            pattern=rf'(?m)^{constant}=.*$'
            self.assertEqual(re.findall(pattern,old),re.findall(pattern,new),constant)
        self.assertIn('RECEIPT=Path("/var/lib/aoe2war-app-production-f/',new)
        self.assertIn('SOURCE_STAGE=Path("/var/lib/aoe2war-web-prod-1c4ffe0ce31e")',new)

    def test_runtime_unknown_or_changed_still_hard_holds(self):
        spec=importlib.util.spec_from_file_location("v5w_source_only",NEW)
        m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        with mock.patch.object(m,"rawfile",side_effect=OSError("no owner admission")):
            with self.assertRaises(OSError):
                m.bound_runtime_pid({"pid3032":1766058})
        self.assertEqual(m.sha(b"source"),hashlib.sha256(b"source").hexdigest())

if __name__=="__main__":
 import unittest
 unittest.main()
