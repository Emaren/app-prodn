"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowLeft, ArrowUpRight, ChevronRight, CircleHelp, Eye,
  GitBranch, Layers3, LockKeyhole, Network, Radio, Search, Shield,
  SlidersHorizontal, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { readFactoryPublicStatus } from "@/lib/factoryPublicStatus";
import type { TreeGraph, TreeNode, LightState } from "@/lib/umbrellaTreeModel";
import css from "./UmbrellaTree.module.css";

type Overlay = "source" | "runtime" | "release" | "communication" | "tests";
type FactoryLight = {
  state: "OBSERVED" | "UNKNOWN";
  observedAt: string | null;
  source: string | null;
  build: string | null;
  testState: "OBSERVED" | "UNKNOWN";
};
const UNOBSERVED: FactoryLight = {
  state: "UNKNOWN", observedAt: null, source: null, build: null, testState: "UNKNOWN",
};
const OVERLAYS: ReadonlyArray<{ id: Overlay; label: string; description: string }> = [
  { id: "source", label: "Source lineage", description: "Dated registry declarations; not live execution" },
  { id: "runtime", label: "Runtime pulse", description: "Only fresh externally observed runtime evidence" },
  { id: "release", label: "Release evidence", description: "Public Factory source receipt; not a signing permit" },
  { id: "communication", label: "Comms edges", description: "Architectural links only, no live traffic inferred" },
  { id: "tests", label: "Test lights", description: "Link to the original Factory Light Board" },
];
const LEGEND: ReadonlyArray<{ status: LightState; label: string }> = [
  { status: "VERIFIED", label: "Verified" },
  { status: "OBSERVED", label: "Source/public observation" },
  { status: "HOLD", label: "Hold" },
  { status: "FAULT", label: "Proven fault" },
  { status: "CANDIDATE", label: "Planned" },
  { status: "UNKNOWN", label: "Unknown / unobserved" },
];

/** One read, once on mount. No poller, server egress, cron or new publisher. */
async function readBoundedFactory(signal: AbortSignal): Promise<FactoryLight> {
  try {
    const response = await fetch("/factory/status.json", {
      method: "GET", cache: "no-store", credentials: "same-origin", signal,
    });
    if (!response.ok || !response.body) return UNOBSERVED;
    const length = response.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > 131072)) return UNOBSERVED;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 131072) { await reader.cancel(); return UNOBSERVED; }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let index = 0;
    for (const chunk of chunks) { bytes.set(chunk, index); index += chunk.length; }
    const source: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const parsed = readFactoryPublicStatus(source);
    if (parsed.authority !== "fresh") return UNOBSERVED;
    const live = parsed.value.liveRelease;
    const sourceOk = live.status === "pass"
      && typeof live.id === "string" && /^[a-f0-9]{40}$/.test(live.id)
      && typeof live.buildId === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(live.buildId);
    return {
      state: sourceOk ? "OBSERVED" : "UNKNOWN",
      observedAt: parsed.value.generatedAt,
      source: sourceOk ? live.id : null,
      build: sourceOk ? live.buildId! : null,
      testState: parsed.value.testGroups.some(group => group.state === "pass")
        ? "OBSERVED" : "UNKNOWN",
    };
  } catch { return UNOBSERVED; }
}
function nodeLight(node: TreeNode, overlay: Overlay, factory: FactoryLight): LightState {
  if (overlay === "source") {
    if (node.catalogState === "SOURCE_PRESENT") return "OBSERVED";
    if (node.catalogState === "PLANNED") return "CANDIDATE";
    return "UNKNOWN";
  }
  if (node.id === "aoe2war.os.release" && factory.state === "OBSERVED") {
    return overlay === "release" || overlay === "runtime" ? "OBSERVED"
      : overlay === "tests" && factory.testState === "OBSERVED" ? "OBSERVED" : "UNKNOWN";
  }
  return "UNKNOWN";
}
const lightLabel: Record<LightState, string> = {
  VERIFIED: "VERIFIED", OBSERVED: "OBSERVED", HOLD: "HOLD",
  FAULT: "FAULT", CANDIDATE: "PLANNED", UNKNOWN: "UNKNOWN",
};
const compact = (value: string) => value.length > 55 ? value.slice(0, 52) + "…" : value;

