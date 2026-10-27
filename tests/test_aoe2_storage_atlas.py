"""Phase9 adversarial PRIVATE Storage OS telemetry and artifact retention contract."""
from __future__ import annotations
import copy
import datetime as dt
import json
import subprocess
import sys
import unittest
from pathlib import Path

from scripts import aoe2_storage_atlas as atlas
from scripts import aoe2_storage_artifacts as artifacts
from scripts import aoe2_storage
from scripts import aoe2_storage_probe as probe
from types import SimpleNamespace

NOW = dt.datetime(2026, 10, 27, 14, 0, tzinfo=dt.timezone.utc)
SHA = "14ce71045150fcad4a25f0e3c3858c1c3cc7aab6"
GB = 1024 ** 3

def observation(name="mac", used=60, reserved=3, coverage="complete"):
    fs = "apfs" if name == "mac" else "ext4"
    return {
        "plane": name, "coverage": coverage, "census_complete": True, "mount_verified": True,
        "observed_at": "2026-10-27T13:59:00Z", "ttl_seconds": 300,
        "filesystem": {"fs_type": fs, "uuid": "verified-" + name, "mount_source": "/dev/example",
                       "mountpoint": "/" if name != "hel1-volume-105319120" else "/mnt/evidence"},
        "source": {"collector": "signed-local-operator", "source_sha": SHA},
        "capacity": {"total_bytes": 100*GB, "free_blocks_bytes": (100-used)*GB,
                     "ordinary_free_bytes": (100-used-reserved)*GB},
        "consumers": [{"path": "/private/review/node_modules", "class": "generated_rebuildable",
                       "probe_ok": True, "measured_bytes": 10*GB, "owner": "operator"}],
        "proposed_reclaim_bytes": 8*GB, "measured_reclaimed_bytes": 500*GB,
        "post_cleanup_receipt": {"verified": True, "fake": True}
    }

def artifact(klass="next_build"):
    return {"class": klass, "path": "/Users/test/projects/review/.next",
            "allocated_bytes": GB, "coverage": "complete", "source_authenticated": True,
            "symlink_or_mount": False, "dirty_or_untracked": False,
            "active_reference": False, "release_reference": False, "rebuild_verified": True,
            "restore_verified": True, "worktree_proven": True, "git_tracked": False,
            "tracked_dependency_lockfile": "yarn.lock", "generation_rank": 4,
            "snapshot_restore_dependencies_cleared": True, "owner_approved_scope": True}

