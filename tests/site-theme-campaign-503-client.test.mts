import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  fetchSiteThemeCampaignState,
  SiteThemeCampaignReadUnavailable,
} from "../lib/siteThemeCampaignClient.ts";
const context=readFileSync("components/lobby/LobbyAppearanceContext.tsx","utf8");

const mockFetch=(status:number,body:object,fn:()=>Promise<void>)=>{
  const prior=globalThis.fetch;
  globalThis.fetch=(async()=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})) as typeof fetch;
  return fn().finally(()=>{globalThis.fetch=prior;});
};
test("real 200/null represents only genuinely absent campaign",async()=>{
  await mockFetch(200,{campaign:null,overrideThemeKey:null},async()=>{
    const result=await fetchSiteThemeCampaignState();
    assert.deepEqual(result,{campaign:null,overrideThemeKey:null});
  });
});
test("503 exact optional-read unavailable is a distinct typed exception",async()=>{
  await mockFetch(503,{status:"HOLD_SITE_THEME_CAMPAIGN_READ_UNAVAILABLE",campaignAvailability:"unavailable"},async()=>{
    await assert.rejects(fetchSiteThemeCampaignState(),(error:unknown)=>{
      assert.ok(error instanceof SiteThemeCampaignReadUnavailable);
      assert.equal(error.code,"HOLD_SITE_THEME_CAMPAIGN_READ_UNAVAILABLE");
      return true;
    });
  });
});
test("503 unrelated/backend errors never masquerade as exact optional-read denial",async()=>{
  for(const error of [
    {status:"HOLD_SITE_THEME_CAMPAIGN_BACKEND_FAILURE"},
    {campaign:null,overrideThemeKey:null},
    {status:"HOLD_SITE_THEME_CAMPAIGN_READ_UNAVAILABLE",campaignAvailability:"available"},
  ]){
    await mockFetch(503,error,async()=>{
      await assert.rejects(fetchSiteThemeCampaignState(),(e:unknown)=>{
        assert.ok(e instanceof Error);
        assert.equal(e instanceof SiteThemeCampaignReadUnavailable,false);
        return true;
      });
    });
  }
});
test("ordinary authentication errors remain exceptional",async()=>{
  await mockFetch(401,{error:"Unauthorized"},async()=>{
    await assert.rejects(fetchSiteThemeCampaignState(),/request failed: 401/);
  });
});
test("lobby no longer clears verified campaign when the source is unavailable",()=>{
  assert.match(context,/siteThemeCampaignAvailability: "unknown" \| "available" \| "unavailable" \| "error"/);
  assert.match(context,/error instanceof SiteThemeCampaignReadUnavailable \? "unavailable" : "error"/);
  assert.match(context,/setSiteThemeCampaignAvailability\("available"\)/);
  assert.doesNotMatch(context,/Failed to hydrate site theme campaign:[\s\S]{0,180}setSiteThemeCampaign\(null\)/);
  assert.doesNotMatch(context,/Failed to hydrate site theme campaign:[\s\S]{0,200}setCampaignOverrideThemeKey\(null\)/);
});
