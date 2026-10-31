"""R25 C additive source archive, build and candidate gate tests."""
import io,importlib.util,json,os,pathlib,tarfile,tempfile,types,unittest
from unittest import mock

BASE=pathlib.Path(__file__).resolve().parents[1]
SRC=BASE/"scripts/aoe2_r25_c_parallel_stage.py"
MAC=BASE/"scripts/aoe2_r25_c_owner_mac.py"
UNIT=BASE/"deploy/aoe2hdbets-web-r24.service"
def load(path):
    spec=importlib.util.spec_from_file_location(path.stem,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module
class R25StageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s=load(SRC);cls.m=load(MAC)
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
    def test_16_mac_does_not_prompt_using_tty_rplus(self):
        x=MAC.read_text()
        self.assertIn('open("/dev/tty","r")',x)
        self.assertIn('open("/dev/tty","w")',x)
        self.assertNotIn('open("/dev/tty","r+")',x)
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
        self.assertIn('"recover-dns")',owner)
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
        self.assertIn('return complete_build(before,sockets,budget,build_account,imported,True)',source)

    def test_31_recovery_and_original_build_use_same_root_seal(self):
        source=SRC.read_text()
        self.assertIn('return complete_build(before,sockets,budget,account,yarn_receipt,False)',source)
        self.assertIn('def complete_build(before,sockets,budget,account,yarn_receipt,recovery)',source)
        self.assertEqual(source.count('write_once(AUDIT/"BUILD_STAGED.json",manifest)'),1)
        self.assertEqual(source.count('"schema":"aoe2war.r25.c.full-built-artifact.v1"'),1)
        self.assertIn('command([ "/usr/bin/chown"',source.replace('command(["/usr/bin/chown"', 'command([ "/usr/bin/chown"'))

if __name__=="__main__":
    unittest.main()
