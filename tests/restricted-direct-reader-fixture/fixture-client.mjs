import {executeSocialDirectRead} from "./socialDirectReaderCore.mjs";
import {verifySocialSignedSession} from "./socialWriterSession.mjs";
import pg from "pg";
export const pool=new pg.Pool({host:process.env.DIRECT_FIXTURE_SOCKET,port:Number(process.env.DIRECT_FIXTURE_PORT),database:"aoe2hd_db",user:"aoe2war_social_writer",max:2,connectionTimeoutMillis:1500});
export function signedSocialCookie(request){const t=request.cookies.get("aoe2hdbets_session")?.value;return t&&t.length>=32&&t.length<=4096?t:null;}
export function callSocialDirectReader(token,input){return executeSocialDirectRead({pool,sessionToken:token,input,verifySession:t=>verifySocialSignedSession(t,process.env.SESSION_SECRET)});}
