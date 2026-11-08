/**
 * Pure, strict heartbeat result admission. Never logs the raw worker output,
 * error bodies, transaction identifiers, DB URLs or authorization material.
 * This check cannot grant financial authority or perform SQL.
 */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

export function assertWoloTransferHeartbeat(payload){
 if(!payload || typeof payload!=="object" || Array.isArray(payload) ||
    payload.ok!==true || payload.chainId!=="wolo-1" ||
    payload.mode!=="rest_tx_search" || !Array.isArray(payload.errors) ||
    payload.errors.length!==0){
  throw Error("HOLD_WOLO_TRANSFER_HEARTBEAT_UNTRUSTED");
 }
 for(const name of ["latestHeight","queriesAttempted","txsSeen","created","updated"]){
  if(!Number.isSafeInteger(payload[name]) ||
     payload[name]<(name==="latestHeight"||name==="queriesAttempted"?1:0)){
   throw Error("HOLD_WOLO_TRANSFER_HEARTBEAT_BAD_COUNTER");
  }
 }
 return Object.freeze({
   height:payload.latestHeight,seen:payload.txsSeen,
   created:payload.created,updated:payload.updated,
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)throw Error("invalid_heartbeat_argv");
  const raw=readFileSync(process.argv[2],"utf8");
  if(Buffer.byteLength(raw)>5000000)throw Error("oversized_heartbeat_output");
  const verified=assertWoloTransferHeartbeat(JSON.parse(raw));
  process.stdout.write("PASS_WOLO_TRANSFER_HEARTBEAT height="+verified.height+
    " seen="+verified.seen+" created="+verified.created+" updated="+verified.updated+"\n");
 }catch{
  process.stderr.write("HOLD_WOLO_TRANSFER_HEARTBEAT_NO_SUCCESS_RECEIPT\n");
  process.exitCode=3;
 }
}
