// Runs the ACTUAL existing NextRequest route functions, not copied route mocks.
// Uses synthetic cryptographically signed local sessions, no live DB or writer.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
// CI invokes all tests with the general AoE2WAR alias loader. Register the
// additional Next.js/extension bridge BEFORE dynamically importing the real
// route modules; this changes only this test process, not app/CI global policy.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./tests/ember-route-loader.mjs", pathToFileURL("./"));
const { NextRequest } = await import("next/server");
const [{ signSession, SESSION_COOKIE_NAME },
  { APPEARANCE_WRITER_SOCKET },
  { POST: playerPost },
  { POST: adminPost, GET: adminGet }] = await Promise.all([
    import("../lib/session.ts"),
    import("../lib/appearanceWriterClient.ts"),
    import("../app/api/user/theme-campaign-override/route.ts"),
    import("../app/api/admin/site-theme-campaign/route.ts"),
  ]);

const path = "https://aoe2war.com/api/user/theme-campaign-override";
function req(
  url: string,
  body: unknown,
  token: string | null,
  origin = "https://aoe2war.com",
) {
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: origin,
    "Sec-Fetch-Site": origin === "https://aoe2war.com" ? "same-origin" : "cross-site",
  });
  if (token) headers.set("Cookie", SESSION_COOKIE_NAME + "=" + token);
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}
const body = {campaignKey:"november-crimson-2026",themeKey:"midnight"};
test("actual personal POST denies unsigned or forged session without querying DB", async()=>{
  const unsigned=await playerPost(req(path,body,null));
  assert.equal(unsigned.status,401);
  assert.equal(unsigned.headers.get("cache-control")?.includes("no-store"),true);
  const forged=await playerPost(req(path,body,"some.forged.jwt.signature"));
  assert.equal(forged.status,401);
});
test("actual admin GET and POST independently deny anonymous even with a valid-looking command",async()=>{
  const get=await adminGet(new NextRequest("https://aoe2war.com/api/admin/site-theme-campaign"));
  assert.equal(get.status,401);
  const post=await adminPost(req("https://aoe2war.com/api/admin/site-theme-campaign",
    {campaignKey:"november-crimson-2026"},null));
  assert.equal(post.status,401);
});
test("valid synthetic signed player is denied cross-site origin before writer IPC",async()=>{
  const token=await signSession("source_only_scribe_123");
  const res=await playerPost(req(path,body,token,"https://attacker.example"));
  assert.equal(res.status,403);
});
test("valid synthetic signed player cannot select another subject in JSON",async()=>{
  const token=await signSession("source_only_scribe_123");
  const res=await playerPost(req(path,{...body,userId:11},token));
  assert.equal(res.status,400);
});
test("actual authenticated player POST fails closed when separate UNIX writer is absent",async()=>{
  assert.equal(existsSync(APPEARANCE_WRITER_SOCKET),false,
    "This isolated test MUST NOT run against any installed appearance writer service");
  const token=await signSession("source_only_scribe_123");
  const res=await playerPost(req(path,body,token));
  assert.equal(res.status,503);
  assert.equal((await res.json()).detail,"APPEARANCE_WRITER_UNAVAILABLE");
});
