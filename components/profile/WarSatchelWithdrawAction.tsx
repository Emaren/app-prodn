"use client";
import { useEffect, useState } from "react";

type Keplr={signArbitrary(chainId:string,address:string,message:string):Promise<{
  pub_key:{type:string;value:string};signature:string;
}>};
async function send(method:"POST"|"PUT"|"DELETE",data:unknown){
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
  const [requestStatus,setRequestStatus]=useState<"reserved"|"unknown_hold"|"sent"|null>(null);
  useEffect(()=>{
    let active=true;
    setEnabled(false); setRequestId("");setRequestStatus(null);
    if(!walletAddress)return;
    void fetch("/api/user/war-satchel/withdrawal",{cache:"no-store",
      credentials:"same-origin"}).then(r=>r.json()).then((x:unknown)=>{
        if(active&&x&&typeof x==="object"){
          const response=x as Record<string,unknown>;
          setEnabled(response.withdrawalsEnabled===true);
          if(Array.isArray(response.latest)){
            const pending=response.latest.find(v=>{
              if(!v||typeof v!=="object")return false;
              const row=v as Record<string,unknown>;
              return typeof row.id==="string"&&
                (row.status==="reserved"||row.status==="unknown_hold");
            }) as Record<string,unknown>|undefined;
            if(pending){
              setRequestId(String(pending.id));
              setRequestStatus(pending.status==="reserved"?"reserved":"unknown_hold");
            }
          }
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
      setRequestStatus("reserved");
      setState("Request safely reserved. Payment is NOT yet confirmed. Do not repeat it; check the status before trying again.");
    }catch(e){
      setState((e instanceof Error?e.message:"Withdrawal unavailable.")+
        " No new payment should be inferred. Do not authorize a duplicate on timeout.");
    }finally{setBusy(false)}
  };
  const cancel=async()=>{
    if(busy||!enabled||!requestId||requestStatus!=="reserved")return;
    setBusy(true);setState("");
    try{
      const result=await send("DELETE",{withdrawalId:requestId});
      if(result.fullyRefunded!==true)throw Error("Cancellation was not financially confirmed.");
      setRequestId("");setRequestStatus(null);
      setState("Reserved withdrawal cancelled in full. No WOLO transfer was signed or broadcast.");
    }catch(error){
      setState((error instanceof Error?error.message:"Cancellation unavailable.")+
        " If signing began, the request stays held to prevent double payment.");
    }finally{setBusy(false);}
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
      {requestId&&(
        <div className="mt-2 space-y-2">
          <p className="break-all font-mono text-xs">Withdrawal request: {requestId}</p>
          <p className="text-xs text-slate-300">Status: {requestStatus === "unknown_hold"
            ? "SIGNING UNCERTAIN — NO RESEND OR CANCELLATION"
            : requestStatus === "reserved" ? "RESERVED, NOT YET BROADCAST" : "PENDING"}</p>
          {requestStatus==="reserved"&&(
            <button type="button" disabled={busy} onClick={()=>void cancel()}
              className="rounded-lg border border-amber-200/40 p-2 text-xs font-semibold disabled:opacity-40">
              CANCEL UNSENT WITHDRAWAL — RETURN FULL AMOUNT
            </button>
          )}
        </div>
      )}
      {state&&<p role="status" className="mt-2 text-xs text-amber-200">{state}</p>}
    </div>
  );
}
