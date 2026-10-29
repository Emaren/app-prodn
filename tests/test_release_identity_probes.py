"""Source-contract checks for identity-only protected release observations.

A 2026-10-27 review found that /api/bets and /api/lobby GETs can enqueue
bet-market settlement and tournament DB writes. A deployment cannot use
those endpoints for read-only health. This guard is intentionally narrower
than a proof that every arbitrary future application route is harmless.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
CONTROLLERS = (
    "scripts/aoe2_release_ship.py",
    "scripts/aoe2_release_rollback.py",
    "scripts/aoe2_release_auto.py",
)
FORBIDDEN = ("/api/bets", "/api/lobby", "/api/statistics", "/workshop")


class ReleaseIdentityOnlyContractTests(unittest.TestCase):
    def test_no_maintenance_capable_health_urls_in_release_controllers(self):
        for relative in CONTROLLERS:
            with self.subTest(controller=relative):
                source = (ROOT / relative).read_text(encoding="utf-8")
                # Exact URL tokens are forbidden in release controllers; dynamic
                # route content may be proved separately, after certification.
                for path in FORBIDDEN:
                    self.assertNotIn(
                        path,
                        source,
                        f"{relative} must not probe maintenance-capable {path}",
                    )
                self.assertIn("/api/deployment-version", source)

    def test_identity_endpoint_stays_independent_of_mutating_application_code(self):
        source = (ROOT / "app/api/deployment-version/route.ts").read_text(
            encoding="utf-8"
        )
        self.assertIn("export function GET()", source)
        self.assertIn("NEXT_PUBLIC_AOE2WAR_BUILD_VERSION", source)
        self.assertNotRegex(source, r"\b(?:POST|PUT|PATCH|DELETE)\b")
        for forbidden in (
            "getPrisma",
            "$queryRaw",
            "$executeRaw",
            "ensureBetMarkets",
            "queueBetMarketEnsure",
            "reconcileTournamentMatchProofs",
            "loadLobbySnapshot",
            "fetch(",
            "setTimeout(",
            "setInterval(",
        ):
            self.assertNotIn(forbidden, source)

    def test_release_receipts_must_not_claim_dynamic_route_proof(self):
        source = (ROOT / CONTROLLERS[0]).read_text(encoding="utf-8")
        self.assertIn(
            "INFRASTRUCTURE_exact_runtime_identity_and_identity_only_bounded_health_soak",
            source,
        )
        self.assertIn(
            "internal/public deployment-version probes",
            source,
        )
        self.assertNotIn("critical_routes_and_bounded_health_soak", source)
        self.assertNotIn("internal/public critical-route proof", source)

    def test_activation_source_marks_dynamic_prewarm_deferred(self):
        source = (ROOT / CONTROLLERS[0]).read_text(encoding="utf-8")
        for metric in ("STATISTICS", "LEADERBOARD", "WORKSHOP"):
            self.assertIn(
                metric + '_PREWARM="DEFERRED_IDENTITY_ONLY"',
                source,
            )
        self.assertIn("# RELEASE OBSERVATIONS ARE IDENTITY-ONLY.", source)


if __name__ == "__main__":
    unittest.main()