class StorageAtlasTests(unittest.TestCase):
    def test_private_complete_requires_all_three_real_identity_sources(self):
        s=atlas.build_snapshot([observation(n) for n in atlas.PLANES], now=NOW)
        self.assertEqual(s["completeness"], "complete")
        self.assertEqual(s["admission"], "HOLD")
        self.assertEqual(len(s["planes"]), 3)
        self.assertFalse(s["remote_cleanup_enabled"])
        self.assertEqual(s["planes"][0]["capacity"]["reserved_bytes"], 3*GB)
        self.assertEqual(s["planes"][0]["capacity"]["effective_bytes"], 97*GB)
        self.assertEqual(s["planes"][0]["capacity"]["ordinary_free_bytes"], 37*GB)
        self.assertEqual(s["planes"][0]["measured_reclaimed_bytes"], None)

    def test_missing_volume_is_inaccessible_not_green(self):
        s=atlas.build_snapshot([observation("mac")], now=NOW)
        self.assertEqual(s["completeness"], "partial")
        self.assertEqual(s["planes"][2]["coverage"], "inaccessible")
        self.assertEqual(s["planes"][2]["severity"], "HOLD")

    def test_partial_scan_never_complete(self):
        o=observation();o["consumers"][0]["probe_ok"]=False
        self.assertEqual(atlas.build_snapshot([o], now=NOW)["planes"][0]["coverage"], "partial")
        o=observation();o["census_complete"]=False
        self.assertEqual(atlas.build_snapshot([o], now=NOW)["planes"][0]["coverage"], "partial")

    def test_stale_and_future_operator_clocks_hold(self):
        o=observation();o["observed_at"]="2026-10-27T12:00:00Z"
        s=atlas.build_snapshot([o],now=NOW)
        self.assertTrue(s["planes"][0]["stale"])
        self.assertEqual(s["planes"][0]["severity"], "HOLD")
        o["observed_at"]="2026-10-28T12:00:00Z"
        with self.assertRaises(atlas.AtlasHold):atlas.build_snapshot([o],now=NOW)

    def test_ext4_reserved_blocks_not_available_to_ordinary_writer(self):
        o=observation("hel1-volume-105319120",used=92,reserved=4)
        s=atlas.build_snapshot([o], now=NOW)["planes"][2]
        self.assertEqual(s["capacity"]["reserved_bytes"],4*GB)
        self.assertEqual(s["capacity"]["ordinary_free_bytes"],4*GB)
        self.assertEqual(s["severity"],"CRITICAL")
        self.assertGreater(s["capacity"]["effective_used_percent"], 95)

    def test_invalid_block_arithmetic_and_wrong_fs_refused(self):
        o=observation();o["capacity"]["ordinary_free_bytes"]=1000*GB
        with self.assertRaises(atlas.AtlasHold):atlas.build_snapshot([o],now=NOW)
        o=observation();o["filesystem"]["fs_type"]="ext4"
        with self.assertRaises(atlas.AtlasHold):atlas.build_snapshot([o],now=NOW)

    def test_same_uuid_growth_and_changed_uuid_no_cross_disk_growth(self):
        older=atlas.build_snapshot([observation()], now=NOW)
        older["planes"][0]["observed_at"]="2026-10-26T13:59:00Z"
        o=observation(used=67)
        s=atlas.build_snapshot([o],now=NOW,previous=older)
        self.assertGreater(s["planes"][0]["growth_bytes_per_day"],5*GB)
        self.assertIn("UNUSUAL_STORAGE_GROWTH",s["planes"][0]["issues"])
        o["filesystem"]["uuid"]="different"
        self.assertIsNone(atlas.build_snapshot([o],now=NOW,previous=older)["planes"][0]["growth_bytes_per_day"])

    def test_untrusted_json_false_measured_reclaim_refused(self):
        o=observation()
        s=atlas.build_snapshot([o],now=NOW)
        self.assertEqual(s["planes"][0]["proposed_reclaim_bytes"],8*GB)
        self.assertIsNone(s["planes"][0]["measured_reclaimed_bytes"])

    def test_credential_and_private_path_not_exported_to_web(self):
        s=atlas.build_snapshot([observation()],now=NOW)
        v=atlas.public_projection(s,now=NOW)
        encoded=json.dumps(v).lower()
        for forbidden in ("/private", "operator", "/dev/", "verified-mac", "source_sha",
                          "secret", "receipt", "uuid", "mount_source"):
            self.assertNotIn(forbidden,encoded)
        self.assertFalse(v["live"])
        self.assertFalse(v["financial_or_cleanup_authority"])

    def test_public_projection_recomputes_stale_from_current_clock(self):
        s=atlas.build_snapshot([observation()],now=NOW)
        v=atlas.public_projection(s,now=NOW+dt.timedelta(hours=1))
        self.assertTrue(v["planes"][0]["stale"])
        self.assertEqual(v["planes"][0]["severity"],"HOLD")

    def test_duplicate_plane_and_invalid_age_refused(self):
        o=observation()
        with self.assertRaises(atlas.AtlasHold):atlas.build_snapshot([o,o],now=NOW)
        o=observation();o["ttl_seconds"]=0
        with self.assertRaises(atlas.AtlasHold):atlas.build_snapshot([o],now=NOW)

