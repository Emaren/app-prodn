"use client";
import { useEffect, useRef, useState } from "react";
import { Blocks, ChevronDown, ExternalLink, Radio, ShieldCheck } from "lucide-react";
import { parseWoloPublicBlock, type PublicWoloBlock } from "@/lib/woloBrowserBlocks";
type BlockWithHashes = PublicWoloBlock & { txHashes: string[] };
async function hashTransaction(base64: string): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("").toUpperCase();
}
const prettyTime = (raw: string) => {
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "UNKNOWN";
};
export default function WoloBlockRail({ latestHeight }: { latestHeight: string | null }) {
  const [blocks, setBlocks] = useState<BlockWithHashes[]>([]);
  const [state, setState] = useState<"loading" | "partial" | "fresh" | "unavailable">("loading");
  const lastFetch = useRef(0);
  useEffect(() => {
    if (!latestHeight || !/^[1-9][0-9]{0,15}$/.test(latestHeight)) { setBlocks([]); setState("unavailable"); return; }
    if (Date.now() - lastFetch.current < 22_000) return;
    lastFetch.current = Date.now();
    let done = false;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 7000);
    async function load() {
      if (document.hidden) return;
      setState("loading");
      const height = BigInt(latestHeight as string);
      const selected = Array.from({ length: 6 }, (_, i) => height - BigInt(i))
        .filter(value => value > BigInt(0)).map(value => value.toString());
      const results = await Promise.allSettled(selected.map(async value => {
        const response = await fetch("/rpc/block?height=" + value, {
          signal: abort.signal, cache: "no-store", credentials: "omit",
          headers: { Accept: "application/json" },
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("json")) throw new Error("RPC unavailable");
        const body = await response.text();
        if (body.length > 750_000) throw new Error("Oversized block");
        const block = parseWoloPublicBlock(JSON.parse(body), value, Date.now());
        const txHashes = await Promise.all(block.transactionBase64.map(async item => {
          try { return await hashTransaction(item); } catch { return "HASH UNAVAILABLE"; }
        }));
        return { ...block, txHashes };
      }));
      if (done) return;
      const valid = results.filter((r): r is PromiseFulfilledResult<BlockWithHashes> => r.status === "fulfilled")
        .map(r => r.value).sort((a, b) => Number(BigInt(b.height) - BigInt(a.height)));
      setBlocks(valid);
      setState(valid.length === 0 ? "unavailable" : valid.length < selected.length ? "partial" : "fresh");
    }
    void load().finally(() => window.clearTimeout(timeout));
    return () => { done = true; abort.abort(); window.clearTimeout(timeout); };
  }, [latestHeight]);
  return <section aria-label="WoloChain recent blocks and transactions" className="overflow-hidden rounded-[1.8rem] border border-cyan-300/15 bg-[#060e1c] p-5 shadow-[0_20px_65px_rgba(0,0,0,.25)] sm:p-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.24em] text-cyan-300"><Blocks size={16} /> WOLOCHAIN / PUBLIC LEDGER</p>
        <h2 className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl">Latest blocks & transactions</h2>
        <p className="mt-1 text-xs text-slate-400">Read-only records direct from wolo-1 · no settlement or wallet commands</p>
      </div>
      <span data-block-rail-state={state} className={state === "fresh" ? "rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-[11px] font-bold text-emerald-200"
        : "rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[11px] font-bold text-amber-200"}>
        <Radio size={13} className="mr-2 inline" /> {state.toUpperCase()}
      </span>
    </div>
    {blocks.length ? <div className="mt-5 grid gap-3 lg:grid-cols-2">
      {blocks.map((block, index) => <details key={block.height} className="group min-w-0 rounded-2xl border border-white/10 bg-gradient-to-br from-[#102139] to-[#091324] p-4 open:border-cyan-300/30 sm:p-5">
        <summary className="cursor-pointer list-none">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[10px] font-extrabold uppercase tracking-[.2em] text-cyan-300">{index === 0 ? "LATEST VERIFIED BLOCK" : "BLOCK " + String(index + 1).padStart(2, "0")}</span>
            <ChevronDown size={16} className="text-slate-400 transition-transform group-open:rotate-180" />
          </div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <strong className="font-mono text-2xl font-black tracking-tight text-white">#{block.height}</strong>
            <span className="text-xs font-semibold text-slate-400">{prettyTime(block.time)}</span>
          </div>
          <p className="mt-3 break-all font-mono text-xs text-slate-400">{block.hash.slice(0, 24)}…</p>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
            <span className="flex items-center gap-2 font-bold text-emerald-200"><ShieldCheck size={14} /> WOLO-1</span>
            <span className="font-semibold text-sky-200">{block.transactionCount} {block.transactionCount === 1 ? "TRANSACTION" : "TRANSACTIONS"}</span>
          </div>
        </summary>
        <div className="mt-4 space-y-2 border-t border-cyan-300/15 pt-4 text-xs">
          <div className="text-slate-400">Block hash</div>
          <div className="break-all font-mono text-slate-200">{block.hash}</div>
          <div className="pt-2 text-slate-400">Recent transaction hashes</div>
          {block.transactionCount === 0 ? <p className="font-medium text-slate-300">No transactions in this block.</p>
            : block.txHashes.length ? block.txHashes.map((hash, i) => <p key={i} className="break-all rounded-lg bg-black/20 p-2 font-mono text-emerald-200">{hash}</p>)
              : <p className="text-amber-200">Transaction hashes unavailable; count verified.</p>}
          {block.transactionCount > block.txHashes.length && <p className="text-slate-400">Showing only the first {block.txHashes.length} transaction hashes to bound browser work.</p>}
        </div>
      </details>)}
    </div> : <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[.025] px-5 py-8 text-center text-sm text-slate-400">
      {state === "loading" ? "Reading latest public blocks…" : "Block history unavailable or unverified. No fabricated blocks."}
    </div>}
    <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-4 text-[11px] text-slate-400">
      <span>Most recent six blocks · refreshed from public RPC as heights advance</span>
      <a href="https://wolochain.valopers.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-bold text-cyan-200 hover:underline">OPEN EXPLORER <ExternalLink size={13} /></a>
    </div>
  </section>;
}
