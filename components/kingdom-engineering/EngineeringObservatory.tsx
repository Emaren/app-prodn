"use client";

/**
 * Pure visualization of the already-committed source snapshot.
 * No fetch, socket, interval, observer daemon or root/financial action.
 */
import { useMemo, useState } from "react";
import { ArrowUpRight, Activity, BrainCircuit, CircleDot, GitBranch, Layers3, ListTree, Network, ShieldAlert, Workflow } from "lucide-react";
import type { EngineeringProjection } from "@/lib/kingdomEngineeringProjection";
import styles from "./EngineeringObservatory.module.css";

type View = "graph" | "loops" | "formations" | "hierarchy" | "composer" | "runup";
type Formation = "swarm" | "army";
const VIEWS: { id: View; name: string; icon: typeof Network }[] = [
  { id: "graph", name: "NEURAL GRAPH", icon: Network },
  { id: "loops", name: "LOOPS", icon: Activity },
  { id: "formations", name: "SWARMS / ARMIES", icon: Layers3 },
  { id: "hierarchy", name: "HIERARCHY", icon: ListTree },
  { id: "composer", name: "COMPOSER", icon: BrainCircuit },
  { id: "runup", name: "KINGDOM RUN-UP", icon: Workflow },
];
const STEPS = ["OBSERVE", "PLAN", "ACT", "VERIFY", "PERSIST"];
const compact = (value: string) => value.replace(/-/g, " ").toUpperCase();
const points = (count: number, rx: number, ry: number, cx = 560, cy = 259) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });

function SignalFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className={styles.visualFrame} aria-label={label}>
    <div className={styles.crosshair} aria-hidden="true" />
    {children}
  </div>;
}
function SvgBase({ children, name }: { children: React.ReactNode; name: string }) {
  return <svg viewBox="0 0 1120 520" role="img" aria-label={name} className={styles.diagram} preserveAspectRatio="xMidYMid meet">
    <defs>
      <radialGradient id="kingdom-field" cx="50%" cy="50%" r="58%">
        <stop offset="0" stopColor="#11313d" stopOpacity=".78" />
        <stop offset="1" stopColor="#08131e" stopOpacity=".05" />
      </radialGradient>
      <linearGradient id="kingdom-track" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#79d7e9" stopOpacity=".48" />
        <stop offset="1" stopColor="#cbb98e" stopOpacity=".16" />
      </linearGradient>
    </defs>
    <rect width="1120" height="520" fill="url(#kingdom-field)" />
    {children}
  </svg>;
}
function GraphMode({ data, chosen, choose }: { data: EngineeringProjection; chosen: string; choose: (id: string) => void }) {
  const nodes = useMemo(() => points(data.os.length, 400, 195), [data.os.length]);
  return <SignalFrame label="Source-backed OS constellation, no confirmed live workers">
    <SvgBase name="Fourteen registered subordinate OS identities connected to the AoE2WAR umbrella; runtime worker status unknown">
      {nodes.map((p, i) => <line key={"edge" + i} x1={560} y1={259} x2={p.x} y2={p.y} className={styles.edge} />)}
      <circle cx="560" cy="259" r="64" className={styles.coreHalo} />
      <circle cx="560" cy="259" r="49" className={styles.core} />
      <text x="560" y="254" textAnchor="middle" className={styles.coreLabel}>AOE2WAR</text>
      <text x="560" y="272" textAnchor="middle" className={styles.tiny}>UMBRELLA / SOURCE</text>
      {data.os.map((os, i) => {
        const p = nodes[i];
        const active = os.id === chosen;
        return <g key={os.id} role="button" tabIndex={0}
          aria-label={os.name + ", source identity, worker unknown"}
          onClick={() => choose(os.id)}
          onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(os.id); }
          }}
          className={styles.selectNode}>
          <circle cx={p.x} cy={p.y} r={active ? 30 : 25} className={active ? styles.selectedNode : styles.node} />
          <circle cx={p.x} cy={p.y} r="5" className={styles.unknownDot} />
          <text x={p.x} y={p.y + 43} textAnchor="middle" className={styles.nodeText}>{os.name.replace(" OS", "")}</text>
        </g>;
      })}
    </SvgBase>
    <div className={styles.figureTag}>14 OS IDS · 0 CERTIFIED WORKER COUNTS · STATUS UNKNOWN</div>
  </SignalFrame>;
}
function LoopsMode() {
  const p = points(STEPS.length, 305, 178);
  return <SignalFrame label="Five-stage bounded engineering feedback cycle">
    <SvgBase name="Source-defined observe plan act verify persist cycle, none proven currently running">
      <ellipse cx="560" cy="259" rx="305" ry="178" className={styles.orbit} />
      <ellipse cx="560" cy="259" rx="220" ry="120" className={styles.softOrbit} />
      {p.map((v, i) => <g key={STEPS[i]}>
        <circle cx={v.x} cy={v.y} r="51" className={styles.loopNode} />
        <text x={v.x} y={v.y - 4} textAnchor="middle" className={styles.largeTag}>{STEPS[i]}</text>
        <text x={v.x} y={v.y + 16} textAnchor="middle" className={styles.tiny}>NO RECEIPT</text>
      </g>)}
      <text x="560" y="253" textAnchor="middle" className={styles.centralHeadline}>FEEDBACK ENGINE</text>
      <text x="560" y="279" textAnchor="middle" className={styles.tiny}>TRIGGER / BUDGET / STOP / PROOF</text>
      <text x="560" y="324" textAnchor="middle" className={styles.stateText}>RUNNING LOOPS UNKNOWN</text>
    </SvgBase>
    <div className={styles.figureTag}>REQUIRES ITERATION ID · BOUNDED RETRY · BACKOFF · VERIFY RECEIPT</div>
  </SignalFrame>;
}
function FormationsMode({ data, layout, setLayout, selected, choose }: {
  data: EngineeringProjection; layout: Formation; setLayout: (v: Formation) => void;
  selected: string; choose: (id: string) => void;
}) {
  const order = ["B", "C", "D", "E", "F", "G"];
  return <SignalFrame label="Assigned sessions as a formation, not a claim of executing processes">
    <div className={styles.innerToggle} role="group" aria-label="Formation visualization">
      <button type="button" aria-pressed={layout === "swarm"} onClick={() => setLayout("swarm")}>SWARM FIELD</button>
      <button type="button" aria-pressed={layout === "army"} onClick={() => setLayout("army")}>ENGINEERING ARMY</button>
    </div>
    <SvgBase name={layout === "swarm" ? "Six owner-relayed assignments in unverified swarm topology" : "Six assigned engineering lanes as command formations, all active status unknown"}>
      {order.map((lane, i) => {
        const x = layout === "swarm" ? 260 + (i % 3) * 295 : 320 + (i % 2) * 480;
        const y = layout === "swarm" ? 180 + Math.floor(i / 3) * 192 : 116 + Math.floor(i / 2) * 138;
        const chosen = selected === lane;
        return <g key={lane} role="button" tabIndex={0} className={styles.selectNode}
          aria-label={"Lane " + lane + ", assigned, active worker unverified"}
          onClick={() => choose(lane)}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(lane); } }}>
          {layout === "swarm" ?
            <path d={"M " + x + " " + (y - 67) + " l 64 34 v 70 l -64 34 l -64 -34 v -70 Z"}
              className={chosen ? styles.selectedShape : styles.formationShape} /> :
            <rect x={x - 180} y={y - 47} width="360" height="98" rx="12"
              className={chosen ? styles.selectedShape : styles.formationShape} />}
          <text x={x} y={y - 2} textAnchor="middle" className={styles.formationLetter}>{lane}</text>
          <text x={x} y={y + 22} textAnchor="middle" className={styles.tiny}>ASSIGNED / UNKNOWN</text>
        </g>;
      })}
    </SvgBase>
    <div className={styles.figureTag}>6 OWNER-RELAYED ASSIGNMENTS · NO ATTESTED AGENT HEARTBEATS · 1,000 IS A GOAL</div>
  </SignalFrame>;
}
function HierarchyMode({ data }: { data: EngineeringProjection }) {
  const levels = [
    { title: "HUMAN OWNER", second: "APPROVAL / CUSTODY", x: 560, y: 55 },
    { title: "CENTRAL COMMAND", second: "PRIORITY & REVIEW", x: 560, y: 169 },
    { title: "ORCHESTRA", second: "PLANNING / PROPOSED", x: 315, y: 307 },
    { title: "RELEASE / DEPLOYMENT", second: "APPROVAL & EXECUTION", x: 805, y: 307 },
    { title: "COMPOSER", second: "DRAFT PLAN / PROPOSED", x: 315, y: 443 },
    { title: "DOCTOR / SHEPHERD", second: "SUPERVISORY ROLES", x: 805, y: 443 },
  ];
  return <SignalFrame label="Canonical hierarchical authority, role identities are not OS worker counts">
    <SvgBase name="Human authority to Central Command, complementary Orchestra Composer and Release OS, with Doctor and Shepherd in supervisory roles">
      {[[0,1],[1,2],[1,3],[2,4],[3,5]].map(([a,b],i) =>
        <line key={i} x1={levels[a].x} y1={levels[a].y+34} x2={levels[b].x} y2={levels[b].y-34} className={styles.hierarchyEdge} />)}
      {levels.map((entry,i) => <g key={entry.title}>
        <rect x={entry.x-165} y={entry.y-35} width="330" height="70" rx="9"
          className={i < 2 ? styles.authorityBox : styles.hierarchyBox} />
        <text x={entry.x} y={entry.y-5} textAnchor="middle" className={styles.largeTag}>{entry.title}</text>
        <text x={entry.x} y={entry.y+17} textAnchor="middle" className={styles.tiny}>{entry.second}</text>
      </g>)}
    </SvgBase>
    <div className={styles.figureTag}>3 SUPERVISORY ROLES · {data.os.length} SOURCE OS IDS · HUMAN RELEASE AUTHORITY</div>
  </SignalFrame>;
}
function ComposerMode({ data, lane, choose }: {
  data: EngineeringProjection; lane: string; choose: (id: string) => void;
}) {
  const positions = [
    { id: "C", x: 160, y: 150 }, { id: "B", x: 420, y: 150 },
    { id: "E", x: 680, y: 150 }, { id: "D", x: 940, y: 150 },
    { id: "F", x: 555, y: 350 }, { id: "G", x: 885, y: 350 },
  ];
  const edges = [["C","F"],["B","F"],["E","F"],["D","F"],["F","G"]];
  return <SignalFrame label="Proposed composition; cannot run, dispatch or authorize workers">
    <SvgBase name="Draft workflow composition from C, B, E and D gates to F integrator and G verification">
      {edges.map(([a,b]) => {
        const p=positions.find(x=>x.id===a)!;const q=positions.find(x=>x.id===b)!;
        return <line key={a+b} x1={p.x} y1={p.y+44} x2={q.x} y2={q.y-44} className={styles.composerEdge} />;
      })}
      {positions.map(item => <g key={item.id} role="button" tabIndex={0}
        aria-label={"Select proposed lane "+item.id} className={styles.selectNode}
        onClick={() => choose(item.id)}
        onKeyDown={e => { if(e.key==="Enter"||e.key===" "){e.preventDefault();choose(item.id);} }}>
        <rect x={item.x-95} y={item.y-44} width="190" height="88" rx="12"
          className={lane===item.id ? styles.selectedShape : styles.composerBox} />
        <text x={item.x} y={item.y-6} textAnchor="middle" className={styles.formationLetter}>{item.id}</text>
        <text x={item.x} y={item.y+17} textAnchor="middle" className={styles.tiny}>PLAN ONLY</text>
      </g>)}
      <text x="560" y="474" textAnchor="middle" className={styles.stateText}>SIMULATION · NO DISPATCH</text>
    </SvgBase>
    <div className={styles.figureTag}>CENTRAL DECIDES · COMPOSER DESIGNS · ORCHESTRA SCHEDULES · F AUTHORIZES CUTOVER</div>
  </SignalFrame>;
}
function RunUpMode({ data }: { data: EngineeringProjection }) {
  return <div className={styles.runupFrame} aria-label="Eight-stage production run-up, unverified after source extraction">
    <div className={styles.runupRail}>
      {data.phases.map((stage, i) => <div key={stage.id}
        className={styles.stage + " " + (stage.state === "OWNER_REPORTED" ? styles.reported : "")}>
        <div className={styles.stageNumber}>{String(i+1).padStart(2,"0")}</div>
        <CircleDot size={24} aria-hidden="true" />
        <strong>{compact(stage.id)}</strong>
        <small>{stage.state === "OWNER_REPORTED" ? "OWNER REPORTED" : "UNKNOWN"}</small>
      </div>)}
    </div>
    <div className={styles.failRail}><ShieldAlert size={19} /><strong>HOLD / NOT LIVE_VERIFIED</strong><span>Root stage, isolated candidate, public routing and rollback still require native evidence.</span></div>
    <div className={styles.figureTag}>SOURCE IS NOT HOST · HOST IS NOT PUBLIC · PUBLIC IS NOT FINANCE CERTIFICATION</div>
  </div>;
}

