"""R25 C additive source archive, build and candidate gate tests."""
import io,importlib.util,os,pathlib,tarfile,tempfile,unittest
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
          "/var/www/AoE2HDBets/app-prodn-r24-w1safe-0cee3c836c4b")
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
if __name__=="__main__":
    unittest.main()
