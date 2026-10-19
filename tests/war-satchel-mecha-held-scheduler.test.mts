import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read=(p:string)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("held Mecha preview template cannot activate signer, settlement or finance",()=>{
 const service=read("deploy/aoe2hdbets-war-satchel-mecha-preview.service");
 const timer=read("deploy/aoe2hdbets-war-satchel-mecha-preview.timer");
 const worker=read("scripts/war-satchel-funded-mecha-worker.ts");
 const hold=read("lib/warSatchelFinancialBridgeHold.ts");
 assert.match(service,/--dry-run/);
 assert.doesNotMatch(service,/--execute|EnvironmentFile=|ExecStartPre=.*(curl|wget)/);
 assert.match(service,/Type=oneshot/);
 assert.match(service,/NoNewPrivileges=true/);
 assert.match(service,/ProtectSystem=strict/);
 assert.doesNotMatch(service,/Wants=.*wolochain|Requires=.*wolochain/);
 assert.match(timer,/OnUnitInactiveSec=30s/);
 assert.match(timer,/Persistent=false/);
 assert.doesNotMatch(timer,/^\[Install\]/m);
 assert.match(worker,/if \(!execute && !satchelFinancialBridgeReady\(\)\)/);
 assert.match(worker,/liveWagersPlaced: 0, chainTransfersSent: 0/);
 assert.match(hold,/SATCHEL_FINANCIAL_BRIDGE_READY = false as const/);
});
