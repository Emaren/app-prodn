import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  readRestrictedPaperStatus, validateRestrictedStatus,
  SOURCE_HALT, SOURCE_STATUS_SCHEMA,
} from "../lib/kingdomTradersPaperReadonly.mjs";

const base = fileURLToPath(new URL("../", import.meta.url));
const payload = () => ({
  schema: SOURCE_STATUS_SCHEMA,
  accessScope: "NONFINANCIAL_STATUS_ONLY",
  classification: "HISTORICAL_PAPER_REPRODUCTION_NOT_LIVE_BOTS",
  releaseSource: "c7588f9394fbb4ba75a833510e7a2c2d6c3dff17",
  originalAccounts: 100,
  openUnpricedOriginalPositions: 7,
  paperStatus: SOURCE_HALT,
  paperNewOrdersAllowed: false,
  sourceFresh: false,
  fundedAuthority: false,
  walletOperationsAllowed: false,
  woloOperationsAllowed: false,
  realOrders: 0,
});

function privateFixture(callback) {
  const root = mkdtempSync(join(tmpdir(), "session-c-app-machine-status-"));
  const machineCredentialFile = join(root, "machine-secret.txt");
  const productCaFile = join(root, "localhost-ca.crt");
  // Random test-only material is never checked in or reused as a real key.
  const token = randomBytes(48).toString("base64url");
  writeFileSync(machineCredentialFile, token + "\n");
  chmodSync(machineCredentialFile, 0o600);
  writeFileSync(productCaFile, "-----BEGIN CERTIFICATE-----\nTEST ONLY\n-----END CERTIFICATE-----\n");
  return Promise.resolve()
    .then(() => callback({ machineCredentialFile, productCaFile, token }))
    .finally(() => rmSync(root, { recursive: true, force: true }));
}

test("App PRODUCT status stays HOLD before admin authorization and release handoff", async () => {
  await privateFixture(async ({ machineCredentialFile, productCaFile }) => {
    let touched = 0;
    const transport = async () => { touched++; return payload(); };
    for (const pair of [[false, true], [true, false], [false, false]]) {
      const output = await readRestrictedPaperStatus({
        authorizedAdmin: pair[0],
        releaseAdmitted: pair[1],
        machineCredentialFile, productCaFile, transport,
      });
      assert.equal(output.ok, false);
      assert.equal(output.status, "HOLD_APP_HANDOFF_OR_ADMIN_AUTH");
      assert.equal(output.realOrders, 0);
    }
    assert.equal(touched, 0, "unauthorized calls cannot open PRODUCT socket");
  });
});

test("The admitted App server consumes only filtered PAPER status with separate credential", async () => {
  await privateFixture(async ({ machineCredentialFile, productCaFile, token }) => {
    let called = 0;
    const output = await readRestrictedPaperStatus({
      authorizedAdmin: true, releaseAdmitted: true,
      machineCredentialFile, productCaFile,
      transport: async ({ bearer, ca }) => {
        called++;
        assert.equal(bearer, token);
        assert.ok(Buffer.isBuffer(ca));
        return { ...payload(), paperCashUSD: "NEVER_FORWARD_FINANCE_VALUE",
                 accounts: [{ botId: "NEVER_FORWARD_IDENTIFIER" }] };
      },
    });
    assert.equal(called, 1);
    assert.equal(output.ok, true);
    assert.equal(output.model.paperStatus, SOURCE_HALT);
    assert.equal(output.model.originalAccounts, 100);
    assert.equal(output.model.openUnpricedOriginalPositions, 7);
    assert.equal(output.model.realOrders, 0);
    const encoded = JSON.stringify(output);
    assert.ok(!encoded.includes(token));
    assert.ok(!encoded.includes("paperCashUSD"));
    assert.ok(!encoded.includes("NEVER_FORWARD_IDENTIFIER"));
  });
});

