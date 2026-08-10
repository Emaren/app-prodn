import pathlib
import shutil
import subprocess
import tempfile
import unittest

CLI = pathlib.Path(__file__).resolve().parents[1] / "bin" / "aoe2war"


class AoE2WarCliTests(unittest.TestCase):
    def fake_cli(self):
        temp = tempfile.TemporaryDirectory()
        root = pathlib.Path(temp.name)
        bindir = root / "bin"
        scripts = root / "scripts"
        bindir.mkdir()
        scripts.mkdir()

        script = bindir / "aoe2war"
        shutil.copy2(CLI, script)

        release = bindir / "aoe2war-release"
        release.write_text(
            '#!/usr/bin/env bash\nprintf "%s\\n" "$@"\n',
            encoding="utf-8",
        )
        release.chmod(0o755)

        stub = (
            "#!/usr/bin/env python3\n"
            "from pathlib import Path\n"
            "import sys\n"
            "print(Path(__file__).name)\n"
            "for value in sys.argv[1:]: print(value)\n"
        )
        for name in (
            "aoe2_audit.py",
            "aoe2_update.py",
            "aoe2_doctor.py",
            "aoe2_finish.py",
            "aoe2_operator_bridge.py",
        ):
            path = scripts / name
            path.write_text(stub, encoding="utf-8")
            path.chmod(0o755)

        return temp, script

    def run_cli(self, *args):
        temp, script = self.fake_cli()
        self.addCleanup(temp.cleanup)
        return subprocess.run(
            [str(script), *args],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

    def test_deploy_maps_to_ship(self):
        result = self.run_cli("deploy", "--dry-run")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.splitlines(), ["ship", "--dry-run"])

    def test_status_maps_directly(self):
        result = self.run_cli("status", "--json")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.splitlines(), ["status", "--json"])

    def test_releases_maps_directly(self):
        result = self.run_cli("releases", "--limit", "4")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.splitlines(), ["releases", "--limit", "4"])

    def test_rollback_maps_directly(self):
        result = self.run_cli("rollback", "--dry-run")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.splitlines(), ["rollback", "--dry-run"])

    def test_doctor_maps_to_doctor_script(self):
        result = self.run_cli("doctor", "--json")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(
            result.stdout.splitlines(),
            ["aoe2_doctor.py", "--json"],
        )

    def test_finish_maps_to_finish_script(self):
        result = self.run_cli("finish", "--dry-run")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(
            result.stdout.splitlines(),
            ["aoe2_finish.py", "--dry-run"],
        )

    def test_unknown_command_fails_closed(self):
        result = self.run_cli("warp-drive")
        self.assertEqual(result.returncode, 2)
        self.assertIn("unknown AoE2WAR command", result.stderr)


if __name__ == "__main__":
    unittest.main()
