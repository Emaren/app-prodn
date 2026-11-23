import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const read=(p:string)=>readFile(path.join(root,p),"utf8");

test("live Storage OS reuses one owner teaching ledger, never another writer",async()=>{
 const [timeline,workbench]=await Promise.all([
   read("components/storage-os/StorageReceiptTimeline.tsx"),
   read("components/storage-os/StorageHogWorkbench.tsx"),
 ]);
 assert.match(workbench,/StorageReceiptTimeline events=\{events\}/);
 assert.match(timeline,/ledgerStatus==="VERIFIED"/);
 assert.match(timeline,/ownerBinding===ownerBinding/);
 assert.match(timeline,/event\.digestSha256/);
 assert.match(timeline,/event\.at/);
 assert.match(timeline,/NOT ADMITTED · no verified timeline event/);
 assert.doesNotMatch(timeline,/fetch\s*\(|setInterval\s*\(|Math\.random\s*\(/);
 assert.doesNotMatch(timeline,/deleteExecuted\s*:\s*true|transferAuthorized\s*:\s*true/);
});

test("domain, lifecycle and protection remain separate explicit owner controls",async()=>{
 const [policy,route,workbench,ledger]=await Promise.all([
  read("lib/storageHogTeachingPolicy.ts"),
  read("app/api/admin/storage-os/teaching/route.ts"),
  read("components/storage-os/StorageHogWorkbench.tsx"),
  read("lib/storageHogTeachingLedger.ts"),
 ]);
 assert.match(policy,/export const BUSINESS_DOMAINS/);
 assert.match(policy,/export const STORAGE_LIFECYCLES/);
 assert.match(workbench,/aria-label="Business domain"/);
 assert.match(workbench,/aria-label="Lifecycle"/);
 assert.match(workbench,/!!domain&&!!lifecycle/);
 assert.match(route,/!isBusinessDomain\(obj\.domain\)/);
 assert.match(route,/!isStorageLifecycle\(obj\.lifecycle\)/);
 assert.match(ledger,/CLASSIFICATION_REVIEW_VERSION/);
 assert.match(ledger,/TEACHING_OWNER_STRONGER_PROTECTION_HOLD/);
 assert.match(route,/OWNER_FEEDBACK_ONLY_NO_DELETE/);
 assert.doesNotMatch(route,/deleteExecuted\s*:\s*true/);
});
