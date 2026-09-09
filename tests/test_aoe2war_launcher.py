import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "bin" / "aoe2war"


class AoE2WarLauncherTests(unittest.TestCase):
    def test_uses_tracked_python_major_minor_instead_of_generic_python3(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            fake_bin = tmp_path / "bin"
            fake_bin.mkdir()

            wrong_python = fake_bin / "python3"
            wrong_python.write_text(
                "#!/usr/bin/env bash\n"
                "printf 'wrong-python\\n'\n"
                "exit 7\n"
            )
            wrong_python.chmod(0o755)

            pinned_python = fake_bin / "python3.13"
            pinned_python.write_text(
                "#!/usr/bin/env bash\n"
                "printf 'pinned-python argv=%s\\n' \"$*\"\n"
            )
            pinned_python.chmod(0o755)

            env = os.environ.copy()
            env["PATH"] = f"{fake_bin}:/usr/bin:/bin"

            result = subprocess.run(
                [str(LAUNCHER), "doctor", "--json"],
                cwd=ROOT,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                check=False,
                timeout=10,
            )

            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertNotIn("wrong-python", result.stdout)
            self.assertIn("pinned-python argv=", result.stdout)
            self.assertIn("scripts/aoe2_doctor.py --json", result.stdout)


if __name__ == "__main__":
    unittest.main()
