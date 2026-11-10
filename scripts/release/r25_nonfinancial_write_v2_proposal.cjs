"use strict";
/**
 * Session B — R25 V2 nonfinancial-write admission policy, NOT a preloader.
 * V1 production guard SHA256 5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3
 * remains installed. No route is activated by this module.
 *
 * Critical integration boundary: deps.verifySession/verifyCsrf/checkGrantFence
 * MUST be server-trusted functions constructed outside untrusted HTTP data.
 * No client header, cookie string or request-body field may supply them.
 *
 * A future exact-identity V2 preloader must delegate session+CSRF verification
 * to the independently authenticated server context and narrow App DB role.
 * This classifier alone is NOT such verification or deployment authority.
 */
const V1_SHA256 = "5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3";
const R25_SOURCE = "b1ef050b954be734c9f34147361e0d02d7c89b19";
const HOST = "aoe2war.com";
const ORIGIN = "https://aoe2war.com";
const AUDITED_ROLE = "aoe2war_web_nonfinancial_writer_v2";
const BUDGETS = Object.freeze({
  "POST /api/user/appearance": Object.freeze({contentType:"application/json",maxBytes:32768,grant:"appearance_self_write"}),
  "POST /api/user/avatar": Object.freeze({contentType:"multipart/form-data",maxBytes:8388608,grant:"managed_avatar_self_write"}),
  "PATCH /api/user/avatar": Object.freeze({contentType:"application/json",maxBytes:32768,grant:"managed_avatar_self_write"}),
  "POST /api/page-change-notices": Object.freeze({contentType:"application/json",maxBytes:4096,grant:"page_notice_self_write"}),
});
const ALLOWED_GRANTS = Object.freeze([
  "appearance_self_write",
  "managed_avatar_self_write",
  "page_notice_self_write",
]);
const DENIED_FINANCE_FAMILIES = Object.freeze([
  "/api/bets", "/api/user/war-satchel", "/api/wallet",
  "/api/payouts", "/api/admin", "/api/staking", "/api/wolo",
]);
const CTL = /^[\x20-\x7E]+$/;

