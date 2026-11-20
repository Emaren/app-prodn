import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import test from "node:test";
import vm from "node:vm";
import type {ReactElement, ReactNode} from "react";

// Compile the shipped tile. The fake browser drives its real effects and click handler,
// and React's server renderer produces the actual lower console markup.
const require = createRequire(import.meta.url);
const ts: typeof import("typescript") = require("typescript");
const {Children} = require("react") as typeof import("react");
const {renderToStaticMarkup} = require("react-dom/server") as typeof import("react-dom/server");
const javascript = ts.transpileModule(readFileSync("components/wolo/WoloChainTerminalTile.tsx","utf8"), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},
}).outputText;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test("daemon polling, visibility, freshness and historical click preference", async t => {
  t.mock.timers.enable({apis:["Date","setInterval","setTimeout"],now:Date.parse("2026-11-20T19:10:00Z")});
  const requests: AbortSignal[] = [];
  const storage = new Map<string,string>();
  const listeners = new Set<()=>void>();
  const document = {
    visibilityState:"visible",
    addEventListener: (_:string,fn:()=>void) => listeners.add(fn),
    removeEventListener: (_:string,fn:()=>void) => listeners.delete(fn),
  };
  const journal = (age=0) => ({
    ok:true,label:"wolochaind-mainnet.journal",sampledAtUtc:new Date(Date.now()-age).toISOString(),
    lines:["\x1b[32mINF\x1b[0m indexed block events \x1b[36mheight=\x1b[0m12"],
  });
  let reply = async () => Response.json(journal());
  let rpcReads = 0;
  const fetch = async (url:string, options:{signal:AbortSignal}) => {
    if(url==="/rpc/blockchain" || url==="/rpc/status"){rpcReads++;return new Response(null,{status:503});}
    assert.equal(url,"/api/wolo/daemon-log");
    requests.push(options.signal);
    return reply();
  };

  const slots:unknown[] = [], effects:Array<()=>void|(()=>void)> = [], cleanup:Array<()=>void> = [];
  let cursor=0;
  const hooks = {
    useState(initial:unknown) {
      const index=cursor++;
      if(!(index in slots))slots[index]=typeof initial==="function"?initial():initial;
      return [slots[index],(value:unknown)=>{slots[index]=typeof value==="function"?value(slots[index]):value;}];
    },
    useRef(value:unknown) {const index=cursor++;return slots[index]??={current:value};},
    useEffect(effect:()=>void|(()=>void), deps:unknown[]) {
      const index=cursor++,previous=slots[index] as unknown[]|undefined;
      if(!previous || deps.some((value,i)=>value!==previous[i]))effects.push(effect);
      slots[index]=deps;
    },
  };
  type Lower = ReactElement<{onClick:(event:{target:null})=>void}>;
  const module = {exports:{} as {default:()=>ReactElement<{children:ReactNode}>}};
  vm.runInNewContext(javascript, {
    exports:module.exports,Date,AbortController,document,Element:class {},fetch,
    window:{setTimeout,clearTimeout,setInterval,clearInterval,localStorage:{
      getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v),
    }},
    require:(id:string)=>{
      if(id==="react")return hooks;
      if(id==="react/jsx-runtime")return require(id);
      if(id==="@/lib/woloBrowserRpcStatus" || id==="@/lib/woloBrowserBlockFeed")return {};
      throw Error("Unexpected import "+id);
    },
  });
  function render() {
    cursor=0;
    const sections=Children.toArray(module.exports.default().props.children);
    for(const effect of effects.splice(0)){const dispose=effect();if(dispose)cleanup.push(dispose);}
    return sections.at(-1) as Lower;
  }
  const markup=()=>renderToStaticMarkup(render());
  const tick=async(ms:number)=>{t.mock.timers.tick(ms);await flush();};
  const visibility=(state:string)=>{document.visibilityState=state;for(const notify of listeners)notify();};
  function delayNext() {
    let finish!:(r:Response)=>void;
    reply=()=>new Promise(resolve=>{finish=resolve;});
    return ()=>finish(Response.json(journal()));
  }
  try {
    render();await flush();
    assert.equal(requests.length,1);
    assert.match(markup(),/Streaming/);
    assert.doesNotMatch(markup(),/class="text-emerald-400"/);
    render().props.onClick({target:null});
    assert.match(markup(),/class="text-emerald-400">INF/);
    assert.match(markup(),/class="text-cyan-300">height=/);
    assert.equal(storage.get("wolo-daemon-view"),"premium");
    render().props.onClick({target:null});
    assert.doesNotMatch(markup(),/class="text-emerald-400"/);
    assert.equal(storage.get("wolo-daemon-view"),"prod");

    for(let i=0;i<24;i++)await tick(1000);
    assert.equal(requests.length,9,"initial GET and eight lower polls in 24 seconds");
    assert.equal(rpcReads,8,"both upper readers retain their eight-second cadence");
    const late=delayNext();
    await tick(3000);await tick(3000);
    assert.equal(requests.length,10,"no overlapping lower GET");
    await tick(2000);
    assert.equal(requests.at(-1)?.aborted,true);
    assert.doesNotMatch(markup(),/Streaming/);
    reply=async()=>Response.json({ok:false,label:"Protected daemon journal",lines:["Operator access required"]});
    await tick(1000);late();await flush();
    assert.match(markup(),/Operator access required/);

    const hidden=delayNext();
    await tick(3000);visibility("hidden");
    assert.equal(requests.at(-1)?.aborted,true);
    const before=requests.length;
    await tick(9000);
    assert.equal(requests.length,before);
    reply=async()=>Response.json(journal(14_999));
    visibility("visible");await flush();
    assert.equal(requests.length,before+1);
    assert.match(markup(),/Streaming/);
    await tick(2);hidden();await flush();
    assert.doesNotMatch(markup(),/Streaming/,"sample expires even between polls");
    for(const invalid of [{...journal(),lines:[{}]},journal(20_000),{...journal(),ok:"yes"}]){
      reply=async()=>Response.json(invalid);await tick(3000);
      assert.doesNotMatch(markup(),/Streaming/);
    }
    reply=async()=>Response.json(journal(),{status:503});await tick(3000);
    assert.doesNotMatch(markup(),/Streaming/);
  } finally {
    for(const dispose of cleanup)dispose();
  }
  const before=requests.length;
  visibility("visible");await tick(9000);
  assert.equal(requests.length,before,"unmount removes intervals and visibility listeners");
});
