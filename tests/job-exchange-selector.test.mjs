import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const qa=readFileSync("tests/job-exchange-browser.cjs","utf8");
const ui=readFileSync("components/central-command/JobExchangeClient.tsx","utf8");

test("Q09 target is the one named selected CORE C evidence region, not the entire page",()=>{
  assert.match(ui,/<section aria-label="Selected brain evidence drill down" className=\{styles\.evidence\}>/);
  assert.match(ui,/<h2><Activity size=\{19\}\/> CORE \{selectedLane\?\.id\?\?"\?"\} — RECEIPTS<\/h2>/);
  assert.match(qa,/const selectedEvidence=p\.getByRole\("region",\{name:"Selected brain evidence drill down"\}\)/);
  assert.match(qa,/selectedEvidence\.getByRole\("heading",\{name:"CORE C — RECEIPTS"\}\)\.waitFor/);
});
test("Q09 correct empty state remains strict and unique *within the selected region*",()=>{
  assert.match(qa,/assert\.equal\(await selectedEvidence\.count\(\),1,"Exactly one selected-lane evidence region"\)/);
  assert.match(qa,/const noEvent=selectedEvidence\.getByText\("No event currently evidenced for this lane"\)/);
  assert.match(qa,/await noEvent\.waitFor\(\{timeout:4000\}\)/);
  assert.match(qa,/assert\.equal\(await noEvent\.count\(\),1,"Exactly one empty-state message in selected CORE C evidence"\)/);
  assert.doesNotMatch(qa,/p\.getByText\("No event currently evidenced for this lane"\)/);
  assert.doesNotMatch(qa,/noEvent\.first\(/);
  assert.doesNotMatch(qa,/noEvent\.nth\(/);
});
test("Q09 checks admin-only access and real source evidence before selected-lane assertion",()=>{
  const admin=qa.indexOf('const admin=await token("fixture-admin")');
  const realEvent=qa.indexOf('getByText("COMMIT WITNESSED")');
  const button=qa.indexOf('getByRole("button",{name:"Inspect Session C source evidence"}).click()');
  const selected=qa.indexOf('const selectedEvidence=p.getByRole("region"');
  assert.ok(admin>=0 && admin<realEvent && realEvent<button && button<selected);
  assert.match(qa,/assert\.equal\(await p\.getByRole\("button",\{name:"Inspect Session C source evidence"\}\)\.getAttribute\("aria-pressed"\),"true"\)/);
});
