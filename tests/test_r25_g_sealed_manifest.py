"""Consume accepted C proof without repeating its87,038-file readback."""
import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("g_sealed",ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py")
g=importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

class AcceptedManifest(unittest.TestCase):
    def fixture(self):
        static=".next/static/"+g.C_PHYSICAL_BUILD_ID+"/_buildManifest.js"
        files={"r24-source-sha":(g.TARGET+"\n").encode(),
               ".next/BUILD_ID":(g.C_PHYSICAL_BUILD_ID+"\n").encode(),
               ".aoe2war-build-version":(g.C_PHYSICAL_APP_VERSION+"\n").encode(),
               static:b"self.__BUILD_MANIFEST={};"}
        rows=[{"path":path,"type":"file","size":len(raw),"sha256":g.digest(raw)}
              for path,raw in files.items()]
        tree=g.digest(g.canon(rows))
        srcrows=[]
        source={"status":"SOURCE_STAGED","candidate_sha":g.TARGET,
                "git_archive_sha256":g.ARCHIVE_SHA,"source_manifest_sha256":g.digest(g.canon(srcrows))}
        built={"status":"BUILD_STAGED","candidate_sha":g.TARGET,
               "source_git_archive_sha256":g.ARCHIVE_SHA,"tree_sha256":tree,
               "files":len(rows),"build_id":g.C_PHYSICAL_BUILD_ID,
               "build_version":g.C_PHYSICAL_APP_VERSION,"root_sealed":True,
               "financial_writes_authorized":False,"old_web_pid_untouched":g.EXPECTED_OLD_PID}
        raw_source=g.canon(source);raw_built=g.canon(built)
        contents={g.C_AUDIT/"SOURCE_STAGED.json":raw_source,
                  g.C_AUDIT/"BUILD_STAGED.json":raw_built,
                  g.C_AUDIT/"SOURCE_FILES.json":g.canon({"schema":"r25-c-source-files.v1","rows":srcrows}),
                  g.C_AUDIT/"BUILD_FILES.json":g.canon({"schema":"aoe2war.r25.c.full-artifact-files.v1","rows":rows}),
                  **{g.STAGE/path:raw for path,raw in files.items()}}
        return contents,static,tree,g.digest(raw_source),g.digest(raw_built)

    def verify(self,contents,tree,source_sha,build_sha):
        with mock.patch.multiple(g,C_PHYSICAL_TREE_SHA256=tree,C_PHYSICAL_FILES=4,
                                 C_SOURCE_RECEIPT_SHA256=source_sha,C_BUILD_RECEIPT_SHA256=build_sha):
            with mock.patch.object(g,"protected_c_stage_boundary"),mock.patch.object(g,"root_sealed_file",return_value=True):
                with mock.patch.object(g,"bounded_tree",side_effect=AssertionError("duplicate tree scan")):
                    with mock.patch.object(g,"root_file",side_effect=lambda path,limit:contents[path]) as reader:
                        return g.verified_c_archive_source(),reader.call_args_list

    def test_reads_only_receipts_and_four_manifest_bound_witnesses(self):
        contents,static,tree,source_sha,build_sha=self.fixture()
        result,calls=self.verify(contents,tree,source_sha,build_sha)
        self.assertEqual(len(calls),8)
        self.assertEqual(result["static_manifest_file_sha256"],g.digest(contents[g.STAGE/static]))
        self.assertIs(result["accepted_full_tree_rehash_repeated"],False)

    def test_live_static_tampering_fails_even_with_accepted_manifest(self):
        contents,static,tree,source_sha,build_sha=self.fixture()
        contents[g.STAGE/static]=b"changed live bytes"
        with self.assertRaisesRegex(g.Hold,"C_BUILT_FILE_BYTES_CHANGED"):
            self.verify(contents,tree,source_sha,build_sha)

    def test_changed_receipt_fails_before_identity_reads(self):
        contents,static,tree,source_sha,build_sha=self.fixture()
        contents[g.C_AUDIT/"BUILD_STAGED.json"]+=b" "
        with self.assertRaisesRegex(g.Hold,"C_ACCEPTED_ROOT_RECEIPT_BYTES_CHANGED"):
            self.verify(contents,tree,source_sha,build_sha)

    def test_changed_manifest_cannot_reuse_the_accepted_tree_hash(self):
        contents,static,tree,source_sha,build_sha=self.fixture()
        raw=g.parse(contents[g.C_AUDIT/"BUILD_FILES.json"])
        raw["rows"][0]["sha256"]="0"*64
        contents[g.C_AUDIT/"BUILD_FILES.json"]=g.canon(raw)
        with self.assertRaisesRegex(g.Hold,"C_ROOT_SOURCE_OR_BUILD_MANIFEST_DIGEST_DRIFT"):
            self.verify(contents,tree,source_sha,build_sha)

class NativeUnits(unittest.TestCase):
    def monitor(self,stamp,command="/usr/bin/monitor",state="inactive",reload="no"):
        unit="wolo-mainnet-health.service"
        raw=("Id="+unit+"\nType=oneshot\nTriggeredBy=wolo-mainnet-health.timer\n"
             "MainPID=0\nActiveState="+state+"\nNeedDaemonReload="+reload+"\n"
             "FragmentPath=/etc/systemd/system/"+unit+"\nDropInPaths=\n"
             "ExecMainStartTimestampMonotonic="+str(stamp)+"\n"
             "ExecStart={ path="+command+" ; argv[]="+command+" ; ignore_errors=no ; "
             "start_time=["+str(stamp)+"] ; stop_time=[] ; pid=0 ; code=exited ; status=0 }\n").encode()
        with mock.patch.object(g,"run",side_effect=[b"unchanged config",raw]):
            return g.show(unit)

    def test_monitor_run_metadata_changes_without_losing_effective_command(self):
        self.assertEqual(self.monitor(100),self.monitor(200))
        self.assertNotEqual(self.monitor(100),self.monitor(100,command="/usr/bin/changed"))

    def test_active_or_unloaded_monitor_fails_closed(self):
        for kw in ({"state":"activating"},{"reload":"yes"}):
            with self.subTest(kw=kw),self.assertRaisesRegex(g.Hold,"MONITOR_ONESHOT_IDENTITY_OR_ACTIVITY_DRIFT"):
                self.monitor(100,**kw)

    def test_timer_does_not_need_a_fictional_mainpid(self):
        raw=b"Id=wolo-mainnet-health.timer\nActiveState=active\nFragmentPath=/etc/systemd/system/wolo-mainnet-health.timer\nDropInPaths=\n"
        with mock.patch.object(g,"run",side_effect=[b"timer config",raw]):
            obj=g.show("wolo-mainnet-health.timer")
        self.assertIsNone(obj["main_process"])
        self.assertNotIn("MainPID",obj["properties"])

    def test_template_is_a_configuration_identity_not_a_process(self):
        with mock.patch.object(g,"run",return_value=b"template config") as runner:
            obj=g.show("postgresql@.service")
        self.assertIs(obj["template"],True)
        self.assertEqual(runner.call_count,1)

    def test_census_includes_loaded_postgres_instance(self):
        installed=("\n".join([g.OLD_UNIT,g.NEW_UNIT,"postgresql@.service"]+
                   ["aoe2-example%02d.timer"%i for i in range(23)])+"\n").encode()
        with mock.patch.object(g,"run",side_effect=[installed,b"postgresql@16-main.service loaded active running PostgreSQL\n"]):
            names=g.finance_units()
        self.assertIn("postgresql@16-main.service",names)

if __name__=="__main__":
    unittest.main()