export default function UmbrellaTreeClient({ graph }: { graph: TreeGraph }) {
  const [overlay, setOverlay] = useState<Overlay>("source");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [factory, setFactory] = useState<FactoryLight>(UNOBSERVED);
  const [limit, setLimit] = useState(42);
  const [weLimit, setWeLimit] = useState(12);
  const [zoom, setZoom] = useState(100);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void readBoundedFactory(controller.signal).then(result => {
      if (!controller.signal.aborted) setFactory(result);
    });
    return () => controller.abort();
  }, []);
  const close = useCallback(() => {
    setSelected(null);
    requestAnimationFrame(() => lastTrigger.current?.focus());
  }, []);
  useEffect(() => {
    if (!selected) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex="0"]',
      ));
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, close]);
  const choose = (node: TreeNode, trigger: HTMLButtonElement) => {
    lastTrigger.current = trigger;
    setSelected(node);
  };
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph]);
  const root = byId.get("aoe2war.os.umbrella");
  const os = graph.nodes.filter(node => node.kind === "os");
  const roles = graph.nodes.filter(node => node.kind === "role");
  const workspaces = graph.nodes.filter(node => node.kind === "workspace");
  const sessionNodes = graph.nodes.filter(node => node.kind === "session");
  const filter = query.trim().toLocaleLowerCase();
  const matched = (node: TreeNode) => !filter ||
    (node.name + " " + node.id + " " + node.purpose + " " + node.authority).toLocaleLowerCase().includes(filter);
  const visibleOs = os.filter(matched).slice(0, limit);
  const remaining = os.filter(matched).length - visibleOs.length;
  const visibleRoles = roles.filter(matched);
  const matchingWe = workspaces.filter(node => matched(node) ||
    sessionNodes.some(session => session.parentId === node.id && matched(session)));
  const visibleWe = matchingWe.slice(0, weLimit);
  const remainingWe = matchingWe.length - visibleWe.length;
  const statusDescription = selected
    ? nodeLight(selected, overlay, factory) === "OBSERVED"
      ? overlay === "source" ? "Registry source identity only — not runtime proof."
        : "Fresh public Factory readback; not a signed permit."
      : selected.catalogState === "PLANNED" && overlay === "source"
        ? "Planned/draft catalog identity, not an installed worker."
        : "No admissible fresh runtime evidence; activity remains UNKNOWN."
    : "";

  if (graph.errors.length) return (
    <main className={css.error} role="alert">
      <LockKeyhole aria-hidden="true" />
      <h1>Umbrella Tree unavailable</h1>
      <p>Invalid or untrusted source registry. No hierarchy or green status is fabricated.</p>
      <code>{graph.errors.join(" · ")}</code>
      <Link href="/admin/aoe2war-os">Return to the existing Navigation Atlas</Link>
    </main>
  );
  return (
    <main className={css.shell}>
      <div className={css.ambient} aria-hidden="true" />
      <div className={css.container}>
        <nav className={css.breadcrumb} aria-label="Breadcrumb">
          <Link href="/admin/aoe2war-os"><ArrowLeft size={15} aria-hidden="true" /> Navigation Atlas</Link>
          <span aria-hidden="true">/</span>
          <span>THE UMBRELLA TREE</span>
          <span className={css.private}><LockKeyhole size={12} aria-hidden="true" /> PRIVATE / SOURCE MODEL</span>
        </nav>

        <header className={css.hero}>
          <div className={css.heroCopy}>
            <div className={css.eyebrow}><span className={css.eyebrowLine} /> AO E 2 WAR · THE LIVING ARCHITECTURE</div>
            <h1>THE <em>UMBRELLA</em> TREE<span className={css.period}>.</span></h1>
            <p>A kingdom of operating systems. One root. Many independent workspaces and sessions. Every light accountable to its source.</p>
            <div className={css.heroFacts}>
              <span><strong>{os.length}</strong> Source OS identities</span>
              <span><strong>{workspaces.length}</strong> Illustrated WE slots</span>
              <span><strong>{roles.length}</strong> Non-OS roles</span>
            </div>
          </div>
          <div className={css.heroOrbit} aria-label="Decorative orbit, not live agent activity">
            <div className={css.orbitOne} aria-hidden="true" />
            <div className={css.orbitTwo} aria-hidden="true" />
            <div className={css.orbitThree} aria-hidden="true" />
            <div className={css.orbitCore}><span>AOE</span><strong>2</strong><span>WAR</span></div>
            <div className={css.orbitLegend}>ARCHITECTURAL ORBIT · DECORATIVE</div>
          </div>
        </header>

        <section className={css.command} aria-label="Tree controls">
          <div className={css.commandTop}>
            <div><span className={css.miniKicker}>SPECTRAL LENS</span><h2>See the kingdom in layers</h2></div>
            <div className={css.zoom}>
              <button type="button" onClick={() => setZoom(Math.max(85, zoom - 10))} aria-label="Zoom out" disabled={zoom <= 85}><ZoomOut size={16}/></button>
              <span aria-label={"Tree zoom " + zoom + " percent"}>{zoom}%</span>
              <button type="button" onClick={() => setZoom(Math.min(115, zoom + 10))} aria-label="Zoom in" disabled={zoom >= 115}><ZoomIn size={16}/></button>
            </div>
          </div>
          <div className={css.controls}>
            <div role="group" aria-label="Evidence overlay" className={css.modeRail}>
              {OVERLAYS.map(item => (
                <button type="button" key={item.id} aria-pressed={overlay === item.id}
                  title={item.description} className={overlay === item.id ? css.modeActive : css.mode}
                  onClick={() => setOverlay(item.id)}>
                  {item.id === "source" ? <GitBranch size={15} aria-hidden="true"/> :
                   item.id === "runtime" ? <Radio size={15} aria-hidden="true"/> :
                   item.id === "release" ? <Shield size={15} aria-hidden="true"/> :
                   item.id === "communication" ? <Network size={15} aria-hidden="true"/> :
                   <Activity size={15} aria-hidden="true"/>}
                  {item.label}
                </button>
              ))}
            </div>
            <label className={css.search}>
              <Search size={17} aria-hidden="true"/>
              <span className={css.srOnly}>Filter architecture nodes</span>
              <input aria-label="Filter architecture nodes" value={query}
                placeholder="Find a module, WE or role…" onChange={event => { setQuery(event.target.value); setLimit(42); setWeLimit(12); }} />
              {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><X size={14}/></button>}
            </label>
          </div>
          <p className={css.overlayHint}><Eye size={14} aria-hidden="true"/> {OVERLAYS.find(item => item.id === overlay)?.description}. No continuous agent or host sensor is installed by this page.</p>
        </section>

        <div className={css.treeRegion} style={{ zoom: zoom / 100 }}>
          <section className={css.rootSection} aria-label="Root architecture">
            {root && <button type="button" className={css.rootNode} onClick={event => choose(root, event.currentTarget)}>
              <span className={css.rootLogo}><Layers3 size={28} aria-hidden="true"/></span>
              <span className={css.rootText}><small>ROOT ARCHITECTURE</small><strong>{root.name}</strong><span>source hierarchy • no automatic authority inheritance</span></span>
              <ChevronRight size={19} aria-hidden="true"/>
            </button>}
            <div className={css.stem} aria-hidden="true"/>
          </section>

          <section className={css.branchSection} aria-labelledby="os-title">
            <div className={css.sectionHeading}><span>01 / SYSTEM CONSTELLATION</span><h2 id="os-title">Subordinate OS domains</h2><p>Identity is not execution. Registry-declared source and plans, never a worker census.</p></div>
            <div className={css.osGrid}>
              {visibleOs.map((node, i) => {
                const state = nodeLight(node, overlay, factory);
                return <button type="button" key={node.id} className={css.osCard}
                  data-signal={state} onClick={event => choose(node, event.currentTarget)}
                  aria-label={node.name + ". " + lightLabel[state] + ". Open details."}>
                  <span className={css.osGlyph} aria-hidden="true">{i < 9 ? "0" + (i + 1) : String(i + 1)}</span>
                  <span className={css.osCopy}><strong>{node.name}</strong><small>{compact(node.purpose)}</small></span>
                  <span className={css.osSignal}><i aria-hidden="true"/><span>{state === "OBSERVED" && overlay === "source" ? "CATALOG" : lightLabel[state]}</span></span>
                </button>;
              })}
            </div>
            {remaining > 0 && <button type="button" className={css.more} onClick={() => setLimit(Math.min(limit + 48, 250))}>
              Show {Math.min(remaining, 48)} more registry nodes ({remaining} hidden)
            </button>}
            {!visibleOs.length && <p className={css.empty}>No OS identities match this filter.</p>}
          </section>

          <section className={css.workspaceSection} aria-labelledby="we-title">
            <div className={css.sectionHeading}><span>02 / WORK ENVIRONMENT OS</span><h2 id="we-title">Environments within environments</h2>
              <p>Session letters repeat under each WE. The cards below are <strong>illustrative hierarchy slots</strong>, not discovered workers.</p></div>
            <div className={css.weGrid}>
              {visibleWe.map((we, index) => (
                <article key={we.id} className={css.weCard}>
                  <div className={css.weHead}>
                    <button type="button" className={css.weName} onClick={event => choose(we, event.currentTarget)}>
                      <span className={css.weNumber}>0{index + 1}</span>
                      <span><small>CHILD WORK ENVIRONMENT</small><strong>{we.name}</strong></span>
                      <ChevronRight size={18} aria-hidden="true"/>
                    </button>
                    <span className={css.unknownTag}>◇ UNKNOWN</span>
                  </div>
                  <div className={css.sessionRail} aria-label={we.name + " illustrative session slots"}>
                    {sessionNodes.filter(s => s.parentId === we.id && (!filter || matched(s) || matched(we))).slice(0, 24).map(session => (
                      <button type="button" key={session.id} className={css.session} onClick={event => choose(session, event.currentTarget)}>
                        <span className={css.sessionGlyph}><CircleHelp size={17} aria-hidden="true"/></span>
                        <span><strong>{session.name}</strong><small>MODEL / NOT OBSERVED</small></span>
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            {remainingWe > 0 && <button type="button" className={css.more} onClick={() => setWeLimit(Math.min(weLimit + 12, 200))}>
              Show {Math.min(remainingWe, 12)} more work environments ({remainingWe} hidden)
            </button>}
            {!visibleWe.length && <p className={css.empty}>No workspaces match this filter.</p>}
          </section>

          <section className={css.bottomGrid}>
            <div className={css.rolePanel}>
              <div className={css.sectionHeading}><span>03 / NON-OS SUPERVISION</span><h2>Named roles, not new engines</h2></div>
              <div className={css.roleGrid}>
                {visibleRoles.map(role => <button type="button" key={role.id}
                  onClick={event => choose(role, event.currentTarget)} className={css.role}>
                  <span className={css.roleIcon}><SlidersHorizontal size={18} aria-hidden="true"/></span>
                  <span><strong>{role.name}</strong><small>ROLE ≠ OS ≠ SESSION</small></span>
                  <ChevronRight size={16} aria-hidden="true"/>
                </button>)}
              </div>
              {!visibleRoles.length && <p className={css.empty}>No supervisory roles match.</p>}
            </div>
            <div className={css.channelsPanel}>
              <div className={css.sectionHeading}><span>04 / CROSS-LINKS</span><h2>Communication is not command</h2></div>
              <p>Architecture-only relationships. These lines do not assert traffic, permission inheritance or an active AI.</p>
              <div className={css.channels}>
                {graph.edges.filter(edge => edge.kind === "architectural-handoff").map(edge =>
                  <div key={edge.id} className={css.channel}>
                    <span>{byId.get(edge.from)?.name || "UNKNOWN"}</span>
                    <span className={css.channelLine} aria-label="Architectural handoff only"><Network size={14} aria-hidden="true"/></span>
                    <span>{byId.get(edge.to)?.name || "UNKNOWN"}</span>
                  </div>)}
              </div>
            </div>
          </section>
        </div>

        <section className={css.integrations} aria-label="Authoritative linked systems">
          <div className={css.integrationsHead}><span className={css.miniKicker}>THE KINGDOM&apos;S INSTRUMENTS</span><h2>Follow the actual evidence</h2></div>
          <div className={css.integrationsGrid}>
            <Link href="/factory" className={css.integrationCard}>
              <span className={css.integrationIcon}><Activity size={25} aria-hidden="true"/></span>
              <span><strong>THE LIGHT BOARD</strong><small>Original Factory test matrix · source-bound production evidence</small></span>
              <ArrowUpRight size={18} aria-hidden="true"/>
            </Link>
            <Link href="/admin/central-command/lanes#work-environments" className={css.integrationCard}>
              <span className={css.integrationIcon}><GitBranch size={25} aria-hidden="true"/></span>
              <span><strong>WORKSPACE OBSERVATORY</strong><small>Registered source benches, PRs, evidence and release boundary</small></span>
              <ArrowUpRight size={18} aria-hidden="true"/>
            </Link>
            <a href="https://github.com/Emaren/app-prodn/issues/1371" target="_blank" rel="noopener noreferrer" className={css.integrationCard}>
              <span className={css.integrationIcon}><Network size={25} aria-hidden="true"/></span>
              <span><strong>NEURAL ATLAS CONTRACT</strong><small>Detailed fleet parity and drift · separate owned feature</small></span>
              <ArrowUpRight size={18} aria-hidden="true"/>
            </a>
          </div>
        </section>

        <footer className={css.footer}>
          <div className={css.legend} aria-label="Status legend">
            {LEGEND.map(item => <span key={item.status} data-signal={item.status}><i aria-hidden="true"/>{item.label}</span>)}
          </div>
          <p>REGISTRY {graph.sourceSchema} · SNAPSHOT {graph.snapshotDate || "UNKNOWN"} · PHYSICAL ESTATE UNKNOWN WITHOUT FRESH EVIDENCE</p>
          <p>Motion in this room is ambient art, not telemetry. No session, signer, timer or financial authority is created by this view.</p>
        </footer>
      </div>

      {selected && <>
        <button type="button" className={css.scrim} onClick={close} aria-label="Close node details"/>
        <aside ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="umbrella-node-title" className={css.drawer}>
          <div className={css.drawerTop}><span className={css.miniKicker}>SOURCE-BOUND DRILLDOWN</span><button ref={closeRef} type="button" onClick={close} aria-label="Close details"><X size={22}/></button></div>
          <div className={css.drawerHero} data-signal={nodeLight(selected, overlay, factory)}>
            <span className={css.drawerSymbol}><Layers3 size={34} aria-hidden="true"/></span>
            <div><small>{selected.kind.toUpperCase()} · {selected.catalogState.replaceAll("_", " ")}</small><h2 id="umbrella-node-title">{selected.name}</h2></div>
          </div>
          <div className={css.drawerSignal}><span data-signal={nodeLight(selected, overlay, factory)}><i aria-hidden="true"/>{lightLabel[nodeLight(selected, overlay, factory)]}</span><small>{statusDescription}</small></div>
          <dl className={css.detailList}>
            <div><dt>Canonical identity</dt><dd><code>{selected.id}</code></dd></div>
            <div><dt>Parent identity</dt><dd>{selected.parentId || "ROOT"}</dd></div>
            <div><dt>Authority domain</dt><dd>{selected.authority}</dd></div>
            <div><dt>Purpose / contract</dt><dd>{selected.purpose}</dd></div>
            <div><dt>Catalog source status</dt><dd>{selected.sourceStatus}</dd></div>
            <div><dt>Live process or agent heartbeat</dt><dd>UNKNOWN — never inferred from this registry</dd></div>
            <div><dt>Last confirmed session action</dt><dd>UNKNOWN — no authorized session receipt</dd></div>
            <div><dt>Last real service execution</dt><dd>UNKNOWN — no signed native event in this model</dd></div>
            <div><dt>Active blockers / maintenance window</dt><dd>UNKNOWN — consult owning source</dd></div>
            {selected.id === "aoe2war.os.release" &&
              <div><dt>Fresh public Factory observation</dt><dd>
                {factory.state === "OBSERVED" ? factory.observedAt : "UNKNOWN"}
                {factory.source ? <code className={css.sha}>SOURCE {factory.source} · BUILD {factory.build}</code> : null}
                <span className={css.notice}>This is public readback, not independently validated root signing or next-release approval.</span>
              </dd></div>}
          </dl>
          {selected.isIllustrative && <p className={css.drawerWarning}>Illustrative hierarchy slot only. Its existence here does not imply a real open ChatGPT session, agent process or assigned privilege.</p>}
          <div className={css.drawerLinks}>
            {selected.sourceRef && (selected.sourceRef.startsWith("/") ?
              <Link href={selected.sourceRef}>Open source-owned view <ArrowUpRight size={15}/></Link> :
              <a href={selected.sourceRef} target="_blank" rel="noopener noreferrer">Open source reference <ArrowUpRight size={15}/></a>)}
            <a href="https://github.com/Emaren/app-prodn/issues/1372" target="_blank" rel="noopener noreferrer">
              Umbrella Tree contract <ArrowUpRight size={15}/>
            </a>
          </div>
        </aside>
      </>}
    </main>
  );
}
