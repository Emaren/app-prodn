import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {postSpeedSample} from "../lib/speed/transport.ts";

// Regression: production telemetry stays enabled unless the disposable
// Renaissance fixture explicitly opts out, and the Chrome guard stays strict.
test("production posts speed samples, disposable read-only preview never posts", async () => {
  const originalFetch=globalThis.fetch;
  const originalFlag=process.env.NEXT_PUBLIC_REN88_READONLY_PREVIEW;
  const seen: {url: string, method: string}[]=[];
  try {
    globalThis.fetch=(async (url: string | URL | Request, init?: RequestInit)=>{
      seen.push({url:String(url),method:String(init?.method)});
      return new Response("{}",{status:200});
    }) as typeof fetch;
    delete process.env.NEXT_PUBLIC_REN88_READONLY_PREVIEW;
    await postSpeedSample({} as Parameters<typeof postSpeedSample>[0]);
    assert.deepEqual(seen,[{url:"/api/speed/sample",method:"POST"}]);
    process.env.NEXT_PUBLIC_REN88_READONLY_PREVIEW="1";
    await postSpeedSample({} as Parameters<typeof postSpeedSample>[0]);
    assert.equal(seen.length,1,"disposable preview unexpectedly attempted mutation");
    process.env.NEXT_PUBLIC_REN88_READONLY_PREVIEW="false";
    await postSpeedSample({} as Parameters<typeof postSpeedSample>[0]);
    assert.equal(seen.length,2,"unrecognized flag must preserve production telemetry");
  } finally {
    globalThis.fetch=originalFetch;
    if(originalFlag===undefined) delete process.env.NEXT_PUBLIC_REN88_READONLY_PREVIEW;
    else process.env.NEXT_PUBLIC_REN88_READONLY_PREVIEW=originalFlag;
  }
});
test("preview flag is scoped and browser no-mutation protection remains fail-closed",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/renaissance-88-a11y-preview.yml",import.meta.url),"utf8");
  const layout=readFileSync(new URL("../app/layout.tsx",import.meta.url),"utf8");
  const chrome=readFileSync(new URL("../scripts/aoe2_release_r16_w1safe_disposable_chrome.cjs",import.meta.url),"utf8");
  assert.match(workflow,/NEXT_PUBLIC_REN88_READONLY_PREVIEW: '1'/);
  assert.match(layout,/NEXT_PUBLIC_REN88_READONLY_PREVIEW !== "1"/);
  assert.match(chrome,/entry\.mutations_blocked===0/);
  assert.match(chrome,/return route\.abort\(\)/);
  assert.match(workflow,/if \[ "\$browser_rc" -ne 0 \] \|\| \[ "\$w1safe_rc" -ne 0 \]/);
});
