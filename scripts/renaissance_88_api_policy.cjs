"use strict";
/** Explicitly audited GET-only local candidate APIs. Everything else is a 503. */
const REAL_READONLY=new Set([
  "/api/deployment-version", // environment build marker only
  "/api/kingdom-route-census", // bounded local emitted Next manifest read
  "/api/kingdom-index", // public read-only file/review catalog
  "/api/players/generation", // Prisma SELECT-only generation projection
]);
function classifyApiFixtureRequest(raw,method,origin,dbState){
  if(method!=="GET"&&method!=="HEAD")return "BLOCK_MUTATION";
  let parsed;
  try{parsed=new URL(raw);}catch{return "BLOCK_UNPARSABLE";}
  if(parsed.origin!==origin)return "BLOCK_EXTERNAL";
  if(!parsed.pathname.startsWith("/api/"))return "NOT_API";
  if(method!=="GET"||parsed.search||parsed.hash)return "SYNTHETIC_UNAVAILABLE";
  if(!REAL_READONLY.has(parsed.pathname))return "SYNTHETIC_UNAVAILABLE";
  if(parsed.pathname==="/api/players/generation"&&dbState!=="REACHABLE")return "SYNTHETIC_UNAVAILABLE";
  return "LOCAL_AUDITED_READONLY";
}
module.exports={REAL_READONLY,classifyApiFixtureRequest};
