"""Nonproduction checks for human/custodian handoff; NEVER enroll or sign."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNBOOK = ROOT / "docs" / "WEBSITE_NINE_PATH_OPERATOR_COMMANDS.md"
PROPOSAL = ROOT / "docs" / "WEBSITE_ONLY_ALTERNATIVE_QUORUM_PROPOSAL.md"


class OperatorAuthorityHandoffTests(unittest.TestCase):
    def test_every_interactive_bash_block_has_no_global_fail_fast_or_top_exit(self):
        doc = RUNBOOK.read_text()
        blocks = re.findall(r"\x60\x60\x60bash\n(.*?)\n\x60\x60\x60", doc, re.S)
        self.assertGreaterEqual(len(blocks), 8)
        for number, block in enumerate(blocks, 1):
            with self.subTest(block=number):
                self.assertNotRegex(block, r"(?m)^\s*set\s+-(?:e|u|[a-z]*e[a-z]*)\b")
                self.assertNotRegex(block, r"(?m)^\s*set\s+-o\s+pipefail")
                self.assertNotRegex(block, r"(?m)^\s*exit(?:\s|$)")
                self.assertNotIn("sudo systemctl stop", block)
                self.assertNotIn("sudo systemctl start", block)
                self.assertNotIn("rsync ", block)

    def test_mac_vs_vps_and_independent_six_key_roles(self):
        doc = RUNBOOK.read_text()
        for role in (
            "owner.pem", "chain_reviewer.pem", "finance_reviewer.pem",
            "release_operator.pem", "source_reviewer.pem",
            "runtime_witness.pem",
        ):
            self.assertIn(role, doc)
        self.assertIn("PRIVATE witness key", doc)
        self.assertIn("Mac-local", doc)
        self.assertIn("REM OTE".replace(" ",""), doc)
        self.assertIn("/var/lib/aoe2war-website-authority-v2", doc)
        self.assertIn("/usr/local/libexec/aoe2war-website-witness-v2", doc)
        self.assertIn('AOE2_RELEASE_HOST="hel1"', doc)
        self.assertIn("financial_release_authorized=false", doc)
        self.assertIn("vps-source-drift", doc)

    def test_non_authorizing_three_human_proposal_is_isolated(self):
        proposal = PROPOSAL.read_text()
        self.assertIn("DISCUSSION ONLY", proposal)
        self.assertIn("current", proposal.lower())
        self.assertIn("three DIFFERENT", proposal)
        self.assertIn("separate policy implementation PR", proposal)
        self.assertIn("NO GO", proposal)
        self.assertIn("machine signer", proposal)
        self.assertIn("PRE_ACTIVATE", proposal)

    def test_five_phase_contracts_retained(self):
        doc = RUNBOOK.read_text()
        for word in (
            "issue-stage", "--signed-noninterference",
            "--signed-wolo-prestate", "stage-result.json",
            "issue-activation", "PRE_ACTIVATE", "activate",
            "activation-result.json", "ROLLBACK", "NO", "BUILD_ID",
        ):
            self.assertIn(word, doc.upper() if word == "ROLLBACK" else doc)


if __name__ == "__main__":
    unittest.main()
