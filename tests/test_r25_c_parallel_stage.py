"""R25 C additive source archive, build and candidate gate tests."""
import io,importlib.util,json,os,pathlib,stat,subprocess,tarfile,tempfile,types,unittest
from unittest import mock

BASE=pathlib.Path(__file__).resolve().parents[1]
SRC=BASE/"scripts/aoe2_r25_c_parallel_stage.py"
MAC=BASE/"scripts/aoe2_r25_c_owner_mac.py"
UNIT=BASE/"deploy/aoe2hdbets-web-r24.service"
VERIFIER=BASE/"scripts/aoe2_r25_c_stage_verify.py"
def load(path):
    spec=importlib.util.spec_from_file_location(path.stem,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module
class R25StageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s=load(SRC);cls.m=load(MAC);cls.v=load(VERIFIER)
    def make_tar(self,root,name="src.tar",entries=None):
        f=pathlib.Path(root)/name
        with tarfile.open(f,"w:") as t:
            for path,kind in entries or [("package.json","file"),("lib/index.ts","file")]:
                info=tarfile.TarInfo(path)
                if kind=="file":
                    value=b"contents"
                    info.size=len(value)
                    t.addfile(info,io.BytesIO(value))
                elif kind=="directory":
                    info.type=tarfile.DIRTYPE;t.addfile(info)
                elif kind=="symlink":
                    info.type=tarfile.SYMTYPE;info.linkname="../../etc/passwd";t.addfile(info)
        return f
    def test_01_source_and_mac_compile(self):
        compile(SRC.read_bytes(),str(SRC),"exec")
        compile(MAC.read_bytes(),str(MAC),"exec")
    def test_02_exact_git_identity(self):
        self.assertEqual(self.s.SHA,"0cee3c836c4b0760478280c145e02e81e470ce0e")
        self.assertEqual(self.m.SHA,self.s.SHA)
    def test_03_expected_F_stage_location(self):
        self.assertEqual(str(self.s.DEST),
          "/var/lib/aoe2war-r25-web-0cee3c836c4b")
        self.assertEqual(self.s.DEST.parent,pathlib.Path("/var/lib"))
        self.assertNotIn("AoE2HDBets",str(self.s.DEST))
    def test_04_both_runtime_users_separate(self):
        self.assertEqual(self.s.WEBUSER,"aoe2war-r24-web")
        self.assertEqual(self.s.BUILDER,"aoe2war-r24-build")
        self.assertNotEqual(self.s.BUILDER,self.s.WEBUSER)
    def test_05_no_real_B_positive_authority(self):
        with self.assertRaisesRegex(self.s.Hold,"B_AND_F_INDEPENDENT_POSITIVE_RUNTIME"):
            self.s.start_candidate()
    def test_06_archive_rejects_absolute_path(self):
        with tempfile.TemporaryDirectory() as d:
            f=self.make_tar(d,entries=[("/etc/secret","file")])
            with mock.patch.object(self.s,"SOURCE",f):
                with self.assertRaisesRegex(self.s.Hold,"ARCHIVE_PATH"):
                    self.s.tar_inventory()
    def test_07_archive_rejects_traversal(self):
        with tempfile.TemporaryDirectory() as d:
            f=self.make_tar(d,entries=[("../escape","file")])
            with mock.patch.object(self.s,"SOURCE",f):
                with self.assertRaisesRegex(self.s.Hold,"ARCHIVE_PATH"):
                    self.s.tar_inventory()
    def test_08_archive_rejects_links(self):
        with tempfile.TemporaryDirectory() as d:
            f=self.make_tar(d,entries=[("config","symlink")])
            with mock.patch.object(self.s,"SOURCE",f):
                with self.assertRaisesRegex(self.s.Hold,"ARCHIVE_SPECIAL_OR_LINK"):
                    self.s.tar_inventory()
    def test_09_archive_rejects_duplicate(self):
        with tempfile.TemporaryDirectory() as d:
            f=self.make_tar(d,entries=[("dup","file"),("dup","file")])
            with mock.patch.object(self.s,"SOURCE",f):
                with self.assertRaisesRegex(self.s.Hold,"ARCHIVE_DUPLICATE"):
                    self.s.tar_inventory()
    def test_10_safe_tar_emits_file_list(self):
        with tempfile.TemporaryDirectory() as d:
            f=self.make_tar(d,entries=[("source/file-%03d.txt"%i,"file") for i in range(101)])
            with mock.patch.object(self.s,"SOURCE",f):
                rows,total=self.s.tar_inventory()
            self.assertEqual(len(rows),101)
            self.assertEqual(total,808)
    def test_11_root_required_before_source_mutation(self):
        with mock.patch.object(self.s,"old_identity",side_effect=self.s.Hold("OLD")):
            with mock.patch.object(self.s,"archive_identity") as archive:
                with self.assertRaisesRegex(self.s.Hold,"OLD"):
                    self.s.stage_source("f"*64)
                archive.assert_not_called()
    def test_12_no_original_service_restart_in_source(self):
        text=SRC.read_text()+MAC.read_text()
        self.assertNotIn('systemctl","restart",OLD_UNIT',text)
        self.assertNotIn("git reset --hard",text)
        self.assertNotIn("git clean",text)
        self.assertNotIn("os.unlink(SOURCE",text)
    def test_13_old_web_identity_pinned(self):
        self.assertEqual(self.s.OLD_PID,2625090)
        self.assertEqual(self.s.NEW_UNIT,"aoe2hdbets-web-r24.service")
    def test_14_service_has_no_original_dependencies(self):
        x=UNIT.read_text()
        self.assertIn("User=aoe2war-r24-web",x)
        self.assertIn("--port 3031",x)
        self.assertIn("WARGRAPH_RUNTIME_DISABLED=true",x)
        self.assertIn("approved-runtime-prestart.py",x)
        self.assertNotIn("Requires=aoe2hdbets-web.service",x)
        self.assertNotIn("EnvironmentFile=/etc/aoe2hdbets",x)
    def test_15_build_has_separate_network_phases(self):
        x=SRC.read_text()
        self.assertIn("PrivateNetwork=yes",x)
        self.assertIn("--ignore-scripts",x)
        self.assertIn("--frozen-lockfile",x)
        self.assertIn("--offline",x)
        self.assertIn("IPAddressDeny=localhost",x)
        self.assertIn("root:root",x)
        self.assertIn("BUILD_STAGED.json",x)
    def test_16_mac_owner_flag_no_tty_prompt(self):
        x=MAC.read_text()
        self.assertNotIn('open("/dev/tty"',x)
        self.assertIn('"--owner-approved",action="store_true"',x)
        self.assertIn('OWNER_APPROVAL_FLAG_REQUIRED',x)
        self.assertIn('OWNER_APPROVED_NONINTERACTIVE_PHASE=',x)

    def test_17_no_archive_sha_from_untrusted_remote(self):
        x=MAC.read_text()
        self.assertIn('"archive","--format=tar",SHA',x)
        self.assertIn("OWN",x.upper())
        self.assertIn("SOURCE_STAGED",SRC.read_text())
    def test_18_repeat_build_refused(self):
        x=SRC.read_text()
        self.assertIn('not (AUDIT/"BUILD_ATTEMPT.json").exists()',x)
    def test_19_source_build_is_single_additive_mode(self):
        x=SRC.read_text()
        self.assertIn('commands.add_argument("--source-build"',x)
        self.assertIn("stage_source(a.archive_sha256)\n        build_source()",x)
    def test_20_role_has_no_signed_permit_fabrication(self):
        x=SRC.read_text()
        self.assertNotIn("owner-private.pem",x)
        self.assertNotIn("root-helper-install-v2",x)
        self.assertNotIn("PRE_ACTIVATE",x)
    def fake_yarn(self,root,version="1.22.22"):
        root=pathlib.Path(root)
        src=root/"yarn-source"
        (src/"bin").mkdir(parents=True)
        (src/"lib").mkdir()
        (src/"package.json").write_text(json.dumps({"name":"yarn","version":version}))
        (src/"bin/yarn.js").write_text('require("../lib/cli.js");')
        (src/"lib/cli.js").write_text("console.log('fixture Yarn CLI');")
        output=root/"root-only-new-stage"
        output.mkdir()
        return src,output
    def test_21_bounded_yarn_ignores_unrelated_package_symlinks(self):
        with tempfile.TemporaryDirectory() as d:
            src,dest=self.fake_yarn(d)
            (src/"unsafe-unneeded-link").symlink_to("/etc/passwd")
            with mock.patch.object(self.s,"DEST",dest):
                with mock.patch.object(self.s.pwd,"getpwnam",
                                       return_value=types.SimpleNamespace(pw_uid=os.getuid())):
                    rows=self.s.import_yarn_classic_bounded(src)
            self.assertEqual(set(rows),{"package.json","bin/yarn.js","lib/cli.js"})
            self.assertEqual((dest/".r25-yarn/lib/cli.js").read_text(),
                             "console.log('fixture Yarn CLI');")
    def test_22_yarn_required_symlink_fails_without_stage_write(self):
        with tempfile.TemporaryDirectory() as d:
            src,dest=self.fake_yarn(d)
            (src/"bin/yarn.js").unlink()
            (src/"bin/yarn.js").symlink_to("/etc/passwd")
            with mock.patch.object(self.s,"DEST",dest):
                with mock.patch.object(self.s.pwd,"getpwnam",
                                       return_value=types.SimpleNamespace(pw_uid=os.getuid())):
                    with self.assertRaisesRegex(self.s.Hold,
                                                "YARN_REQUIRED_BUNDLE_NOT_SAFE"):
                        self.s.import_yarn_classic_bounded(src)
            self.assertFalse((dest/".r25-yarn").exists())
    def test_23_yarn_wrong_version_fails_before_root_copy(self):
        with tempfile.TemporaryDirectory() as d:
            src,dest=self.fake_yarn(d,"1.22.21")
            with mock.patch.object(self.s,"DEST",dest):
                with mock.patch.object(self.s.pwd,"getpwnam",
                                       return_value=types.SimpleNamespace(pw_uid=os.getuid())):
                    with self.assertRaisesRegex(self.s.Hold,
                                                "YARN_COREPACK_NOT_CLASSIC_1_22_22"):
                        self.s.import_yarn_classic_bounded(src)
            self.assertFalse((dest/".r25-yarn").exists())
    def test_24_no_yarn_reimport_after_partial_copy(self):
        with tempfile.TemporaryDirectory() as d:
            src,dest=self.fake_yarn(d)
            (dest/".r25-yarn").mkdir()
            with mock.patch.object(self.s,"DEST",dest):
                with self.assertRaisesRegex(self.s.Hold,"YARN_STAGE_ALREADY_EXISTS"):
                    self.s.import_yarn_classic_bounded(src)
    def test_25_no_recursive_privileged_yarn_copy(self):
        source=SRC.read_text()
        self.assertNotIn("shutil.copytree(",source)
        self.assertIn("os.O_NOFOLLOW",source)
        self.assertIn('"SOURCE_FILES.json",8*1024*1024,True',source)
        self.assertIn('yarn_import":yarn_receipt',source)
    def test_26_recovery_is_separate_one_use_cli(self):
        worker=SRC.read_text()
        owner=MAC.read_text()
        self.assertIn('commands.add_argument("--recover-dns"',worker)
        self.assertIn('elif a.recover_dns:recover_dns_build()',worker)
        self.assertIn('"recover-dns":"--recover-dns"',owner)
        self.assertIn('"recover-dns":"--recover-dns"',owner)
        self.assertIn('"recover-prebuild":"--recover-prebuild"',owner)
        self.assertIn('DNS_RECOVERY_ATTEMPT.json',worker)
        self.assertIn('old_build_attempt_preserved":True',worker)

    def test_27_recovery_does_not_relax_localhost_finance_isolation(self):
        worker=SRC.read_text()
        self.assertIn('IPAddressDeny=localhost',worker)
        self.assertIn('IPAddressDeny=link-local',worker)
        self.assertIn('BindReadOnlyPaths=/run/systemd/resolve/resolv.conf:',worker)
        self.assertIn('/run/systemd/resolve/stub-resolv.conf',worker)
        self.assertIn('"-dns-recovery1" if recovery else ""',worker)
        self.assertIn('cache_dir=DEST/(".r25-cache-dns-recovery1"',worker)
        self.assertNotIn("IPAddressAllow=localhost",worker)
        self.assertNotIn("systemctl restart",worker)
        self.assertNotIn("resolvectl dns",worker)

    def test_28_recovery_refuses_before_stage_writes_if_old_web_drifts(self):
        with mock.patch.object(self.s,"old_identity",
                               side_effect=self.s.Hold("OLD_WEB_DRIFT")):
            with mock.patch.object(self.s,"write_once") as write:
                with mock.patch.object(self.s,"root_storage_capacity") as budget:
                    with self.assertRaisesRegex(self.s.Hold,"OLD_WEB_DRIFT"):
                        self.s.recover_dns_build()
                    write.assert_not_called()
                    budget.assert_not_called()

    def test_29_recovery_rejects_symlinked_stage_before_writes(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp)
            actual=root/"original";actual.mkdir()
            link=root/"stage";link.symlink_to(actual,target_is_directory=True)
            with mock.patch.object(self.s,"DEST",link):
                with mock.patch.object(self.s,"old_identity",return_value="old"):
                    with mock.patch.object(self.s,"boundary_sockets",return_value={}):
                        with mock.patch.object(self.s,"ensure_not_running_candidate"):
                            with mock.patch.object(self.s,"protected_root_dir"):
                                with mock.patch.object(self.s,"write_once") as write:
                                    with self.assertRaisesRegex(self.s.Hold,
                                                               "RECOVERY_STAGE_PARENT_DRIFT"):
                                        self.s.recover_dns_build()
                                    write.assert_not_called()

    def test_30_recovery_checks_actual_source_and_yarn_digests(self):
        source=SRC.read_text()
        self.assertIn('h.hexdigest()==item.get("sha256")',source)
        self.assertIn('h.hexdigest()==entry["sha256"]',source)
        self.assertIn('archive_identity(expected_archive)',source)
        self.assertIn('RECOVERY_PARTIAL_ARTIFACT_OR_DUPLICATE',source)
        self.assertIn('RECOVERY_BUILD_ATTEMPT_MISMATCH',source)
        self.assertIn('RECOVERY_UPSTREAM_RESOLVER_SHA_DRIFT',source)
        self.assertIn('return complete_build(before,sockets,budget,build_account,imported,True,source)',source)

    def test_31_recovery_and_original_build_use_same_root_seal(self):
        source=SRC.read_text()
        self.assertIn('return complete_build(before,sockets,budget,account,yarn_receipt,False,record)',source)
        self.assertIn('def complete_build(before,sockets,budget,account,yarn_receipt,recovery,record)',source)
        self.assertEqual(source.count('write_once(AUDIT/"BUILD_STAGED.json",manifest)'),1)
        self.assertEqual(source.count('"schema":"aoe2war.r25.c.full-built-artifact.v1"'),1)
        self.assertIn('command(["/usr/bin/chown"',source)

    def test_32_original_source_receipt_binds_built_archive_identity(self):
        source=SRC.read_text()
        self.assertIn('"source_git_archive_sha256":record["git_archive_sha256"]',source)
        self.assertIn('complete_build(before,sockets,budget,account,yarn_receipt,False,record)',source)
        self.assertIn('complete_build(before,sockets,budget,build_account,imported,True,source)',source)

    def test_33_recovery_owner_requires_explicit_flag_before_archive_or_ssh(self):
        with mock.patch.object(self.m.sys,"platform","darwin"):
            with mock.patch.object(self.m.os,"geteuid",return_value=501):
                with mock.patch.object(self.m,"own_archive_sha") as archive:
                    with mock.patch.object(self.m.subprocess,"run") as runner:
                        with self.assertRaisesRegex(self.m.Hold,"OWNER_APPROVAL_FLAG_REQUIRED"):
                            self.m.run(".", "a"*40, "b"*64,"recover-dns",False)
                        archive.assert_not_called()
                        runner.assert_not_called()

    def test_34_failed_transient_prints_exact_unit_stdout_and_stderr(self):
        failing=types.SimpleNamespace(
            returncode=1,
            stdout=(b"error An unexpected error occurred\n"
                    b"error getaddrinfo EAI_AGAIN registry.yarnpkg.com\n"),
            stderr=b"Finished with result: exit-code\n")
        argv=["/usr/bin/systemd-run",
              "--unit=aoe2war-r25-deps-0cee3c83-dns-recovery2"]
        with mock.patch.object(self.s.subprocess,"run",return_value=failing) as run:
            with self.assertRaises(self.s.Hold) as ctx:
                self.s.command(argv,timeout=4)
        message=str(ctx.exception)
        self.assertIn("UNIT=aoe2war-r25-deps-0cee3c83-dns-recovery2",message)
        self.assertIn("EAI_AGAIN",message)
        self.assertIn("exit-code",message)
        self.assertIn(":EXIT=1",message)
        self.assertLessEqual(len(message),2700)
        run.assert_called_once()

    def test_35_bounded_redaction_of_failure_stream(self):
        raw=(b"error registry https://token:password@example.com/foo?auth=xx\n"
             b"error Authorization: Bearer KEEPTHISPRIVATE\n"
             b"error SESSION_SECRET=hidden-value\n"
             b"error password=topsecret\n"
             b"error getaddrinfo EAI_AGAIN registry.yarnpkg.com\n")
        tail=self.s.redacted_diagnostic_tail(raw)
        for leak in ("KEEPTHISPRIVATE","hidden-value","topsecret","auth=xx"):
            self.assertNotIn(leak,tail)
        self.assertIn("EAI_AGAIN",tail)
        self.assertLessEqual(len(tail),1100)

    def test_36_diagnostics_do_not_run_secondary_processes(self):
        clean=types.SimpleNamespace(returncode=0,stdout=b"expected-bytes",stderr=b"")
        with mock.patch.object(self.s.subprocess,"run",return_value=clean) as run:
            result=self.s.command(["/usr/bin/true"],timeout=8)
        self.assertEqual(result,b"expected-bytes")
        run.assert_called_once()

    def test_37_network_disabled_offline_install_and_next_build_are_distinct(self):
        src=SRC.read_text()
        self.assertIn('"--unit=aoe2war-r25-offline-"+SHA[:8]+unit_tag',src)
        self.assertIn('"--unit=aoe2war-r25-next-build-"+SHA[:8]+unit_tag',src)
        self.assertIn('command(offline,timeout=1500)',src)
        self.assertIn('command(build,timeout=1900)',src)
        self.assertNotIn('"/bin/sh","-c",scripts',src)
        self.assertIn('"--property=PrivateNetwork=yes"',src)

    def test_38_postprebuild_resume_is_distinct_and_never_installs(self):
        worker=SRC.read_text()
        owner=MAC.read_text()
        self.assertIn('commands.add_argument("--recover-prebuild"',worker)
        self.assertIn('elif a.recover_prebuild:postprebuild_recovery()',worker)
        self.assertIn('"recover-prebuild":"--recover-prebuild"',owner)
        self.assertIn('POSTPREBUILD_RECOVERY_ATTEMPT.json',worker)
        self.assertIn('POSTPREBUILD_PHASE_%02d.json',worker)
        section=worker.split('def postprebuild_recovery(resume_oom=False):',1)[1].split(
            'def verified_b_runtime(',1)[0]
        self.assertNotIn('"install"',section)
        self.assertNotIn('"--offline"',section)
        self.assertNotIn('recover_dns_build()',section)
        self.assertIn('return finalize_build(before,sockets,budget,frozen)',section)
        self.assertIn('"--property=PrivateNetwork=yes"',section)
        self.assertIn('"--setenv=PRISMA_SCHEMA_ENGINE_BINARY="+str(raw_engine)',section)

    def test_39_postprebuild_refuses_original_pid_drift_without_writes(self):
        with mock.patch.object(self.s,"old_identity",
                               side_effect=self.s.Hold("OLD_WEB_PID_DRIFT")):
            with mock.patch.object(self.s,"write_once") as write:
                with mock.patch.object(self.s.subprocess,"run") as run:
                    with self.assertRaisesRegex(self.s.Hold,"OLD_WEB_PID_DRIFT"):
                        self.s.postprebuild_recovery()
                    write.assert_not_called()
                    run.assert_not_called()

    def test_40_failed_step_is_separately_journaled_and_secret_redacted(self):
        unit="aoe2war-r25-postprebuild-"+self.s.SHA[:8]+"-01-prisma-generate"
        args=["/usr/bin/systemd-run","--unit="+unit]
        failed=types.SimpleNamespace(
            returncode=1,
            stdout=b"error Authorization: Bearer NO_LEAK_THIS\nerror PRISMA_SCHEMA_ENGINE_BINARY missing\n",
            stderr=b"error https://token:pass@example.com/key?password=x\n")
        with tempfile.TemporaryDirectory() as temp:
            with mock.patch.object(self.s,"AUDIT",pathlib.Path(temp)):
                with mock.patch.object(self.s.subprocess,"run",return_value=failed) as run:
                    with self.assertRaisesRegex(self.s.Hold,
                                                "POSTPREBUILD_PHASE_FAILED:prisma-generate"):
                        self.s.run_postprebuild_phase(1,"prisma-generate",args,15)
                    run.assert_called_once()
                receipt=json.loads((pathlib.Path(temp)/
                         "POSTPREBUILD_PHASE_01.json").read_bytes())
        self.assertEqual(receipt["status"],"HOLD")
        self.assertEqual(receipt["exit_code"],1)
        self.assertEqual(receipt["unit"],unit)
        blob=json.dumps(receipt)
        self.assertNotIn("NO_LEAK_THIS",blob)
        self.assertNotIn("password=x",blob)
        self.assertIn("PRISMA_SCHEMA_ENGINE_BINARY",blob)

    def test_41_timeout_is_journaled_and_cannot_reuse_phase(self):
        unit="aoe2war-r25-postprebuild-"+self.s.SHA[:8]+"-03-next-build"
        args=["/usr/bin/systemd-run","--unit="+unit]
        exc=subprocess.TimeoutExpired(args,11,
            output=b"error lint TIMEOUT\n",
            stderr=b"error timeout\n")
        with tempfile.TemporaryDirectory() as temp:
            with mock.patch.object(self.s,"AUDIT",pathlib.Path(temp)):
                with mock.patch.object(self.s.subprocess,"run",side_effect=exc):
                    with self.assertRaisesRegex(self.s.Hold,"EXIT=124"):
                        self.s.run_postprebuild_phase(3,"next-build",args,11)
                receipt=json.loads((pathlib.Path(temp)/
                         "POSTPREBUILD_PHASE_03.json").read_bytes())
                self.assertTrue(receipt["timed_out"])
                self.assertEqual(receipt["exit_code"],124)
                with mock.patch.object(self.s.subprocess,"run") as runner:
                    with self.assertRaisesRegex(self.s.Hold,"POSTREC_PHASE_ALREADY_ENTERED_NO_REPLAY"):
                        self.s.run_postprebuild_phase(3,"next-build",args,11)
                    runner.assert_not_called()

    def test_42_success_records_actual_unit_and_no_network(self):
        unit="aoe2war-r25-postprebuild-"+self.s.SHA[:8]+"-01-prisma-generate"
        args=["/usr/bin/systemd-run","--unit="+unit]
        okay=types.SimpleNamespace(returncode=0,stdout=b"PASS:compat",stderr=b"")
        with tempfile.TemporaryDirectory() as temp:
            with mock.patch.object(self.s,"AUDIT",pathlib.Path(temp)):
                with mock.patch.object(self.s.subprocess,"run",return_value=okay) as run:
                    self.assertTrue(self.s.run_postprebuild_phase(1,"prisma-generate",args,30))
                    run.assert_called_once()
                record=json.loads((pathlib.Path(temp)/
                    "POSTPREBUILD_PHASE_01.json").read_bytes())
        self.assertEqual(record["status"],"PASS")
        self.assertTrue(record["private_network"])
        self.assertFalse(record["finance_access"])

    def test_43_schema_generator_output_is_explicit(self):
        schema=(BASE/"prisma/schema.prisma").read_text()
        self.assertIn('output   = "../lib/generated/prisma"',schema)
        worker=SRC.read_text()
        self.assertNotIn('POSTREC_REQUIRE_NODE_MODULES_PRISMA_CLIENT',worker)
        self.assertIn('POSTREC_PRISMA_SEEDED_ENGINE_SHA_DRIFT',worker)

    def test_44_preserves_original_prebuild_outputs_and_skips_yarn(self):
        source=SRC.read_text()
        section=source.split('def postprebuild_recovery(resume_oom=False):',1)[1].split(
            'def verified_b_runtime(',1)[0]
        self.assertIn('"prior_prebuild_version":version',section)
        self.assertIn('"build_version_rewritten":False',section)
        self.assertNotIn('str(DEST/"scripts/write-build-version.mjs")',section)
        self.assertNotIn('str(DEST/"scripts/generate_page_change_manifest.py")',section)
        self.assertNotIn('str(DEST/"scripts/ensure-minimatch11-legacy-api.mjs")',section)
        self.assertIn('for number in range(1,5)',section)
        self.assertIn('"prisma-generate"',section)
        self.assertIn('"release-validation"',section)
        self.assertIn('"next-build"',section)
        self.assertIn('"postbuild-cache"',section)

    def test_45_postoom_new_one_use_mode_owner_no_tty(self):
        src=SRC.read_text(); owner=MAC.read_text()
        self.assertIn('commands.add_argument("--recover-oom"',src)
        self.assertIn('elif a.recover_oom:postprebuild_recovery(resume_oom=True)',src)
        self.assertIn('"recover-oom":"--recover-oom"',owner)
        self.assertIn('POSTOOM_RECOVERY_ATTEMPT.json',src)
        self.assertIn('"POSTOOM_PHASE_%02d.json"',src)
        self.assertNotIn('open("/dev/tty"',owner)

    def test_46_postoom_admits_only_prior_prisma_pass_and_heap_oom(self):
        src=SRC.read_text()
        self.assertIn('"POSTOOM_PRISMA_SUCCESS_NOT_PHYSICALLY_SEALED"',src)
        self.assertIn('"POSTOOM_PREVIOUS_FAILURE_NOT_EXACT_HEAP_OOM"',src)
        self.assertIn('"javascript heap out of memory" in oomdiagnostic.lower()',src)
        self.assertIn('"POSTOOM_PRIOR_LATER_PHASE_ENTERED"',src)
        self.assertIn('"POSTOOM_ALREADY_ENTERED_NO_RETRY"',src)
        self.assertIn('read_no_symlink(marker,65536,True)',src)
        self.assertIn('"POSTPREBUILD_PHASE_01.json"',src)
        self.assertIn('"POSTPREBUILD_PHASE_02.json"',src)

    def test_47_postoom_reuses_prisma_without_reinstall_or_typecheck(self):
        src=SRC.read_text()
        section=src.split('    if resume_oom:\n        build=[',1)[1].split(
            '    else:\n        # First post-prebuild attempt;',1)[0]
        self.assertNotIn('prisma/build/index.js',section)
        self.assertNotIn('yarn.js',section)
        self.assertNotIn('aoe2_release_prebuild_validation',section)
        self.assertIn('--setenv=NEXT_DIST_DIR=.next-release',section)
        self.assertIn('next/dist/bin/next',section)
        self.assertIn('"postbuild-cache"',section)
        self.assertIn('os.rename(release,DEST/".next")',section)
        self.assertIn('os.symlink(".next",release)',section)
        self.assertIn('POSTOOM_PROMOTION.json',section)
        self.assertIn('"--property=PrivateNetwork=yes"',src)

    def test_48_postoom_never_starts_when_old_web_drift(self):
        with mock.patch.object(self.s,"old_identity",
                               side_effect=self.s.Hold("OLD_3030_DRIFT")):
            with mock.patch.object(self.s,"write_once") as write:
                with mock.patch.object(self.s.subprocess,"run") as run:
                    with self.assertRaisesRegex(self.s.Hold,"OLD_3030_DRIFT"):
                        self.s.postprebuild_recovery(resume_oom=True)
                    write.assert_not_called()
                    run.assert_not_called()

    def test_49_postoom_phase_receipt_prefix_and_duplicate_holds(self):
        unit="aoe2war-r25-postoom-"+self.s.SHA[:8]+"-01-next-release-build"
        args=["/usr/bin/systemd-run","--unit="+unit]
        result=types.SimpleNamespace(returncode=0,stdout=b"PASS:built",stderr=b"")
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.object(self.s,"AUDIT",pathlib.Path(tmp)):
                with mock.patch.object(self.s.subprocess,"run",return_value=result) as run:
                    self.assertTrue(self.s.run_postprebuild_phase(
                        1,"next-release-build",args,30,
                        unit_prefix="aoe2war-r25-postoom",
                        receipt_prefix="POSTOOM_PHASE"))
                    with self.assertRaisesRegex(self.s.Hold,
                                                "POSTREC_PHASE_ALREADY_ENTERED_NO_REPLAY"):
                        self.s.run_postprebuild_phase(
                            1,"next-release-build",args,30,
                            unit_prefix="aoe2war-r25-postoom",
                            receipt_prefix="POSTOOM_PHASE")
                    run.assert_called_once()
                receipt=json.loads((pathlib.Path(tmp)/
                                    "POSTOOM_PHASE_01.json").read_text())
                self.assertEqual(receipt["unit"],unit)
                self.assertEqual(receipt["status"],"PASS")

    def test_50_postoom_seal_uses_real_next_dir_and_no_public_cutover(self):
        src=SRC.read_text()
        self.assertEqual(src.count('write_once(AUDIT/"BUILD_STAGED.json",manifest)'),1)
        self.assertIn('return finalize_build(before,sockets,budget,frozen)',src)
        self.assertIn('"next_is_real_directory":True',src)
        self.assertIn('"old_web_pid_untouched":OLD_PID',src)
        self.assertIn('"financial_writes_authorized":False',src)

    def test_51_independent_verifier_has_large_bounded_manifest_only(self):
        source=VERIFIER.read_text()
        self.assertEqual(self.v.BUILD_MANIFEST_MAX_BYTES,128*1024*1024)
        self.assertIn('files=load(AUDIT/"BUILD_FILES.json",BUILD_MANIFEST_MAX_BYTES)',source)
        self.assertIn('source=load(AUDIT/"SOURCE_STAGED.json",65536)',source)
        self.assertIn('build=load(AUDIT/"BUILD_STAGED.json",65536)',source)
        self.assertIn('os.read(fd,min(1048576,before.st_size-total))',source)
        self.assertIn('ROOT_FILE_REPLACED_DURING_OPEN',source)
        self.assertNotIn('files=load(AUDIT/"BUILD_FILES.json",16000000)',source)

    def test_52_independent_verifier_reads_real_oversize_16mb_fixture(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/"large.json"
            payload=b"X"*(16_000_001)
            p.write_bytes(payload)
            st=p.stat()
            trusted=types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,
                        st_uid=0,st_size=st.st_size,st_dev=st.st_dev,
                        st_ino=st.st_ino)
            with mock.patch.object(pathlib.Path,"lstat",return_value=trusted):
                with self.assertRaisesRegex(self.v.Hold,
                                            "ROOT_FILE_SIZE_OUTSIDE_BOUND"):
                    self.v.read_root_file(p,16000000)
                result=self.v.read_root_file(
                    p,self.v.BUILD_MANIFEST_MAX_BYTES)
        self.assertEqual(result,payload)

    def test_53_independent_verifier_blocks_untrusted_owner(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/"untrusted.json"
            p.write_bytes(b'{"schema":1}')
            st=p.stat()
            untrusted=types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,
                        st_uid=1000,st_size=st.st_size,st_dev=st.st_dev,
                        st_ino=st.st_ino)
            with mock.patch.object(pathlib.Path,"lstat",return_value=untrusted):
                with self.assertRaisesRegex(self.v.Hold,
                                            "UNTRUSTED_ROOT_FILE_MODE_OR_OWNER"):
                    self.v.read_root_file(p,16000000)

    def test_54_independent_verifier_handles_short_os_reads(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/"short.json"
            p.write_bytes(b'{"status":"BUILD_STAGED"}')
            st=p.stat()
            trusted=types.SimpleNamespace(st_mode=stat.S_IFREG|0o600,
                        st_uid=0,st_size=st.st_size,st_dev=st.st_dev,
                        st_ino=st.st_ino)
            original_read=os.read
            def short_read(fd,size):
                return original_read(fd,min(size,3))
            with mock.patch.object(pathlib.Path,"lstat",return_value=trusted):
                with mock.patch.object(self.v.os,"read",side_effect=short_read):
                    result=self.v.read_root_file(p,16000000)
            self.assertEqual(result,b'{"status":"BUILD_STAGED"}')

if __name__=="__main__":
    unittest.main()
