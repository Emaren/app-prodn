import http from "node:http";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { PRODUCTION_WEB_ORIGIN } from "@/lib/productionAuth";

// Restricted nonfinancial operations. Never pass database credentials, SQL, or client sender IDs.
export const SOCIAL_WRITER_SOCKET = "/run/aoe2war-social-writer/social.sock";
export type SocialScope = "clan" | "direct" | "lobby";
const MAX_BYTES = 4096;
const TIMEOUT = 2300;
export function validateSocialWriteOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const expected = new URL(PRODUCTION_WEB_ORIGIN);
    const parsed = new URL(origin);
    const host = request.headers.get("host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    return parsed.origin === expected.origin && parsed.username === "" &&
      parsed.password === "" && parsed.protocol === "https:" &&
      (!host || host === expected.host) &&
      (!forwardedProto || forwardedProto === "https");
  } catch { return false; }
}
export function signedSocialCookie(request: NextRequest): string | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token && token.length >= 32 && token.length <= 4096 ? token : null;
}
export async function readBoundedSocialJson(request: NextRequest): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
    throw new Error("SOCIAL_BODY_TOO_LARGE");
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    throw new Error("SOCIAL_JSON_REQUIRED");
  if (!request.body) throw new Error("SOCIAL_BODY_REQUIRED");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { void reader.cancel().catch(()=>{}); throw new Error("SOCIAL_BODY_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
export async function callSocialWriter(
  scope: SocialScope,
  signedSession: string,
  input: Record<string,unknown>,
): Promise<{status:number;body:Record<string,unknown>}> {
  return callSocialSocket(scope==="clan"?"/v1/clan/text":scope==="direct"?"/v1/direct/text":"/v1/lobby/text",signedSession,input,MAX_BYTES,TIMEOUT);
}
export async function callSocialImageWriter(signedSession:string,input:Record<string,unknown>) {
  return callSocialSocket("/v1/direct/image",signedSession,input,13_400_000,8_000);
}
async function callSocialSocket(endpoint:string,signedSession:string,input:Record<string,unknown>,limit:number,timeout:number):Promise<{status:number;body:Record<string,unknown>}> {
  const payload = JSON.stringify(input);
  const size=Buffer.byteLength(payload,"utf8");
  if (!signedSession || signedSession.length > 4096 || size > limit || size < 2)
    return {status:400,body:{detail:"INVALID_SOCIAL_TEXT_REQUEST"}};
  return new Promise(resolve=>{
    let done=false;
    const finish=(result:{status:number;body:Record<string,unknown>})=>{
      if (!done){done=true;resolve(result);}
    };
    const req=http.request({
      socketPath:SOCIAL_WRITER_SOCKET,
      path:endpoint,
      method:"POST",timeout,
      headers:{
        "Content-Type":"application/json",
        "Content-Length":size,
        "x-social-signed-session":signedSession,
        "Connection":"close",
      },
    },res=>{
      const chunks:Buffer[]=[];let bytes=0;
      res.on("data",(chunk:Buffer)=>{
        bytes+=chunk.length;
        if(bytes>8192){req.destroy();finish({status:503,body:{detail:"SOCIAL_WRITER_REPLY_UNAVAILABLE"}});}
        else chunks.push(chunk);
      });
      res.on("end",()=>{
        try {
          const obj:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if(!obj||typeof obj!=="object"||Array.isArray(obj)) throw new Error();
          finish({status:res.statusCode&&res.statusCode>=200&&res.statusCode<=503?res.statusCode:503,body:obj as Record<string,unknown>});
        } catch {
          finish({status:503,body:{detail:"SOCIAL_WRITER_REPLY_UNAVAILABLE"}});
        }
      });
    });
    req.on("timeout",()=>req.destroy());
    req.on("error",()=>finish({status:503,body:{detail:"SOCIAL_SEND_STATUS_UNKNOWN_CHECK_HISTORY_BEFORE_RETRY"}}));
    req.end(payload);
  });
}
