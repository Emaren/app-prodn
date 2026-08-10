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
        bindir.mkdir()
        script = bindir / "aoe2war"
        shutil.copy2(CLI, script)
        release = bindir / "aoe2war-release"
        release.write_text(
            '#!/usr/bin/env bash\nprintf "%s\\n" "$@"\n',
            encoding="utf-8",
        )
        release.chmod(0o755)
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

    def test_unknown_command_fails_closed(self):
        result = self.run_cli("warp-drive")
        self.assertEqual(result.returncode, 2)
        self.assertIn("unknown AoE2WAR command", result.stderr)


if __name__ == "__main__":
    unittest.main()
