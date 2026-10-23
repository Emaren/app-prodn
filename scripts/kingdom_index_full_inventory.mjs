#!/usr/bin/env node
/**
 * Deterministic source-controlled Kingdom Index page/handler census.
 * Path coverage only: NOT an access proof, source dependency closure, score or deploy receipt.
 * --check compares committed HEAD paths; --write is an explicit reviewer action.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PAGE = /^app\/(?:.*\/)?page\.(?:tsx|ts|jsx|js|mdx)$/;
const HANDLER = /^app\/(?:.*\/)?route\.(?:tsx|ts|jsx|js)$/;

export function routeHref(entrypoint) {
  const rel = entrypoint.replace(/^app\//, "").replace(/\/?page\.(?:tsx|ts|jsx|js|mdx)$/, "");
  return "/" + rel;
}

export function census(paths, indexedHrefs) {
  const all = [...paths];
  if (new Set(all).size !== all.length) throw Error("Duplicate source paths");
  const publicIndex = new Set(indexedHrefs);
  if (publicIndex.size !== indexedHrefs.length) throw Error("Duplicate public Index addresses");
  const pages = all.filter(p=>PAGE.test(p)).sort().map(entrypoint=>{
    const href = routeHref(entrypoint);
    const scope = href === "/admin" || href.startsWith("/admin/") ? "admin-path"
      : href.includes("[") ? "dynamic-template"
      : publicIndex.has(href) ? "public-index" : "excluded-static";
    return { href, entrypoint, scope, assurance:"unverified" };
  });
  const handlers = all.filter(p=>HANDLER.test(p)).sort().map(entrypoint=>({
    entrypoint, scope:entrypoint.startsWith("app/api/") ? "api" : "non-api",
    ownership:"unassigned"
  }));
  if (new Set(pages.map(p=>p.href)).size !== pages.length) throw Error("Duplicate page route patterns");
  for (const href of publicIndex) {
    if (!pages.some(p=>p.href === href && p.scope === "public-index"))
      throw Error("Public Index source has no matching static page: " + href);
  }
  const counts = {
    pageTemplates:pages.length,
    adminTemplates:pages.filter(x=>x.scope==="admin-path").length,
    dynamicTemplates:pages.filter(x=>x.scope==="dynamic-template").length,
    publicIndexTemplates:pages.filter(x=>x.scope==="public-index").length,
    excludedStaticTemplates:pages.filter(x=>x.scope==="excluded-static").length,
    routeHandlerTemplates:handlers.length,
    apiHandlerTemplates:handlers.filter(x=>x.scope==="api").length,
    nonApiHandlerTemplates:handlers.filter(x=>x.scope==="non-api").length,
  };
  if (counts.pageTemplates !== counts.adminTemplates + counts.dynamicTemplates
     + counts.publicIndexTemplates + counts.excludedStaticTemplates)
    throw Error("Page scope partition is incomplete");
  return {counts,pages,handlers};
}

export function compareCensus(saved, actual) {
  if (saved?.schema !== 1 || saved?.kind !== "aoe2war-kingdom-page-and-handler-path-census")
    throw Error("Invalid inventory schema");
  for (const key of ["counts","pages","handlers"]) {
    if (JSON.stringify(saved[key]) !== JSON.stringify(actual[key]))
      throw Error("KINGDOM INDEX INVENTORY DRIFT: " + key);
  }
  return actual.counts;
}

export function gitHeadPaths() {
  return execFileSync("git",["ls-tree","-r","--name-only","HEAD","--","app"],
    {encoding:"utf8",maxBuffer:16_000_000}).trim().split("\n").filter(Boolean);
}

function run() {
  const root=process.cwd();
  const target=resolve(root,"config/kingdom-index-inventory.json");
  const publicCatalog=JSON.parse(readFileSync(resolve(root,"config/kingdom-index-routes.json"),"utf8"));
  const actual=census(gitHeadPaths(),publicCatalog.map(row=>row.href));
  if (process.argv.includes("--write")) {
    const saved=JSON.parse(readFileSync(target,"utf8"));
    const next={...saved,counts:actual.counts,pages:actual.pages,handlers:actual.handlers};
    // Preserve the immutable sourceCensus record: it describes where the initial
    // inventory originated, not an attestation of HEAD or deployed runtime.
    writeFileSync(target,JSON.stringify(next,null,2)+"\n");
  } else {
    compareCensus(JSON.parse(readFileSync(target,"utf8")),actual);
  }
  console.log(JSON.stringify({status:"SOURCE_PATH_CENSUS_ONLY",head:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),...actual.counts,qualityScoreAuthority:"none",accessCertification:false,productionCertification:false},null,2));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) run();