export default function EngineeringObservatory({ initial }: { initial: EngineeringProjection }) {
  const [view, setView] = useState<View>("graph");
  const [formation, setFormation] = useState<Formation>("swarm");
  const [os, setOs] = useState("orchestra");
  const [lane, setLane] = useState("F");
  const chosenOs = initial.os.find(item => item.id === os);
  const chosenLane = initial.lanes.find(item => item.id === lane);
  const adminLane = initial.admin?.assignments.find(item => item.lane === lane);
  return <main className={styles.page}>
    <div className={styles.background} aria-hidden="true" />
    <div className={styles.shell}>
      <header className={styles.masthead}>
        <div className={styles.eyebrow}><span className={styles.signal} /> KINGDOM ENGINEERING OBSERVATORY <span>R25 / SOURCE VIEW</span></div>
        <div className={styles.headingRow}>
          <div><h1>THE <em>ENGINE</em> ROOM</h1><p>SIX LENSES. ONE PROVENANCE SPINE.</p></div>
          <div className={styles.totems}>
            <div><small>OS IDENTITIES</small><strong>{initial.os.length}</strong><span>SOURCE REGISTRY</span></div>
            <div><small>ASSIGNED LANES</small><strong>{initial.lanes.length}</strong><span>NOT ACTIVE WORKERS</span></div>
            <div><small>LIVE WORKERS</small><strong>?</strong><span>UNKNOWN</span></div>
          </div>
        </div>
        <div className={styles.warning}><ShieldAlert size={16} /><span>NOT LIVE TELEMETRY. SOURCE-CUTOFF {initial.sourceCutoff.replace("T"," ").replace("Z"," UTC")}. PHYSICAL EVIDENCE UNVERIFIED.</span></div>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Engineering visual modes">
        {VIEWS.map(item => {
          const Icon=item.icon;
          return <button type="button" role="tab" key={item.id} aria-selected={view===item.id}
            className={view===item.id ? styles.activeTab : ""} onClick={() => setView(item.id)}>
            <Icon size={17} aria-hidden="true" />{item.name}
          </button>;
        })}
      </div>
      <section className={styles.stageShell} role="tabpanel" aria-label={VIEWS.find(v=>v.id===view)?.name}>
        <div className={styles.stageHeader}>
          <span><GitBranch size={15} /> {view==="formations" ? (formation==="swarm" ? "SWARM TOPOLOGY" : "ARMY FORMATION") : VIEWS.find(v=>v.id===view)?.name}</span>
          <span>READ-ONLY <span className={styles.slash}>/</span> EVIDENCE BOUND</span>
        </div>
        {view==="graph" && <GraphMode data={initial} chosen={os} choose={setOs}/>}
        {view==="loops" && <LoopsMode/>}
        {view==="formations" && <FormationsMode data={initial} layout={formation} setLayout={setFormation} selected={lane} choose={setLane}/>}
        {view==="hierarchy" && <HierarchyMode data={initial}/>}
        {view==="composer" && <ComposerMode data={initial} lane={lane} choose={setLane}/>}
        {view==="runup" && <RunUpMode data={initial}/>}
      </section>
      <div className={styles.detailDock} aria-live="polite">
        <div><small>SELECTED OS / SOURCE</small><strong>{chosenOs?.name ?? "UNKNOWN OS"}</strong><span>{chosenOs?.lifecycle ?? "UNKNOWN"} · WORKER UNKNOWN</span></div>
        <div><small>SELECTED LANE / LEDGER</small><strong>{chosenLane?.id ?? "UNKNOWN"}</strong><span>ASSIGNED · ACTIVE SESSION UNVERIFIED</span></div>
        <div><small>COMPOSER</small><strong>PROPOSED</strong><span>SUPERVISORY ROLE · NO DIRECT DISPATCH</span></div>
        <a href={initial.registrySource} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={17}/> CANONICAL SOURCE</a>
      </div>
      {initial.audience==="admin" && initial.admin && <section className={styles.adminEvidence}>
        <div><small>ADMIN / SOURCE-ONLY AUDIT</small><strong>{adminLane?.scope ?? "No selected assignment"}</strong><span>Evidence: {adminLane?.result ?? "UNKNOWN"}</span></div>
        <div><small>FROZEN WEBSITE SOURCE</small><code>{initial.admin.originalCandidateSha}</code><span>C BUILD: UNKNOWN · 3031: UNKNOWN · PUBLIC: UNKNOWN</span></div>
        {adminLane?.sourceRef && <a href={adminLane.sourceRef} target="_blank" rel="noopener noreferrer">VIEW EVIDENCE SOURCE <ArrowUpRight size={14}/></a>}
      </section>}
      <footer className={styles.footer}><span>AOE2WAR / KINGDOM ENGINEERING</span><span>NO POLLERS · NO FAKE HEARTBEATS · NO FINANCIAL CONTROLS</span></footer>
    </div>
  </main>;
}
