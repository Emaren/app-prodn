import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";

const root = process.cwd();
const nginx = readFileSync(join(root, "deploy/aoe2war-bridge-dual-path.nginx.inc"), "utf8");
const guard = readFileSync(join(root, "scripts/r25_b_guard_production_v1.cjs"), "utf8");
const route = readFileSync(join(root, "app/api/internal/aoe2war-os/bridge/route.ts"), "utf8");

test("only two exact bridge locations can POST to existing production 3032", () => {
  assert.equal((nginx.match(/location = \/api\/internal\/aoe2war-os\//g) ?? []).length, 2);
  assert.match(nginx, /location = \/api\/internal\/aoe2war-os\/bridge\s*\{/);
  assert.match(nginx, /location = \/api\/internal\/aoe2war-os\/storage-visual\s*\{/);
  assert.equal((nginx.match(/if \(\$request_method != POST\) \{ return 405; \}/g) ?? []).length, 2);
  assert.equal((nginx.match(/proxy_pass http:\/\/127\.0\.0\.1:3032\/api\/internal\/aoe2war-os\/bridge;/g) ?? []).length, 2);
  assert.doesNotMatch(nginx, /location \^~ \/api\//);
  assert.doesNotMatch(nginx, /proxy_pass http:\/\/127\.0\.0\.1:(?!3032)/);
  assert.match(nginx, /client_max_body_size 256k;/);
  assert.match(nginx, /client_max_body_size 48k;/);
});

test("Nginx overwrites client scope and preserves existing bridge bearer", () => {
  assert.match(nginx, /proxy_set_header X-AoE2WAR-Bridge-Scope operator_control;/);
  assert.match(nginx, /proxy_set_header X-AoE2WAR-Bridge-Scope storage_visual;/);
  assert.equal((nginx.match(/proxy_set_header X-AoE2WAR-OS-Key \$http_x_aoe2war_os_key;/g) ?? []).length, 2);
  assert.equal((nginx.match(/proxy_set_header X-Forwarded-Proto https;/g) ?? []).length, 2);
  assert.equal((nginx.match(/proxy_set_header Cookie "";/g) ?? []).length, 2);
});

test("Node guard admits only exact host, loopback, HTTPS, token and scoped JSON", () => {
  assert.match(guard, /const operatorBridgeWrite =/);
  assert.match(guard, /request\.url === "\/api\/internal\/aoe2war-os\/bridge"/);
  assert.match(guard, /request\.socket\?\.remoteAddress === "127\.0\.0\.1"/);
  assert.match(guard, /request\.headers\?\.host === "aoe2war\.com"/);
  assert.match(guard, /request\.headers\?\.\["x-forwarded-proto"\] === "https"/);
  assert.match(guard, /request\.headers\?\.\["x-aoe2war-bridge-scope"\] === "operator_control"/);
  assert.match(guard, /Number\(bridgeLength\) <= 262144/);
  assert.match(guard, /operatorControlWrite;/);
  assert.match(guard, /storageVisualOnlyWrite \|\|/);
  assert.match(guard, /request\.headers\?\.\["transfer-encoding"\] === undefined/);
});

test("Next dispatch preserves operator commands, signed storage and unmarked denial", () => {
  assert.match(route, /if \(scope === "storage_visual"\) return scopedStoragePost/);
  assert.match(route, /if \(scope !== "operator_control"\) return storageError\(403/);
  assert.match(route, /const authError = unauthorized\(request\)/);
  for (const op of ["heartbeat", "claim", "event", "complete", "snapshot", "queue_finish", "run_status"]) {
    assert.ok(route.includes(`op === "${op}"`), op);
  }
});
