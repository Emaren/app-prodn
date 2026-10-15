from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_route_authority.py"
SPEC = importlib.util.spec_from_file_location("aoe2_route_authority", MODULE)
assert SPEC and SPEC.loader
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def write(root: Path, route: str, content: str) -> None:
    path = root / route
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class RouteAuthorityTests(unittest.TestCase):
    def test_deterministic_methods_and_guard_evidence_are_not_security_verdict(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "app/api/admin/money/route.ts",
                  'import { requireAdmin } from "@/lib/adminSession";\n'
                  'export async function POST(request: Request) {\n'
                  '  await requireAdmin(request);\n'
                  '  return Response.json(await request.json());\n}\n'
                  'export async function GET() { return Response.json({}); }\n')
            write(root, "app/api/wolo/faucet/route.ts",
                  'import { executeFaucet } from "@/lib/faucetGuards";\n'
                  'export async function POST() { return executeFaucet(); }\n')
            write(root, "app/api/lobby/route.ts",
                  'export const GET = async () => Response.json({});\n')
            one = audit.inspect(root)
            two = audit.inspect(root)
        self.assertEqual(one, two)
        self.assertEqual(one["route_file_count"], 3)
        self.assertEqual(one["exported_handler_count"], 4)
        self.assertEqual(one["mutation_route_count"], 2)
        self.assertEqual(one["method_counts"]["POST"], 2)
        self.assertEqual(one["method_counts"]["GET"], 2)
        self.assertEqual(one["manual_authority_trace_candidates"],
                         ["app/api/wolo/faucet/route.ts"])
        admin = one["routes"][0]
        self.assertEqual(admin["methods"], ["GET", "POST"])
        self.assertEqual(admin["surface"], "admin_path")
        self.assertEqual(admin["local_guard_symbols_seen"], ["requireAdmin"])
        self.assertFalse(admin["manual_authority_trace_candidate"])
        # A delegated guard's absence from this narrow dictionary is not
        # evidence that executeFaucet permits anonymous users.
        self.assertIn("NOT certified", one["scope"])

    def test_session_and_internal_bridge_signals_are_observations_only(self):
        self.assertEqual(
            audit.classify_route(
                "app/api/bets/wager/route.ts",
                'export async function POST(request: Request) {\n'
                '  await getSessionUid(request);\n'
                '  return Response.json({});\n}\n',
            )["local_guard_symbols_seen"],
            ["getSessionUid"],
        )
        row = audit.classify_route(
            "app/api/internal/aoe2war/route.ts",
            'export async function POST() {\n'
            '  return bridgeTokenMatches("opaque");\n}\n',
        )
        self.assertEqual(row["surface"], "internal_path")
        self.assertFalse(row["manual_authority_trace_candidate"])

    def test_bound_and_symlink_are_never_admitted_as_route_sources(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "app/api/internal/value/route.ts",
                  'export async function GET() { return Response.json({}); }\n')
            outside = root / "not-owned.ts"
            outside.write_text("export async function POST() {}\n", encoding="utf-8")
            alias = root / "app/api/internal/escape/route.ts"
            alias.parent.mkdir(parents=True)
            alias.symlink_to(outside)
            self.assertEqual(list(audit.discover_routes(root)),
                             ["app/api/internal/value/route.ts"])
            module = root / "app/api/internal/value/route.ts"
            initial = module.read_bytes()
            self.assertEqual(audit.inspect(root)["route_file_count"], 1)
            self.assertEqual(module.read_bytes(), initial)
            previous_limit = audit.MAX_SOURCE_BYTES
            try:
                audit.MAX_SOURCE_BYTES = 10
                with self.assertRaises(audit.RouteCensusError):
                    audit.inspect(root)
            finally:
                audit.MAX_SOURCE_BYTES = previous_limit

    def test_no_source_tree_produces_empty_explicit_not_certified_inventory(self):
        with tempfile.TemporaryDirectory() as tmp:
            rows = audit.inspect(Path(tmp))
        self.assertEqual(rows["route_file_count"], 0)
        self.assertEqual(rows["exported_handler_count"], 0)
        self.assertEqual(rows["manual_authority_trace_candidates"], [])


    def test_reviewed_hd_route_guards_remain_source_bound(self):
        root = MODULE.parents[1]
        radio_routes = (
            "app/api/admin/radio-submissions/route.ts",
            "app/api/admin/radio/assets/[id]/route.ts",
            "app/api/admin/radio/assets/route.ts",
            "app/api/admin/radio/programs/[id]/items/route.ts",
            "app/api/admin/radio/programs/[id]/route.ts",
            "app/api/admin/radio/programs/route.ts",
            "app/api/admin/radio/station/start/route.ts",
            "app/api/admin/radio/station/stop/route.ts",
        )
        for path in radio_routes:
            with self.subTest(route=path):
                content = (root / path).read_text(encoding="utf-8")
                self.assertIn("requireRadioWoloOperator", content)
                self.assertIn("await requireRadioWoloOperator", content.replace(
                    "\n", " ").replace("  ", " "))
                self.assertFalse(audit.classify_route(
                    path, content
                )["manual_authority_trace_candidate"])
        radio_guard = (root / "lib/radioWoloOperator.ts").read_text(encoding="utf-8")
        self.assertIn("await requireAdmin(request)", radio_guard)
        self.assertIn("isRadioWoloOperatorUid", radio_guard)

        internal_routes = (
            "app/api/admin/replay-auto-recovery/route.ts",
            "app/api/admin/replay-roster-recovery/route.ts",
            "app/api/replay/post-ingest/route.ts",
        )
        import re
        for path in internal_routes:
            with self.subTest(route=path):
                content = (root / path).read_text(encoding="utf-8")
                self.assertIn("INTERNAL_API_KEY", content)
                self.assertRegex(
                    content, r"!\s*authorized\s*\(\s*request\s*\)"
                )
                self.assertFalse(audit.classify_route(
                    path, content
                )["manual_authority_trace_candidate"])

        stake = (root / "app/api/bets/stake-reconciliation/route.ts").read_text(
            encoding="utf-8"
        )
        self.assertIn("timingSafeEqual", stake)
        self.assertIn("BET_STAKE_RECONCILE_TOKEN", stake)
        self.assertIn("tokensEqual", stake)
        self.assertIn("authorize(request)", stake)
        self.assertFalse(audit.classify_route(
            "app/api/bets/stake-reconciliation/route.ts", stake
        )["manual_authority_trace_candidate"])

        delegate = (
            root / "app/api/bets/tickets/[ticketId]/_handler.ts"
        ).read_text(encoding="utf-8")
        self.assertIn("await getSessionUid(request)", delegate)
        self.assertIn("if (!sessionUid)", delegate)
        self.assertIn("commitBetStakeTicket", delegate)
        for kind in ("commit", "recover"):
            route = f"app/api/bets/tickets/[ticketId]/{kind}/route.ts"
            content = (root / route).read_text(encoding="utf-8")
            self.assertIn("export const POST = handleBetStakeTicketCommit", content)
            self.assertFalse(audit.classify_route(
                route, content
            )["manual_authority_trace_candidate"])


    def test_generic_internal_mutations_cannot_escape_authority_review_by_name(self):
        # Scanner is intentionally lexical: this is a prompt for call-path
        # review, not proof a delegated endpoint is unsafe.
        unguarded = audit.classify_route(
            "app/api/internal/ops/route.ts",
            'export async function POST() { return Response.json({ ok: true }); }',
        )
        self.assertEqual(unguarded["surface"], "internal_path")
        self.assertTrue(unguarded["manual_authority_trace_candidate"])
        self.assertEqual(unguarded["local_guard_symbols_seen"], [])

        guarded = audit.classify_route(
            "app/api/internal/ops/route.ts",
            'export async function POST(request: Request) { '
            'if (!bridgeTokenMatches(request)) return new Response(null, {status: 401}); '
            'return Response.json({ ok: true }); }',
        )
        self.assertEqual(guarded["local_guard_symbols_seen"], ["bridgeTokenMatches"])
        self.assertFalse(guarded["manual_authority_trace_candidate"])

        public_post = audit.classify_route(
            "app/api/public/status/route.ts",
            'export async function POST() { return Response.json({ ok: true }); }',
        )
        self.assertFalse(public_post["manual_authority_trace_candidate"])

    def test_generic_internal_review_inventory_is_bounded_and_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write(root, "app/api/internal/ops/route.ts",
                  'export async function POST() { return Response.json({}); }\\n')
            write(root, "app/api/internal/health/route.ts",
                  'export async function GET() { return Response.json({}); }\\n')
            first = audit.inspect(root)
            second = audit.inspect(root)
        self.assertEqual(first, second)
        self.assertEqual(first["manual_authority_trace_candidates"],
                         ["app/api/internal/ops/route.ts"])
        self.assertEqual(first["mutation_route_count"], 1)


if __name__ == "__main__":
    unittest.main()