function hold(code) {
  return Object.freeze({status:"HOLD:NONFINANCIAL_V2_"+code,
    deploymentAuthorized:false,financialAuthorized:false});
}
function header(raw, key) {
  const source=raw && typeof raw==="object" && !Array.isArray(raw)?raw:{};
  const matching=Object.keys(source).filter(x=>x.toLowerCase()===key);
  if (matching.length!==1 || typeof source[matching[0]]!=="string") return null;
  const s=source[matching[0]];
  return s.length>0 && s.length<=4096 && CTL.test(s)?s:null;
}
function noHeader(raw,key) {
  return !raw || typeof raw!=="object" || Object.keys(raw).every(k=>k.toLowerCase()!==key);
}
function exactScope(path) {
  return typeof path==="string" && path.startsWith("/") &&
    !/[?#\\%]|\/\//.test(path) &&
    !path.split("/").some(part=>part==="." || part==="..");
}
async function proposeV2Write(request, deps, nowEpochSeconds) {
  const empty=hold("UNTRUSTED_OR_UNAVAILABLE");
  if (!request || typeof request!=="object" || Array.isArray(request) ||
      !deps || typeof deps!=="object" || Array.isArray(deps) ||
      typeof deps.verifySession!=="function" ||
      typeof deps.verifyCsrf!=="function" ||
      typeof deps.checkGrantFence!=="function") return empty;
  const {method,path,headers,remoteAddress}=request;
  if (typeof method!=="string" || !exactScope(path) || method!==method.toUpperCase())
    return hold("METHOD_OR_PATH");
  for (const prefix of DENIED_FINANCE_FAMILIES) {
    if (path===prefix || path.startsWith(prefix+"/")) return hold("FINANCIAL_OR_ADMIN_ROUTE");
  }
  const scope=BUDGETS[method+" "+path];
  if (!scope) return hold("UNLISTED_METHOD_PATH");
  if (remoteAddress!=="127.0.0.1") return hold("NOT_TRUSTED_PROXY_SOCKET");
  if (header(headers,"host")!==HOST ||
      header(headers,"origin")!==ORIGIN ||
      header(headers,"x-forwarded-proto")!=="https" ||
      ![null,HOST].includes(header(headers,"x-forwarded-host")) ||
      !["same-origin","none"].includes(header(headers,"sec-fetch-site")))
    return hold("ORIGIN_HOST_OR_FETCH_METADATA");
  if (header(headers,"sec-fetch-site")==="none") return hold("BROWSER_CONTEXT_NOT_SAME_ORIGIN");
  if (!noHeader(headers,"x-forwarded-for") &&
      !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(header(headers,"x-forwarded-for")||""))
    return hold("UNTRUSTED_FORWARDED_ID");
  if (header(headers,"transfer-encoding")!==null) return hold("CHUNKED_OR_DUPLICATE_TRANSFER");
  const length=header(headers,"content-length");
  if (!length || !/^[1-9][0-9]*$/.test(length) || Number(length)>scope.maxBytes)
    return hold("BODY_NOT_BOUNDED");
  const contentType=header(headers,"content-type");
  const ct=(contentType||"").split(";")[0].trim().toLowerCase();
  if (ct!==scope.contentType) return hold("UNEXPECTED_CONTENT_TYPE");
  if (ct==="multipart/form-data" &&
      !/;\s*boundary=[a-zA-Z0-9'()+_,-./:=?]{8,120}(?:;|$)/i.test(contentType))
    return hold("UNBOUNDED_MULTIPART");
  const now=Number(nowEpochSeconds);
  if (!Number.isSafeInteger(now) || now<1600000000) return hold("UNPINNED_SERVER_CLOCK");
  // Server-trusted verifier is mandatory. Never parse role/uid from headers.
  let session;
  try {session=await deps.verifySession(request);} catch {return hold("SESSION_VERIFICATION_FAILED");}
  if (!session || session.kind!=="trusted_signed_session" ||
      !/^[A-Za-z0-9_.:-]{4,100}$/.test(session.uid||"") ||
      !["admin","user"].includes(session.role) ||
      !Number.isSafeInteger(session.expiresEpoch) ||
      session.expiresEpoch<=now || session.expiresEpoch>now+30*24*3600)
    return hold("ANONYMOUS_STALE_OR_UNVERIFIED_SESSION");
  let csrfOk=false;
  try {csrfOk=(await deps.verifyCsrf(request,session))===true;} catch {}
  if (!csrfOk) return hold("CSRF_NOT_INDEPENDENTLY_VERIFIED");
  let fence;
  try {fence=await deps.checkGrantFence(session.uid);} catch {return hold("DB_FENCE_UNAVAILABLE");}
  if (!fence || fence.role!==AUDITED_ROLE ||
      fence.financeWritesDenied!==true ||
      fence.financeReadsDenied!==true ||
      fence.grantsAreScopedToSessionOwner!==true ||
      !Array.isArray(fence.allowedGrants) ||
      fence.allowedGrants.some(g=>!ALLOWED_GRANTS.includes(g)) ||
      !fence.allowedGrants.includes(scope.grant) ||
      new Set(fence.allowedGrants).size!==fence.allowedGrants.length ||
      fence.recheckedAtEpoch>now || fence.recheckedAtEpoch<now-60)
    return hold("NONFINANCIAL_DB_FENCE_NOT_VERIFIED");
  return Object.freeze({
    status:"SOURCE_ONLY_ALLOWLIST_MATCH_NOT_ADMITTED",
    deploymentAuthorized:false,
    financialAuthorized:false,
    routeKey:method+" "+path,
    ownerUid:session.uid,
    verifiedRole:session.role,
    requiredGrant:scope.grant,
    v1Sha256:V1_SHA256,
    r25Source:R25_SOURCE,
    requiredNextStep:"CENTRAL_EXACT_V2_RUNTIME_AND_ROLE_REVIEW",
  });
}
module.exports = Object.freeze({proposeV2Write, BUDGETS, V1_SHA256, R25_SOURCE});
