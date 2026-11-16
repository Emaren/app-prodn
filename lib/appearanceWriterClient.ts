/**
 * WE3/B-owned integration candidate for an independently authenticated
 * NONFINANCIAL Unix-socket writer. Does not access writer SQL credentials.
 * Must NOT replace requireAdmin, getSessionUid, or same-origin guards.
 * SOURCE ONLY until B authenticates OS, socket and signing key custody.
 */
import "server-only";
import { createConnection } from "node:net";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";

const SOCKET = "/run/aoe2war-appearance/appearance.sock";
const ORIGIN = "https://aoe2war.com";
const MAX = 1500;

export type AppearanceMutation =
  | { op: "activate-november"; campaignKey: "november-crimson-2026" }
  | { op: "save-override"; campaignKey: "november-crimson-2026"; themeKey: string };
export type AppearanceMutationResult =
  | {ok:true;status:200;campaignKey:string;alreadyActive?:boolean;themeKey?:string;updatedAt?:string}
  | {ok:false;status:number;code:string};

export async function callAppearanceWriter(
  request:NextRequest,command:AppearanceMutation,
):Promise<AppearanceMutationResult> {
  if (process.env.NODE_ENV!=="production" ||
    process.env.AOE2WAR_APPEARANCE_CLIENT_ADMITTED!=="v1") {
    throw new Error("HOLD_APPEARANCE_CLIENT_NOT_ADMITTED");
  }
  const origin=request.headers.get("origin");
  if (origin!==ORIGIN) return {ok:false,status:403,code:"ORIGIN_DENIED"};
  const token=request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || token.length>4096) {
    return {ok:false,status:401,code:"SIGNED_SESSION_REQUIRED"};
  }
  // No userId/isAdmin/SQL or alternate origin fields may cross the IPC fence.
  const frame=JSON.stringify({...command,origin,token})+"\n";
  if (Buffer.byteLength(frame,"utf8")>8192) {
    return {ok:false,status:400,code:"COMMAND_OVERSIZE"};
  }
  return new Promise(resolve=>{
    let settled=false;
    const done=(v:AppearanceMutationResult)=>{
      if(settled)return;
      settled=true;
      socket.destroy();
      resolve(v);
    };
    const socket=createConnection({path:SOCKET});
    socket.setTimeout(4500);
    let result="";
    socket.on("connect",()=>socket.write(frame));
    socket.on("data",(b:Buffer)=>{
      result+=b.toString("utf8");
      if (result.length>MAX) return done({ok:false,status:503,code:"HOLD_WRITER_RESPONSE_SIZE"});
      const i=result.indexOf("\n");
      if(i===-1)return;
      try {
        const value=JSON.parse(result.slice(0,i));
        if(typeof value?.ok!=="boolean"||
          !Number.isInteger(value.status)||typeof(value.code??"")!=="string") {
          return done({ok:false,status:503,code:"HOLD_WRITER_RESPONSE"});
        }
        done(value as AppearanceMutationResult);
      } catch {done({ok:false,status:503,code:"HOLD_WRITER_RESPONSE"});}
    });
    socket.on("error",()=>done({ok:false,status:503,code:"HOLD_WRITER_UNREACHABLE"}));
    socket.on("timeout",()=>done({ok:false,status:503,code:"HOLD_WRITER_TIMEOUT"}));
    socket.on("end",()=>done({ok:false,status:503,code:"HOLD_WRITER_CLOSED"}));
  });
}
