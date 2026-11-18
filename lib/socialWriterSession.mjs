// Original AoE2WAR HS256 Steam session, re-verified by the separate writer.
// The request body may never carry uid, role, senderId or admin authority.
import { jwtVerify } from "jose";
const MAX_SESSION_AGE = 30*24*60*60;
export async function verifySocialSignedSession(token, secret) {
  if (typeof token !== "string" || token.length < 32 || token.length > 4096 ||
      typeof secret !== "string" || secret.length < 32)
    throw new Error("SOCIAL_SESSION_INVALID");
  const {payload, protectedHeader} = await jwtVerify(token,new TextEncoder().encode(secret),{
    issuer:"aoe2hdbets",algorithms:["HS256"],clockTolerance:0,
  });
  const now=Math.floor(Date.now()/1000);
  if (protectedHeader.alg!=="HS256" || typeof payload.uid!=="string" ||
      !/^[A-Za-z0-9_.:-]{1,100}$/.test(payload.uid) ||
      typeof payload.iat!=="number" || !Number.isInteger(payload.iat) ||
      typeof payload.exp!=="number" || !Number.isInteger(payload.exp) ||
      payload.iat>now+1 || payload.exp<=now ||
      payload.exp>payload.iat+MAX_SESSION_AGE)
    throw new Error("SOCIAL_SESSION_INVALID");
  return payload.uid;
}
