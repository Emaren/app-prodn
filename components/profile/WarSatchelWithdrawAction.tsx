"use client";
import { useEffect, useState } from "react";

type Keplr={signArbitrary(chainId:string,address:string,message:string):Promise<{
  pub_key:{type:string;value:string};signature:string;
}>};
async function send(method:"POST"|"PUT",data:unknown){
  const response=await fetch("/api/user/war-satchel/withdrawal",{
    method,credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(data),
  });
  const payload:unknown=await response.json();
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    throw Error("Satchel withdrawal response unreadable.");
  const body=payload as Record<string,unknown>;
  if(!response.ok)throw Error(String(body.detail||"Withdrawal authorization rejected."));
  return body;
}
export default function WarSatchelWithdrawAction({walletAddress}:{
  walletAddress:string;
}){
  const [enabled,setEnabled]=useState(false);
  const [amount,setAmount]=useState("100");
  const [busy,setBusy]=useState(false);
  const [state,setState]=useState("");
  const [requestId,setRequestId]=useState("");
  useEffect(()=>{
    let active=true;
    setEnabled(false);
    if(!walletAddress)return;
    void fetch("/api/user/war-satchel/withdrawal",{cache:"no-store",
      credentials:"same-origin"}).then(r=>r.json()).then((x:unknown)=>{
        if(active&&x&&typeof x==="object"){
          setEnabled((x as Record<string,unknown>).withdrawalsEnabled===true);
        }
      }).catch(()=>{if(active)setEnabled(false);});
    return()=>{active=false};
  },[walletAddress]);
  const value=/^[1-9][0-9]{0,4}$/.test(amount)?Number(amount):NaN;
  const valid=Number.isSafeInteger(value)&&value<=50000;
  const authorize=async()=>{
    if(!enabled||!valid||busy||!walletAddress||requestId)return;
    setBusy(true);setState("");
    try{
      const challenge=await send("POST",{amountWolo:String(value)});
      if(challenge.chainId!=="wolo-1"||
          challenge.walletAddress!==walletAddress||
          typeof challenge.challengeId!=="string"||
          typeof challenge.message!=="string"||
          !challenge.message.includes("War Satchel WITHDRAWAL AUTHORIZATION")||
          !challenge.message.includes("Exact withdrawal amount uwolo: "+(BigInt(value)*BigInt(1000000)))||
          !challenge.message.includes("Linked Keplr receiving wallet: "+walletAddress)||
          typeof challenge.expiresAtUtc!=="string"||
          Date.parse(challenge.expiresAtUtc)<=Date.now()){
        throw Error("Keplr withdrawal permission does not match this owner and amount.");
      }
      const keplr=(window as unknown as {keplr?:Keplr}).keplr;
      if(!keplr?.signArbitrary)throw Error("Keplr wallet signing unavailable.");
      const signature=await keplr.signArbitrary("wolo-1",walletAddress,challenge.message);
      const receipt=await send("PUT",{
        challengeId:challenge.challengeId,keplrSignature:signature,
      });
      if(receipt.authorized!==true||receipt.reserved!==true||
          typeof receipt.withdrawalId!=="string"||receipt.paymentConfirmed!==false){
        throw Error("Withdrawal was not durably reserved.");
      }
      setRequestId(receipt.withdrawalId);
      setState("Request safely reserved. Payment is NOT yet confirmed. Do not repeat it; check the status before trying again.");
    }catch(e){
      setState((e instanceof Error?e.message:"Withdrawal unavailable.")+
        " No new payment should be inferred. Do not authorize a duplicate on timeout.");
    }finally{setBusy(false)}
  };
  return (
    <div className="mt-3 rounded-xl border border-slate-500/30 p-3">
      <h4 className="font-bold text-sky-100">Withdraw War Satchel WOLO to Keplr</h4>
      <p className="mt-1 text-xs text-slate-300">
        Only your linked Keplr wallet can receive withdrawals.
        The withdrawal signer and recovery route must be certified first.
        A signed request is not a completed payment.
      </p>
      <label className="mt-3 block text-xs text-slate-300">
        Withdrawal (whole WOLO)
        <input type="number" min={1} max={50000} value={amount}
          onChange={e=>setAmount(e.target.value)}
          className="mt-1 block w-36 rounded-lg border border-white/20 bg-slate-950 p-2 text-white" />
      </label>
      <button type="button" disabled={busy||!enabled||!valid||!walletAddress||Boolean(requestId)}
        onClick={()=>void authorize()}
        className="mt-3 rounded-lg border border-sky-200/40 p-3 text-xs font-bold disabled:opacity-40">
        {busy?"VERIFYING KEPLR...":enabled?"AUTHORIZE WITHDRAWAL IN KEPLR":"WITHDRAWAL SERVICE NOT CERTIFIED"}
      </button>
      {requestId&&<p className="mt-2 break-all font-mono text-xs">Withdrawal request: {requestId}</p>}
      {state&&<p role="status" className="mt-2 text-xs text-amber-200">{state}</p>}
    </div>
  );
}
