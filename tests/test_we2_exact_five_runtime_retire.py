"""Focused nonprivileged negative contracts. Never execute against HEL1."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "release"
sys.path.insert(0, str(SOURCE))
import we2_exact_five_runtime_retire_v1 as root
import we2_exact_five_owner_permit_v1 as owner


def preview():
    return dict(schema=root.SCHEMA, status="PREVIEW_ONLY",
                authority="OWNER_SIGNATURE_NOT_CONSUMED",
                controller_sha256="a"*64,
                owner_spki_sha256="b"*64,
                inventory_sha256=root.inventory_digest(),
                targets=root.exact_inventory(),
                gross_allocated_bytes=7941881856,
                free_root_before_bytes=6971006976,
                health={"runtime":"fcd58f2ac05b","https_200":True,
                        "protected_up":[3030,3032,3033,9447],
                        "financial_down":[8092,8093,8094,8095]})


def signed_payload():
    p = preview()
    t = datetime.now(timezone.utc)
    return {"schema":root.SCHEMA,"action":"RETIRE_EXACT_FIVE_ONLY",
            "owner":"Emaren","financial_authorized":False,
            "controller_sha256":p["controller_sha256"],
            "owner_spki_sha256":p["owner_spki_sha256"],
            "inventory_sha256":p["inventory_sha256"],
            "targets":p["targets"],"live_runtime":p["health"]["runtime"],
            "nonce":"N"*40,
            "issued_utc":(t-timedelta(seconds=1)).isoformat(),
            "expires_utc":(t+timedelta(minutes=10)).isoformat()}


class ExactFiveContracts(unittest.TestCase):
    def test_unique_exact_five_root_source_scope(self):
        e=root.exact_inventory()
        self.assertEqual(len(e),5)
        self.assertEqual(len({x["path"] for x in e}),5)
        self.assertEqual(sum(x["gross_allocated_bytes"] for x in e),7941881856)
        self.assertTrue(all(x["path"].startswith("/var/lib/aoe2war-web-prod-") for x in e))
        self.assertFalse(any(x["prefix"] in root.KEEP for x in e))
        self.assertFalse(any("~" in x["path"] or "*" in x["path"] for x in e))
    def test_expected_source_inventory_hash(self):
        self.assertEqual(root.inventory_digest(),
                         "13b16eaebb692c0fdc2e299824193fc0dcdd4545c3daf71dfbd0f994e39c837c")
    def test_nonroot_execution_rejected_before_mutation(self):
        self.assertNotEqual(os.geteuid(),0)
        with self.assertRaisesRegex(root.Hold,"EXACT_ROOT_LINUX_ONLY"):
            root.execute(Path("/tmp/unapproved-owner-permit.json"))
    def test_real_root_preview_not_forgeable_from_uid650(self):
        r=subprocess.run([sys.executable,str(SOURCE/"we2_exact_five_runtime_retire_v1.py"),
                          "--preview"],capture_output=True,text=True,timeout=10)
        self.assertEqual(r.returncode,2)
        self.assertIn("EXACT_ROOT_LINUX_ONLY",r.stderr)
    def test_scope_packet_validates_before_signature(self):
        p=preview();x=signed_payload()
        self.assertEqual(root.validate_packet({"payload":x,"signature_base64":"unused"},p,
                                               now=datetime.now(timezone.utc)),x)
    def test_wrong_controller_source_denied(self):
        p=preview();x=signed_payload();x["controller_sha256"]="c"*64
        with self.assertRaises(root.Hold):root.validate_packet({"payload":x,"signature_base64":""},p,now=datetime.now(timezone.utc))
    def test_one_other_directory_denied(self):
        p=preview();x=signed_payload();x["targets"][0]["path"]="/var/lib/aoe2war-web-prod-9a51e962a7fb"
        with self.assertRaises(root.Hold):root.validate_packet({"payload":x,"signature_base64":""},p,now=datetime.now(timezone.utc))
    def test_inode_switch_denied(self):
        p=preview();x=signed_payload();x["targets"][0]["root_inode"]+=1
        with self.assertRaises(root.Hold):root.validate_packet({"payload":x,"signature_base64":""},p,now=datetime.now(timezone.utc))
    def test_extra_target_denied(self):
        p=preview();x=signed_payload();x["targets"].append(dict(x["targets"][0]))
        with self.assertRaises(root.Hold):root.validate_packet({"payload":x,"signature_base64":""},p,now=datetime.now(timezone.utc))
    def test_financial_grant_denied(self):
        p=preview();x=signed_payload();x["financial_authorized"]=True
        with self.assertRaises(root.Hold):root.validate_packet({"payload":x,"signature_base64":""},p,now=datetime.now(timezone.utc))
    def test_wrong_signer_denied(self):
        p=preview();x=signed_payload();x["owner"]="OtherUser"
        with self.assertRaises(root.Hold):root.validate_packet({"payload":x,"signature_base64":""},p,now=datetime.now(timezone.utc))
    def test_expired_packet_denied(self):
        p=preview();x=signed_payload()
        x["issued_utc"]="2026-11-01T00:00:00Z"
        x["expires_utc"]="2026-11-01T00:10:00Z"
        with self.assertRaises(root.Hold):root.validate_packet({"payload":x,"signature_base64":""},p,now=datetime.now(timezone.utc))
    def test_too_long_expiry_denied(self):
        p=preview();x=signed_payload()
        x["expires_utc"]=(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()
        with self.assertRaises(root.Hold):root.validate_packet({"payload":x,"signature_base64":""},p,now=datetime.now(timezone.utc))
    def test_nonce_denial(self):
        p=preview();x=signed_payload();x["nonce"]="../../escaped"
        with self.assertRaises(root.Hold):root.validate_packet({"payload":x,"signature_base64":""},p,now=datetime.now(timezone.utc))
    def test_duplicate_packet_keys_rejected(self):
        with self.assertRaises(root.Hold):
            json.loads('{"action":"good","action":"evil"}',object_pairs_hook=root.unique_pairs)
    def test_owner_source_preview_rejects_false_status(self):
        p=preview();p["status"]="ROOT_RETIRED"
        with self.assertRaises(root.Hold):owner.validate_preview(p,"a"*64)
    def test_owner_source_preview_rejects_missing_listener(self):
        p=preview();p["health"]["protected_up"]=[3032,3033,9447]
        with self.assertRaises(root.Hold):owner.validate_preview(p,"a"*64)
    def test_owner_source_preview_rejects_expanded_scope(self):
        p=preview();p["targets"].append({"path":"/var/lib/finance"})
        with self.assertRaises(root.Hold):owner.validate_preview(p,"a"*64)
    def test_owner_source_preview_rejects_unsigned_controller(self):
        with self.assertRaises(root.Hold):owner.validate_preview(preview(),"c"*64)
    def test_receipt_exact_name_no_overwrite(self):
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(root,"STATE",Path(td)):
                root.receipt_write("nonce-GOOD.json",{"test":True})
                with self.assertRaises(FileExistsError):
                    root.receipt_write("nonce-GOOD.json",{"test":False})
                self.assertTrue((Path(td)/"nonce-GOOD.json").is_file())
                with self.assertRaises(root.Hold):
                    root.receipt_write("../WRONG.json",{"test":False})
    def test_guarded_destroy_exact_isolated_fixture(self):
        # Actual shutil.rmtree is exercised only against a temporary UID650
        # fixture, never a HEL1 path; production inspect/health are mocked.
        with tempfile.TemporaryDirectory() as td:
            parent = Path(td)
            target = parent / "aoe2war-web-prod-FIXTURE"
            target.mkdir()
            (target / "generated.txt").write_text("discardable fixture")
            entry = {"path":str(target),"prefix":"FIXTURE",
                     "root_inode":target.stat().st_ino,
                     "root_dev":target.stat().st_dev}
            with mock.patch.object(root,"PARENT",parent), \
                 mock.patch.object(root,"inspect_one"), \
                 mock.patch.object(root,"live_refs"), \
                 mock.patch.object(root,"services"), \
                 mock.patch.object(root,"free_bytes",side_effect=[1000,2500]):
                self.assertEqual(root.guarded_destroy(entry,"N"*40),(1000,2500))
                self.assertFalse(target.exists())
                self.assertFalse(any(parent.iterdir()))

    def test_predelete_health_failure_restores_original_name(self):
        with tempfile.TemporaryDirectory() as td:
            parent = Path(td)
            target = parent / "aoe2war-web-prod-FIXTURE"
            target.mkdir()
            (target / "unique.txt").write_text("original must survive")
            entry = {"path":str(target),"prefix":"FIXTURE",
                     "root_inode":target.stat().st_ino,
                     "root_dev":target.stat().st_dev}
            with mock.patch.object(root,"PARENT",parent), \
                 mock.patch.object(root,"inspect_one"), \
                 mock.patch.object(root,"live_refs"), \
                 mock.patch.object(root,"services",side_effect=root.Hold("WEBSITE_CHANGED")), \
                 mock.patch.object(root,"free_bytes",return_value=1000):
                with self.assertRaises(root.Hold):
                    root.guarded_destroy(entry,"N"*40)
            self.assertTrue(target.is_dir())
            self.assertEqual((target/"unique.txt").read_text(),"original must survive")

    def test_no_legacy_owner_permit_domain(self):
        self.assertNotEqual(root.DOMAIN,b"AOE2WAR.RETIRE_STAGE_ONLY.V1\n")
        self.assertNotIn("RETIRE_STAGE_ONLY",root.SCHEMA)


if __name__=="__main__":
    unittest.main()
