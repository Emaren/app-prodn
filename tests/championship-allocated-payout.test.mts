import assert from "node:assert/strict";
import test from "node:test";
import { executeAllocatedFounderPayout, reconcileAllocatedFounderPayout, AllocatedFounderPayoutError } from "../lib/trophies/allocatedFounderPayout.ts";
import { splitTitleUwolo } from "../lib/champions/beltPolicy.ts";

const recipient="wolo1qaallocationrecipient",signer="wolo1qafounderprotected",txHash="A".repeat(64);
const input={requestId:"title:qa:seat:0",toAddress:recipient,amountUwolo:3333334n,memo:"QA allocation proof"};
const health={ok:true,chain_id:"wolo-1",runtime_chain_id:"wolo-1",loopback_only:true,auth_token_set:true,payout_address:signer};
const execution={ok:true,status:"confirmed",request_id:input.requestId,chain_id:"wolo-1",signer_role:"payout",signer_address:signer,to_address:recipient,amount_uwolo:input.amountUwolo.toString(),tx_hash:txHash};
const lookup={ok:true,found:true,tx_success:true,matched_expected:true,chain_id:"wolo-1",tx_hash:txHash,height:"500",memo:input.memo,matched_transfer:{sender:signer,recipient,amount:input.amountUwolo.toString(),denom:"uwolo"}};

test("allocated Founder rail requires protected named auth and never falls back to local signing",async t=>{
  const previousUrl=process.env.WOLO_FOUNDER_SETTLEMENT_URL,previousToken=process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN;
  t.after(()=>{if(previousUrl === undefined)delete process.env.WOLO_FOUNDER_SETTLEMENT_URL;else process.env.WOLO_FOUNDER_SETTLEMENT_URL=previousUrl;if(previousToken === undefined)delete process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN;else process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN=previousToken;});
  let calls=0;
  t.mock.method(globalThis,"fetch",async()=>{calls++;throw new Error("No live requests in this test");});
  for(const url of ["","http://127.0.0.1:8092","http://127.0.0.1:8091","https://example.org:8093"]) {
    process.env.WOLO_FOUNDER_SETTLEMENT_URL=url;process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN="qa-token";
    await assert.rejects(executeAllocatedFounderPayout(input),error=>error instanceof AllocatedFounderPayoutError && !error.uncertain);
  }
  process.env.WOLO_FOUNDER_SETTLEMENT_URL="http://127.0.0.1:8093";delete process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN;
  await assert.rejects(executeAllocatedFounderPayout(input),/FOUNDER_EXECUTOR_UNAVAILABLE/);
  assert.equal(calls,0);
});

test("exact three-seat uwolo remainder reaches protected request and committed event proof",async t=>{
  const previousUrl=process.env.WOLO_FOUNDER_SETTLEMENT_URL,previousToken=process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN;
  process.env.WOLO_FOUNDER_SETTLEMENT_URL="http://127.0.0.1:8093";process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN="qa-token";
  t.after(()=>{if(previousUrl === undefined)delete process.env.WOLO_FOUNDER_SETTLEMENT_URL;else process.env.WOLO_FOUNDER_SETTLEMENT_URL=previousUrl;if(previousToken === undefined)delete process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN;else process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN=previousToken;});
  let current=input,posts:string[]=[];
  t.mock.method(globalThis,"fetch",async(url:string|URL|Request,init?:RequestInit)=>{
    assert.equal((init?.headers as Record<string,string>).authorization,"Bearer qa-token");
    const href=String(url);
    if(href.endsWith("/health"))return Response.json(health);
    if(init?.method === "POST") {const body=JSON.parse(String(init.body));posts.push(body.amount_uwolo);assert.equal(body.request_id,current.requestId);assert.equal(body.to_address,recipient);return Response.json({...execution,request_id:current.requestId,amount_uwolo:current.amountUwolo.toString(),status:"accepted"});}
    assert.ok(href.includes(`expected_amount_uwolo=${current.amountUwolo}`));
    return Response.json({...lookup,matched_transfer:{...lookup.matched_transfer,amount:current.amountUwolo.toString()}});
  });
  for(const [seat,amount] of splitTitleUwolo(10000000n,3).entries()) {current={...input,requestId:`title:qa:seat:${seat}`,amountUwolo:amount};const proof=await executeAllocatedFounderPayout(current);assert.equal(proof.amountUwolo,amount.toString());assert.equal(proof.txHash,txHash);}
  assert.deepEqual(posts,["3333334","3333333","3333333"]);assert.equal(posts.reduce((total,amount)=>total+BigInt(amount),0n),10000000n);
});

test("response mismatch, uncommitted transfer and lost response remain uncertain",async t=>{
  const previousUrl=process.env.WOLO_FOUNDER_SETTLEMENT_URL,previousToken=process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN;
  process.env.WOLO_FOUNDER_SETTLEMENT_URL="http://127.0.0.1:8093";process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN="qa-token";
  t.after(()=>{if(previousUrl === undefined)delete process.env.WOLO_FOUNDER_SETTLEMENT_URL;else process.env.WOLO_FOUNDER_SETTLEMENT_URL=previousUrl;if(previousToken === undefined)delete process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN;else process.env.WOLO_FOUNDER_SETTLEMENT_AUTH_TOKEN=previousToken;});
  let patch:Record<string,unknown>={},lookupPatch:Record<string,unknown>={},loseResponse=false,posts=0;
  t.mock.method(globalThis,"fetch",async(url:string|URL|Request,init?:RequestInit)=>{
    if(String(url).endsWith("/health"))return Response.json(health);
    if(init?.method === "POST") {posts++;if(loseResponse)throw new Error("Simulated response loss");return Response.json({...execution,...patch});}
    return Response.json({...lookup,...lookupPatch});
  });
  for(patch of [{request_id:"another-request"},{to_address:"wolo1wrong"},{amount_uwolo:"3333333"},{chain_id:"wolo-testnet"},{signer_address:"wolo1wrong"},{code:7},{status:"failed"},{tx_hash:""}]) await assert.rejects(executeAllocatedFounderPayout(input),error=>error instanceof AllocatedFounderPayoutError && error.uncertain);
  patch={};lookupPatch={tx_success:false};await assert.rejects(executeAllocatedFounderPayout(input),error=>error instanceof AllocatedFounderPayoutError && error.uncertain);
  lookupPatch={matched_transfer:{...lookup.matched_transfer,amount:"3333333"}};await assert.rejects(executeAllocatedFounderPayout(input),error=>error instanceof AllocatedFounderPayoutError && error.uncertain);
  loseResponse=true;await assert.rejects(executeAllocatedFounderPayout(input),error=>error instanceof AllocatedFounderPayoutError && error.uncertain);
  assert.equal(posts,11);
  const before=posts;
  await assert.rejects(reconcileAllocatedFounderPayout(input,{}),/No payout was resent/);
  loseResponse=false;lookupPatch={};
  const recovered=await reconcileAllocatedFounderPayout(input,{execution:{...execution,status:"accepted"}});
  assert.equal(recovered.txHash,txHash);assert.equal(posts,before);
  assert.equal(recovered.lookup.tx_success,true);
});