test("Any live trading, fresh-source claim, altered inventory or money authority fails closed", async () => {
  await privateFixture(async ({ machineCredentialFile, productCaFile }) => {
    for (const change of [
      { realOrders: 1 }, { sourceFresh: true },
      { paperNewOrdersAllowed: true }, { fundedAuthority: true },
      { originalAccounts: 99 }, { openUnpricedOriginalPositions: 6 },
      { paperStatus: "RUNNING" }, { accessScope: "OPERATOR_FULL" },
      { schema: "UNREVIEWED_SCHEMA" }, { walletOperationsAllowed: true },
      { woloOperationsAllowed: true },
    ]) {
      const candidate = { ...payload(), ...change };
      assert.throws(() => validateRestrictedStatus(candidate), /HOLD_PRODUCT/);
      const result = await readRestrictedPaperStatus({
        authorizedAdmin: true, releaseAdmitted: true,
        machineCredentialFile, productCaFile,
        transport: async () => candidate,
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, "HOLD_PRODUCT_READ_MODEL_UNAVAILABLE");
      assert.equal(result.realOrders, 0);
    }
  });
});

test("Untrusted machine credential file or missing TLS CA refuses the App relay", async () => {
  await privateFixture(async ({ machineCredentialFile, productCaFile }) => {
    let networkCalls = 0;
    const go = () => readRestrictedPaperStatus({
      authorizedAdmin: true, releaseAdmitted: true,
      machineCredentialFile, productCaFile,
      transport: async () => { networkCalls++; return payload(); },
    });
    chmodSync(machineCredentialFile, 0o666);
    assert.equal((await go()).ok, false);
    chmodSync(machineCredentialFile, 0o640);
    assert.equal((await go()).ok, false, "group-readable machine bearer fails closed");
    chmodSync(machineCredentialFile, 0o600);
    writeFileSync(productCaFile, "not a certificate");
    assert.equal((await go()).ok, false);
    assert.equal(networkCalls, 0);
  });
});

test("Only an unmounted admin-gated server adapter exists; route and credentials do not leak", () => {
  const admin = readFileSync(join(base, "lib/kingdomTradersAdminStatus.ts"),"utf8");
  const seam = JSON.parse(readFileSync(join(base,
     "config/session-c-kingdom-traders-seam.json"), "utf8"));
  assert.equal(seam.routeMounted, false);
  assert.equal(seam.navigationEnabled, false);
  assert.equal(seam.publicOrigin, null);
  assert.equal(seam.operatorCredentialDelegation, false);
  assert.ok(admin.indexOf("await requireAdmin(request)") <
            admin.indexOf("await readRestrictedPaperStatus("));
  assert.match(admin, /KT_PRODUCT_APP_SEAM_ADMITTED/);
  assert.match(admin, /no-store/);
  const source = readFileSync(join(base,
    "lib/kingdomTradersPaperReadonly.mjs"),"utf8");
  assert.match(source, /hostname: "127\.0\.0\.1"/);
  assert.match(source, /port: 9447/);
  assert.match(source, /method: "GET"/);
  assert.match(source, /rejectUnauthorized: true/);
  assert.ok(!source.includes("http://"));
  assert.ok(!source.includes("NEXT_PUBLIC_"));
  assert.ok(!source.includes("8092") && !source.includes("8094"));
});


test("The staged admin PAPER panel stays responsive, semantic, and disconnected", () => {
  const panel = readFileSync(join(base,
    "components/kingdom-traders/KingdomTradersAdminPaperPanel.tsx"), "utf8");
  assert.match(panel, /role="status"/);
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /gridTemplateColumns:/);
  assert.match(panel, /min\(100%, 210px\)/);
  assert.match(panel, /flexWrap: "wrap"/);
  assert.match(panel, /PAPER HALT/);
  assert.match(panel, /seven open positions/);
  assert.ok(!panel.includes("fetch("));
  assert.ok(!panel.includes("useEffect"));
  assert.ok(!panel.includes("<button"));
  assert.ok(!panel.includes("Authorization"));
  assert.ok(!panel.includes("NEXT_PUBLIC_"));
  assert.ok(!panel.includes("api/bridge-status-v1"));
});
