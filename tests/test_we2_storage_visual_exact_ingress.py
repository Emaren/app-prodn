"""Protected-source-only WE2 ingress design regression; no live service touched."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class StorageVisualIngress(unittest.TestCase):
    def test_exact_nginx_proxy_rejects_forged_scope_and_nonpost(self):
        t = (ROOT / "docs/release/artifacts/aoe2war_storage_visual_exact_ingress_v1.conf").read_text()
        self.assertIn("location = /api/internal/aoe2war-os/bridge {", t)
        self.assertIn('if ($request_method != POST) { return 405; }', t)
        self.assertIn('if ($http_x_aoe2war_bridge_scope != "") { return 403; }', t)
        self.assertIn("proxy_set_header X-Aoe2war-Bridge-Scope storage_visual;", t)
        self.assertIn("client_max_body_size 48k;", t)
        self.assertIn("proxy_pass http://127.0.0.1:3032;", t)
        self.assertNotIn("8092", t)
        self.assertNotIn("queue_finish", t)
        self.assertNotIn("location ^~ /api", t)
        self.assertNotIn("proxy_pass http://127.0.0.1:3030;", t)

    def test_source_scoped_storage_before_legacy_privileged_branches(self):
        route = (ROOT / "app/api/internal/aoe2war-os/bridge/route.ts").read_text()
        scope = 'const scope = request.headers.get("x-aoe2war-bridge-scope");'
        self.assertIn(scope, route)
        self.assertLess(route.index(scope), route.index('if (op === "queue_finish")'))
        self.assertIn('if (scope !== "storage_visual")', route)
        self.assertIn('wire.op !== "storage_visual"', route)
        self.assertIn("acceptStorageVisualSubmission(payload)", route)

    def test_guard_keeps_owner_teaching_write_denied_pending_anchor(self):
        guard = (ROOT / "scripts/r25_b_guard_production_v1.cjs").read_text()
        self.assertIn('request.url === "/api/internal/aoe2war-os/bridge"', guard)
        self.assertIn('request.headers?.["x-aoe2war-bridge-scope"] === "storage_visual"', guard)
        self.assertNotIn('path === "/api/admin/storage-os/teaching"', guard)
        self.assertIn('request.headers?.["x-forwarded-proto"] === "https"', guard)


if __name__ == "__main__":
    unittest.main()
