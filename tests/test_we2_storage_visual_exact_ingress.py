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

    def test_exact_web_private_store_preserves_strict_mount_deny(self):
        t = (ROOT / "docs/release/artifacts/aoe2war_storage_visual_web_store_v1.conf").read_text()
        self.assertIn("[Service]", t)
        self.assertIn("ReadWritePaths=/var/lib/aoe2war-storage-visual-web-v1", t)
        self.assertNotIn("ReadWritePaths=/mnt", t)
        self.assertNotIn("ReadWritePaths=/var/lib/aoe2war-web-prod", t)
        self.assertNotIn("BindPaths=", t)
        self.assertNotIn("User=", t)
        self.assertNotIn("Group=", t)
        self.assertNotIn("ExecStart=", t)
        directives = [
            line.strip() for line in t.splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]
        self.assertEqual(directives, [
            "[Service]", "ReadWritePaths=/var/lib/aoe2war-storage-visual-web-v1"
        ])
        guard = (ROOT / "scripts/r25_b_guard_production_v1.cjs").read_text()
        self.assertIn('"/var/lib/aoe2war-storage-visual-web-v1"', guard)
        self.assertNotIn('"/mnt/HC_Volume_105319120/aoe2war/os-control"', guard)
        self.assertIn("STORAGE_STORE_EXACT_ROOT_REQUIRED", guard)
        self.assertIn("STORAGE_PARTIAL_ENROLLMENT_DENIED", guard)
        # The Bridge's source keys remain an exact all-or-nothing group. A
        # later, separately approved teaching group may exist in source,
        # but is INERT without complete Bridge AND six distinct teaching
        # settings, its own witness, and enrolled owner authority.
        self.assertIn('need(storagePresent.length === storageEnv.length', guard)
        self.assertIn('TEACHING_PARTIAL_OR_UNOBSERVED_SOURCE_DENIED', guard)
        self.assertIn('TEACHING_SEGREGATED_HMAC_REQUIRED', guard)
        self.assertIn('TEACHING_EXACT_WITNESS_AND_ROOT_TIP_REQUIRED', guard)
        self.assertIn('const teachingEnabled = teachingPresent.length === teachingEnv.length;', guard)
        self.assertIn('"AOE2WAR_STORAGE_TEACHING_OWNER_UID"', guard)
        self.assertIn('"AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY"', guard)
        self.assertIn('"AOE2WAR_STORAGE_OWNER_TIP_WITNESS_SOCKET"', guard)
        self.assertIn('"AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM"', guard)
        self.assertIn('"AOE2WAR_STORAGE_TEACHING_TIP_PUBLIC_PEM_SHA256"', guard)
        self.assertIn('"AOE2WAR_STORAGE_TEACHING_TIP_PATH"', guard)
        self.assertNotIn('"AOE2WAR_STORAGE_TEACHING_HMAC_KEY"', guard)
        self.assertIn('process.env.AOE2WAR_OS_BRIDGE_TOKEN !== hmac', guard)
        self.assertIn('!storageKeys.some(k => process.env[k] === hmac)', guard)

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
