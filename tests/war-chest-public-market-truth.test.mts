import assert from "node:assert/strict";
import test from "node:test";
import {
  activePublishedMarketWagers, eligiblePublishedOpenMarket,
} from "../lib/warChestPublicMarketTruth.ts";

test("unverified, missing-confidence, and inactive markets never enter live radar", () => {
  const candidate={status:"live",publicIntegrityEligible:true};
  assert.equal(eligiblePublishedOpenMarket(candidate,true),true);
  assert.equal(eligiblePublishedOpenMarket(candidate,false),false);
  assert.equal(eligiblePublishedOpenMarket({...candidate,publicIntegrityEligible:false},true),false);
  for(const status of ["settled","voided","under_review","awaiting_final_proof"]) {
    assert.equal(eligiblePublishedOpenMarket({...candidate,status},true),false,status);
  }
  for(const status of ["open","closing","live"]) {
    assert.equal(eligiblePublishedOpenMarket({...candidate,status},true),true,status);
  }
});

test("only active wagers contribute to current slips and market pot", () => {
  const wagers=[
    {id:1,status:"active",side:"left",amountWolo:10},
    {id:2,status:"won",side:"right",amountWolo:200},
    {id:3,status:"lost",side:"left",amountWolo:100},
    {id:4,status:"void",side:"right",amountWolo:300},
    {id:5,status:"active",side:"right",amountWolo:7},
  ];
  assert.deepEqual(activePublishedMarketWagers(wagers).map(w=>w.id),[1,5]);
  assert.equal(activePublishedMarketWagers(wagers).reduce((s,w)=>s+w.amountWolo,0),17);
  assert.equal(wagers.length,5);
});

test("missing integrity proof fails closed",()=>{
  assert.equal(eligiblePublishedOpenMarket({status:"live",publicIntegrityEligible:undefined as unknown as boolean},true),false);
});