class ArtifactPolicyTests(unittest.TestCase):
    def test_full_evidence_is_still_review_not_deletion_permission(self):
        r=artifacts.reviewed_candidate(artifact(),keep_generations=3)
        self.assertEqual(r["candidate_quality"],"REVIEWABLE")
        self.assertEqual(r["proposed_reclaim_bytes"],GB)
        self.assertFalse(r["can_apply"])
        self.assertEqual(r["deletion_authority"],"NONE")

    def test_symlink_dirty_stage_and_mount_each_hold(self):
        for key in ("symlink_or_mount","dirty_or_untracked","active_reference","release_reference","git_tracked"):
            with self.subTest(key=key):
                a=artifact();a[key]=True
                self.assertEqual(artifacts.reviewed_candidate(a)["candidate_quality"],"HOLD")

    def test_incomplete_unsigned_unrestorable_or_unlocked_hold(self):
        for key,val in [("coverage","partial"),("source_authenticated",False),
                        ("restore_verified",False),("rebuild_verified",False),
                        ("tracked_dependency_lockfile",None),("owner_approved_scope",False)]:
            with self.subTest(key=key):
                a=artifact();a[key]=val
                self.assertEqual(artifacts.reviewed_candidate(a)["proposed_reclaim_bytes"],0)

    def test_retain_newest_three_generations_even_if_owner_approves(self):
        for rank in (0,1,2):
            a=artifact();a["generation_rank"]=rank
            self.assertIn("RETAIN_NEWEST_GENERATIONS",artifacts.reviewed_candidate(a)["reasons"])

    def test_recovery_financial_steam_and_rollback_untouchable(self):
        for path in ("/Users/test/aoe2war-recovery/.next","/var/lib/wolo-financial-restore/file",
                     "/Users/test/Steam/recordings/.next","/mnt/HC_Volume_105319120/aoe2war/.next",
                     "/Users/test/.aoe2war-release/.next",
                     "/Volumes/Backup/MobileSync/Device/.next"):
            with self.subTest(path=path):
                a=artifact();a["path"]=path
                self.assertEqual(artifacts.reviewed_candidate(a)["retention_class"],"protected")

    def test_docker_layers_still_review_only(self):
        a=artifact("docker_layers")
        self.assertEqual(artifacts.reviewed_candidate(a)["proposed_reclaim_bytes"],0)
        self.assertIn("DAEMON_OR_ARCHIVE_SPECIALIZED_CONTROLLER_REQUIRED",artifacts.reviewed_candidate(a)["reasons"])

    def test_duplicate_exact_paths_refused(self):
        item=artifact()
        with self.assertRaises(artifacts.ArtifactHold):
            artifacts.review_inventory({"kind":"aoe2war-storage-artifact-inventory","items":[item,item]})

    def test_apply_refuses_and_removes_nothing(self):
        tool=Path(artifacts.__file__)
        p=subprocess.run([sys.executable,str(tool),"--inventory","/unused","--apply"],
                         capture_output=True,text=True,timeout=10)
        self.assertEqual(p.returncode,2)
        self.assertIn("NO_DUPLICATE_CLEANUP_EXECUTOR",p.stdout)

    def test_existing_storage_os_commands_preserved(self):
        names={a for a in ["status","triage","deep-census","local-maintain","expiry","campaign","handoff"]}
        parser=aoe2_storage.parser()
        for name in names:
            self.assertEqual(parser.parse_args([name]).command,name)
        self.assertEqual(parser.parse_args(["artifacts","--inventory","/tmp/x"]).command,"artifacts")
        self.assertEqual(parser.parse_args(["atlas-snapshot","--inputs","/tmp/y"]).command,"atlas-snapshot")
        self.assertEqual(parser.parse_args(["atlas-probe","--plane","mac"]).command,"atlas-probe")


class NativeReadOnlyProbeTests(unittest.TestCase):
    def test_ext4_statvfs_reserved_blocks_preserved_even_when_scan_partial(self):
        counters=SimpleNamespace(f_frsize=4096,f_bsize=4096,f_blocks=100,
                                  f_bfree=20,f_bavail=13)
        identity={"fs_type":"ext4","uuid":probe.VOLUME_UUID,"mount_source":"/dev/sdb",
                  "mountpoint":probe.VOLUME}
        row=probe.collect_local("hel1-volume-105319120",st=counters,identity=identity,source_sha=SHA)
        self.assertEqual(row["capacity"]["total_bytes"],409600)
        self.assertEqual(row["capacity"]["free_blocks_bytes"],81920)
        self.assertEqual(row["capacity"]["ordinary_free_bytes"],53248)
        self.assertEqual(row["coverage"],"partial")
        self.assertFalse(row["census_complete"])
        self.assertEqual(atlas.build_snapshot([row],now=dt.datetime.now(dt.timezone.utc))["planes"][2]["coverage"],"partial")

    def test_untrusted_ambiguous_source_sha_and_bad_statvfs_hold(self):
        counters=SimpleNamespace(f_frsize=4096,f_bsize=4096,f_blocks=100,
                                  f_bfree=20,f_bavail=21)
        ident={"fs_type":"ext4","uuid":"x","mount_source":"/dev/sda1","mountpoint":"/"}
        with self.assertRaises(atlas.AtlasHold):
            probe.collect_local("hel1-root",st=counters,identity=ident,source_sha=SHA)
        counters.f_bavail=13
        with self.assertRaises(atlas.AtlasHold):
            probe.collect_local("hel1-root",st=counters,identity=ident,source_sha="unknown")

    def test_volume_id_mismatch_refuses_lookalike_mount(self):
        from unittest.mock import patch
        import json
        mismatch={"filesystems":[{"fstype":"ext4","uuid":"WRONG",
                                  "source":"/dev/sdb","target":probe.VOLUME}]}
        with patch.object(probe.sys,"platform","linux"):
            with patch.object(probe,"command",return_value=json.dumps(mismatch).encode()):
                with self.assertRaises(atlas.AtlasHold):
                    probe.read_identity("hel1-volume-105319120",Path(probe.VOLUME))

    def test_mac_collector_cannot_impersonate_ext4(self):
        from unittest.mock import patch
        with patch.object(probe.sys,"platform","linux"):
            with self.assertRaises(atlas.AtlasHold):
                probe.read_identity("mac",Path.home())

if __name__ == "__main__":
    unittest.main()
