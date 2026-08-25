"use client";

import Image from "next/image";
import { Crown, RadioTower, Shield, Swords } from "lucide-react";

import type {
  WarGraphPublicEngagement,
  WarGraphPublicNode,
  WarGraphPublicRing,
  WarGraphViewMode,
} from "@/lib/wargraph/publicTypes";

const BOARD_SIZE = 1_000;
const BOARD_CENTER = BOARD_SIZE / 2;
const OUTER_RADIUS = 410;
const FIRST_RING_RADIUS = 170;

interface NodePosition {
  x: number;
  y: number;
  angle: number;
  radius: number;
  density: "normal" | "compact" | "dense";
}

interface BoardGeometry {
  positions: ReadonlyMap<string, NodePosition>;
  ringRadii: ReadonlyMap<string, number>;
  structuralEdges: ReadonlyArray<{
    id: string;
    from: NodePosition;
    to: NodePosition;
  }>;
}

function initialsForName(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function positionForSeat({
  seat,
  count,
  radius,
  density = "normal",
}: {
  seat: number;
  count: number;
  radius: number;
  density?: NodePosition["density"];
}): NodePosition {
  if (radius === 0 || count <= 1) {
    return { x: BOARD_CENTER, y: BOARD_CENTER, angle: 0, radius: 0, density };
  }

  // Two inner champions read best as left/right. Every larger ring starts at
  // twelve o'clock and is calculated from capacity, so frontier growth does
  // not require new layout code.
  const startAngle = count === 2 ? Math.PI : -Math.PI / 2;
  const angle = startAngle + (Math.PI * 2 * seat) / count;

  return {
    x: BOARD_CENTER + Math.cos(angle) * radius,
    y: BOARD_CENTER + Math.sin(angle) * radius,
    angle,
    radius,
    density,
  };
}

function densityForSeatCount(count: number): NodePosition["density"] {
  if (count > 20) return "dense";
  if (count > 14) return "compact";
  return "normal";
}

function buildBoardGeometry(
  rings: ReadonlyArray<WarGraphPublicRing>,
  nodeById: ReadonlyMap<string, WarGraphPublicNode>,
): BoardGeometry {
  const ordered = [...rings].sort((left, right) => left.order - right.order);
  const positions = new Map<string, NodePosition>();
  const ringRadii = new Map<string, number>();

  const outerRingCount = Math.max(1, ordered.length - 1);
  const radialStep =
    outerRingCount <= 1
      ? 0
      : (OUTER_RADIUS - FIRST_RING_RADIUS) / (outerRingCount - 1);

  ordered.forEach((ring, ringIndex) => {
    const radius =
      ring.kind === "crown" || ringIndex === 0
        ? 0
        : Math.min(OUTER_RADIUS, FIRST_RING_RADIUS + (ringIndex - 1) * radialStep);
    ringRadii.set(ring.id, radius);

    const nodeIds = ring.nodeIds.filter((nodeId) => nodeById.has(nodeId));
    const seatCount = Math.max(ring.capacity, nodeIds.length, 1);

    nodeIds.forEach((nodeId, fallbackSeat) => {
      const node = nodeById.get(nodeId);
      const seat = Math.max(0, Math.min(node?.seat ?? fallbackSeat, seatCount - 1));
      const frontierLaneCount =
        ring.kind === "frontier" && seatCount > 18
          ? Math.min(3, Math.ceil(seatCount / 18))
          : 1;
      const laneIndex = seat % frontierLaneCount;
      const laneSeat = Math.floor(seat / frontierLaneCount);
      const laneSeatCount = Math.max(
        1,
        Math.ceil((seatCount - laneIndex) / frontierLaneCount),
      );
      const laneRadius =
        frontierLaneCount === 1
          ? radius
          : 395 + (laneIndex - (frontierLaneCount - 1) / 2) * 45;
      positions.set(
        nodeId,
        positionForSeat({
          seat: laneSeat,
          count: laneSeatCount,
          radius: laneRadius,
          density: densityForSeatCount(laneSeatCount),
        }),
      );
    });
  });

  const structuralEdges: Array<{
    id: string;
    from: NodePosition;
    to: NodePosition;
  }> = [];

  ordered.slice(1).forEach((ring, ringIndex) => {
    const innerRing = ordered[ringIndex];
    const innerPositions = innerRing.nodeIds
      .map((nodeId) => positions.get(nodeId))
      .filter((position): position is NodePosition => Boolean(position));

    ring.nodeIds.forEach((nodeId) => {
      const from = positions.get(nodeId);
      if (!from || innerPositions.length === 0) return;

      const to = innerPositions.reduce((nearest, candidate) => {
        const nearestDelta = Math.abs(
          Math.atan2(Math.sin(from.angle - nearest.angle), Math.cos(from.angle - nearest.angle)),
        );
        const candidateDelta = Math.abs(
          Math.atan2(
            Math.sin(from.angle - candidate.angle),
            Math.cos(from.angle - candidate.angle),
          ),
        );
        return candidateDelta < nearestDelta ? candidate : nearest;
      });

      structuralEdges.push({ id: `${nodeId}:${innerRing.id}`, from, to });
    });
  });

  return { positions, ringRadii, structuralEdges };
}

function stateTone(state: WarGraphPublicNode["state"]) {
  switch (state) {
    case "ready_now":
      return "border-emerald-300/55 bg-emerald-400 shadow-emerald-300/55";
    case "under_siege":
      return "border-sky-200/65 bg-sky-300 shadow-sky-200/65";
    case "engaged":
      return "border-amber-200/65 bg-amber-300 shadow-amber-200/65";
    case "night_complete":
      return "border-sky-300/45 bg-sky-300 shadow-sky-300/40";
    case "wargraph_today":
      return "border-violet-300/45 bg-violet-300 shadow-violet-300/40";
    case "realm_active":
      return "border-amber-100/35 bg-amber-100 shadow-amber-100/30";
    default:
      return "border-slate-400/35 bg-slate-500 shadow-transparent";
  }
}

function fossilizationTone(stage: WarGraphPublicNode["fossilization"]["stage"]) {
  switch (stage) {
    case "weathered":
      return "grayscale-[0.22] saturate-[0.78]";
    case "stone_touched":
      return "grayscale-[0.42] saturate-[0.58] contrast-[1.06]";
    case "stone_spreading":
      return "grayscale-[0.64] saturate-[0.38] contrast-[1.1]";
    case "mostly_statue":
      return "grayscale-[0.82] saturate-[0.2] contrast-[1.15] brightness-[0.88]";
    case "full_statue":
    case "cobwebbed":
      return "grayscale saturate-0 contrast-125 brightness-75";
    default:
      return "";
  }
}

function NodeAvatar({ node, size }: { node: WarGraphPublicNode; size: number }) {
  return node.avatarUrl ? (
    <Image
      src={node.avatarUrl}
      alt={node.avatarAlt}
      width={size}
      height={size}
      unoptimized
      className="h-full w-full object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_35%_25%,rgba(245,205,111,0.23),rgba(15,27,39,0.96)_62%)] font-serif text-sm font-black text-amber-100"
    >
      {initialsForName(node.displayName)}
    </span>
  );
}

function DesktopWarriorNode({
  node,
  position,
  mode,
  selected,
  hasOpenAdvance,
  onSelect,
}: {
  node: WarGraphPublicNode;
  position: NodePosition;
  mode: WarGraphViewMode;
  selected: boolean;
  hasOpenAdvance: boolean;
  onSelect: (nodeId: string) => void;
}) {
  const isCrown = position.radius === 0 || node.isCrownHolder;
  const nodeWidth = isCrown
    ? "w-[9.5rem] xl:w-[10.5rem]"
    : position.density === "dense"
      ? "w-[4.6rem] xl:w-[5.2rem]"
      : position.density === "compact"
        ? "w-[5.6rem] xl:w-[6.2rem]"
        : "w-[6.8rem] xl:w-[7.5rem]";
  const compact = !isCrown && position.density !== "normal";

  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      aria-label={`Inspect ${node.displayName}, ${node.stateLabel}`}
      aria-pressed={selected}
      className={`group absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-[1.35rem] text-left transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/90 focus-visible:ring-offset-4 focus-visible:ring-offset-[#03070b] motion-reduce:transition-none ${nodeWidth} ${
        selected ? "scale-[1.04]" : "hover:scale-[1.025]"
      }`}
      style={{
        left: `${(position.x / BOARD_SIZE) * 100}%`,
        top: `${(position.y / BOARD_SIZE) * 100}%`,
      }}
    >
      <span
        className={`absolute -inset-2 rounded-[1.65rem] blur-xl transition motion-reduce:transition-none ${
          selected
            ? "bg-amber-300/[0.18] opacity-100"
            : node.state === "engaged"
              ? "bg-amber-400/[0.12] opacity-80"
              : node.presence.underSiege
                ? "bg-sky-300/[0.12] opacity-80 motion-safe:animate-pulse"
                : "bg-transparent opacity-0 group-hover:opacity-70"
        }`}
        aria-hidden="true"
      />

      <span
        className={`relative block overflow-hidden border bg-[linear-gradient(155deg,rgba(20,34,46,0.97),rgba(5,12,19,0.98))] shadow-[0_16px_35px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.07)] ${
          isCrown
            ? "rounded-[1.4rem] border-amber-200/60 p-2.5"
            : selected
              ? "rounded-[1.15rem] border-amber-200/60 p-2"
              : node.presence.underSiege
                ? "rounded-[1.15rem] border-sky-200/45 p-2"
                : "rounded-[1.15rem] border-amber-200/[0.24] p-2 group-hover:border-amber-200/[0.42]"
        }`}
      >
        <span
          className={`relative mx-auto block overflow-hidden rounded-full border border-amber-100/[0.28] bg-[#0b1824] shadow-[0_7px_20px_rgba(0,0,0,0.4)] ${
            compact ? "h-8 w-8" : "h-10 w-10 xl:h-11 xl:w-11"
          }`}
          title={node.fossilization.label}
        >
          <span className={`absolute inset-0 ${fossilizationTone(node.fossilization.stage)}`}>
            <NodeAvatar node={node} size={48} />
          </span>
          <span
            className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border shadow-[0_0_10px_currentColor] ${stateTone(node.state)}`}
          />
        </span>

        {node.isCrownHolder ? (
          <Crown
            aria-hidden="true"
            className="absolute left-1/2 top-1 h-4 w-4 -translate-x-1/2 -translate-y-1/2 fill-amber-300/25 text-amber-200"
          />
        ) : null}

        <span className={`mt-1.5 block truncate text-center font-serif font-black text-amber-50 ${compact ? "text-[9px]" : "text-[11px] xl:text-xs"}`}>
          {node.displayName}
        </span>

        {mode !== "basic" ? (
          <span className="mt-0.5 block truncate text-center text-[8px] uppercase tracking-[0.12em] text-slate-400 xl:text-[9px]">
            {node.subtitle ?? node.stateLabel}
          </span>
        ) : null}

        {mode === "extreme" ? (
          <span className="mt-1.5 block border-t border-white/[0.07] pt-1 text-center text-[8px] uppercase tracking-[0.1em] text-slate-500">
            <span className="flex items-center justify-center gap-1">
              <RadioTower aria-hidden="true" className="h-2.5 w-2.5" />
              {node.watcher.label}
            </span>
            <span className="mt-0.5 block">{node.actionsUsed}/{node.actionLimit} resolved</span>
          </span>
        ) : null}

        {hasOpenAdvance ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.9)] motion-safe:animate-pulse" aria-label="Open advance" />
        ) : null}
      </span>
    </button>
  );
}

function LiveEngagementLine({
  engagement,
  positions,
}: {
  engagement: WarGraphPublicEngagement;
  positions: ReadonlyMap<string, NodePosition>;
}) {
  const from = positions.get(engagement.aggressorNodeId);
  const to = positions.get(engagement.defenderNodeId);
  if (!from || !to || engagement.state === "void") return null;

  const active =
    engagement.state === "watching" || engagement.state === "awaiting_final";

  return (
    <g aria-hidden="true">
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={active ? "rgba(251,191,36,0.28)" : "rgba(125,211,252,0.2)"}
        strokeWidth={active ? 20 : 13}
        strokeLinecap="round"
        className={active ? "motion-safe:animate-pulse" : undefined}
      />
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={active ? "#f8d477" : "#7dd3fc"}
        strokeWidth={active ? 4 : 3}
        strokeDasharray={active ? undefined : "11 11"}
        strokeLinecap="round"
      />
      <circle
        cx={(from.x + to.x) / 2}
        cy={(from.y + to.y) / 2}
        r={10}
        fill="#07111b"
        stroke={active ? "#f8d477" : "#7dd3fc"}
        strokeWidth={3}
      />
    </g>
  );
}

function EngagementFocusButton({
  engagement,
  positions,
  onFocus,
}: {
  engagement: WarGraphPublicEngagement;
  positions: ReadonlyMap<string, NodePosition>;
  onFocus: (engagement: WarGraphPublicEngagement) => void;
}) {
  const from = positions.get(engagement.aggressorNodeId);
  const to = positions.get(engagement.defenderNodeId);
  if (!from || !to || engagement.state === "void") return null;

  return (
    <button
      type="button"
      onClick={() => onFocus(engagement)}
      aria-label={`Follow engagement: ${engagement.label}`}
      className="group absolute z-[15] grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#03070b]"
      style={{
        left: `${(((from.x + to.x) / 2) / BOARD_SIZE) * 100}%`,
        top: `${(((from.y + to.y) / 2) / BOARD_SIZE) * 100}%`,
      }}
    >
      <span className="h-3.5 w-3.5 rounded-full border-2 border-amber-100/70 bg-[#07111b] shadow-[0_0_14px_rgba(248,212,119,0.72)] transition group-hover:scale-125 motion-reduce:transition-none" />
    </button>
  );
}

function DesktopBoard({
  rings,
  nodes,
  engagements,
  openAdvanceRequesterIds,
  focusedNodeId,
  mode,
  onFocusNode,
  onFocusEngagement,
}: WarGraphBoardProps) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const geometry = buildBoardGeometry(rings, nodeById);

  return (
    <div className="relative mx-auto hidden aspect-square w-full max-w-[64rem] lg:block">
      <div
        aria-hidden="true"
        className="absolute inset-[4%] rounded-full bg-[radial-gradient(circle_at_center,rgba(245,181,67,0.18)_0%,rgba(33,50,59,0.17)_25%,rgba(4,13,21,0.82)_63%,rgba(2,7,12,0.98)_100%)] shadow-[inset_0_0_120px_rgba(0,0,0,0.72),0_35px_100px_rgba(0,0,0,0.55)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-[7%] rounded-full border border-amber-200/[0.08] bg-[repeating-radial-gradient(circle_at_center,transparent_0,transparent_42px,rgba(255,255,255,0.018)_43px,transparent_44px)]"
      />

      <svg
        viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        role="img"
        aria-label="WarGraph concentric battle board"
      >
        <defs>
          <radialGradient id="wargraph-ring-stroke" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#f8da8b" />
            <stop offset="100%" stopColor="#8f5a16" />
          </radialGradient>
        </defs>

        {[...rings]
          .sort((left, right) => left.order - right.order)
          .map((ring) => {
            const radius = geometry.ringRadii.get(ring.id) ?? 0;
            if (radius === 0) return null;
            return (
              <g key={ring.id} aria-hidden="true">
                <circle
                  cx={BOARD_CENTER}
                  cy={BOARD_CENTER}
                  r={radius}
                  fill="none"
                  stroke="rgba(249,210,125,0.09)"
                  strokeWidth={28}
                />
                <circle
                  cx={BOARD_CENTER}
                  cy={BOARD_CENTER}
                  r={radius}
                  fill="none"
                  stroke="url(#wargraph-ring-stroke)"
                  strokeOpacity={ring.kind === "frontier" ? 0.38 : 0.55}
                  strokeWidth={2.5}
                  strokeDasharray={ring.kind === "frontier" ? "8 9" : undefined}
                />
              </g>
            );
          })}

        {mode === "extreme"
          ? geometry.structuralEdges.map((edge) => (
              <line
                key={edge.id}
                x1={edge.from.x}
                y1={edge.from.y}
                x2={edge.to.x}
                y2={edge.to.y}
                stroke="rgba(244,199,104,0.18)"
                strokeWidth={2}
                strokeDasharray="7 10"
                aria-hidden="true"
              />
            ))
          : null}

        {engagements.map((engagement) => (
          <LiveEngagementLine
            key={engagement.id}
            engagement={engagement}
            positions={geometry.positions}
          />
        ))}

        <circle
          cx={BOARD_CENTER}
          cy={BOARD_CENTER}
          r={72}
          fill="rgba(221,159,45,0.08)"
          stroke="rgba(253,220,145,0.48)"
          strokeWidth={3}
          aria-hidden="true"
        />
      </svg>

      {engagements.map((engagement) => (
        <EngagementFocusButton
          key={`focus:${engagement.id}`}
          engagement={engagement}
          positions={geometry.positions}
          onFocus={onFocusEngagement}
        />
      ))}

      {nodes.map((node) => {
        const position = geometry.positions.get(node.id);
        if (!position) return null;
        return (
          <DesktopWarriorNode
            key={node.id}
            node={node}
            position={position}
            mode={mode}
            selected={focusedNodeId === node.id}
            hasOpenAdvance={openAdvanceRequesterIds.has(node.id)}
            onSelect={onFocusNode}
          />
        );
      })}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[1.2%] left-1/2 -translate-x-1/2 rounded-full border border-amber-200/[0.12] bg-[#030912]/75 px-3 py-1 text-[8px] font-black uppercase tracking-[0.26em] text-amber-100/55 backdrop-blur-md"
      >
        The Frontier
      </div>
    </div>
  );
}

function MobileBoard({
  rings,
  nodes,
  engagements,
  openAdvanceRequesterIds,
  focusedNodeId,
  mode,
  onFocusNode,
  onFocusEngagement,
}: WarGraphBoardProps) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const orderedRings = [...rings].sort((left, right) => left.order - right.order);
  const activeEngagements = engagements.filter((engagement) => engagement.state !== "void");

  return (
    <div className="space-y-3 lg:hidden">
      {activeEngagements.length > 0 ? (
        <section aria-label="Live WarGraph engagements" className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {activeEngagements.map((engagement) => {
            const aggressor = nodeById.get(engagement.aggressorNodeId)?.displayName ?? "Aggressor";
            const defender = nodeById.get(engagement.defenderNodeId)?.displayName ?? "Defender";
            return (
              <button
                key={engagement.id}
                type="button"
                onClick={() => onFocusEngagement(engagement)}
                className="flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-300/[0.06] px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80"
              >
                <Swords className="h-3.5 w-3.5 text-amber-200" />
                <span>
                  <span className="block text-[8px] font-black uppercase tracking-[0.13em] text-amber-200/65">Live edge</span>
                  <span className="block text-[10px] text-slate-200">{aggressor} → {defender}</span>
                </span>
              </button>
            );
          })}
        </section>
      ) : null}

      {orderedRings.map((ring, ringIndex) => {
        const ringNodes = ring.nodeIds
          .map((nodeId) => nodeById.get(nodeId))
          .filter((node): node is WarGraphPublicNode => Boolean(node));

        return (
          <section
            key={ring.id}
            aria-labelledby={`wargraph-mobile-ring-${ring.id}`}
            className={`overflow-hidden rounded-[1.35rem] border bg-[linear-gradient(145deg,rgba(13,27,40,0.95),rgba(4,11,18,0.98))] shadow-[0_18px_45px_rgba(0,0,0,0.32)] ${
              ring.kind === "crown"
                ? "border-amber-200/35"
                : "border-white/[0.08]"
            }`}
          >
            <header className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-amber-200/20 bg-amber-300/[0.07] text-[10px] font-black text-amber-100">
                  {ringIndex === 0 ? <Crown className="h-3.5 w-3.5" /> : ringIndex}
                </span>
                <div>
                  <h2
                    id={`wargraph-mobile-ring-${ring.id}`}
                    className="font-serif text-sm font-black text-amber-50"
                  >
                    {ring.label}
                  </h2>
                  {mode !== "basic" ? (
                    <p className="text-[9px] uppercase tracking-[0.13em] text-slate-500">
                      {ring.movementSummary}
                    </p>
                  ) : null}
                </div>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {ringNodes.length}/{ring.capacity}
              </span>
            </header>

            {ringNodes.length > 0 ? (
              <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {ringNodes.map((node) => {
                  const selected = focusedNodeId === node.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => onFocusNode(node.id)}
                      aria-label={`Inspect ${node.displayName}, ${node.stateLabel}`}
                      aria-pressed={selected}
                      className={`relative flex min-w-[14rem] snap-center items-center gap-3 rounded-[1rem] border p-2.5 text-left shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80 motion-reduce:transition-none ${
                        selected
                          ? "border-amber-200/55 bg-amber-300/[0.1]"
                          : node.presence.underSiege
                            ? "border-sky-200/45 bg-sky-300/[0.07]"
                          : "border-white/[0.08] bg-black/20"
                      }`}
                    >
                      <span
                        className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-amber-100/[0.22] bg-[#0b1824]"
                        title={node.fossilization.label}
                      >
                        <span className={`absolute inset-0 ${fossilizationTone(node.fossilization.stage)}`}>
                          <NodeAvatar node={node} size={48} />
                        </span>
                        <span
                          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border shadow-[0_0_9px_currentColor] ${stateTone(node.state)}`}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif text-sm font-black text-amber-50">
                          {node.displayName}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                          {mode === "basic" ? node.stateLabel : node.subtitle ?? node.stateLabel}
                        </span>
                        {mode === "extreme" ? (
                          <span className="mt-1 block text-[8px] uppercase tracking-[0.1em] text-slate-500">
                            {node.watcher.label} · {node.actionsUsed}/{node.actionLimit} resolved
                          </span>
                        ) : null}
                      </span>

                      {node.isCrownHolder ? (
                        <Crown className="absolute right-2 top-2 h-3.5 w-3.5 text-amber-200" />
                      ) : null}
                      {openAdvanceRequesterIds.has(node.id) ? (
                        <span className="absolute bottom-2 right-2 h-2 w-2 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.85)] motion-safe:animate-pulse" aria-label="Open advance" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-4 py-5 text-sm text-slate-500">No warriors hold this ring yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

interface WarGraphBoardProps {
  rings: ReadonlyArray<WarGraphPublicRing>;
  nodes: ReadonlyArray<WarGraphPublicNode>;
  engagements: ReadonlyArray<WarGraphPublicEngagement>;
  openAdvanceRequesterIds: ReadonlySet<string>;
  focusedNodeId: string | null;
  mode: WarGraphViewMode;
  onFocusNode: (nodeId: string) => void;
  onFocusEngagement: (engagement: WarGraphPublicEngagement) => void;
}

export function WarGraphBoard(props: WarGraphBoardProps) {
  const engagementCount = props.engagements.filter(
    (engagement) => engagement.state !== "void",
  ).length;

  return (
    <section
      aria-label="WarGraph board"
      className="relative overflow-hidden rounded-[1.6rem] border border-amber-200/[0.14] bg-[linear-gradient(180deg,rgba(6,16,25,0.98),rgba(2,8,13,0.99))] p-2 shadow-[0_30px_90px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.055)] sm:p-3 lg:rounded-[2rem] lg:p-0"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55rem_30rem_at_50%_46%,rgba(209,151,48,0.085),transparent_72%)]" aria-hidden="true" />

      <div className="relative flex items-center justify-between gap-3 px-2 pb-2 pt-1 lg:absolute lg:inset-x-6 lg:top-5 lg:z-30 lg:p-0">
        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.17em] text-slate-500">
          <Shield aria-hidden="true" className="h-3.5 w-3.5 text-amber-200/65" />
          Persistent battlefield
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
          <Swords aria-hidden="true" className="h-3 w-3 text-sky-300" />
          {engagementCount} live {engagementCount === 1 ? "fight" : "fights"}
        </div>
      </div>

      <DesktopBoard {...props} />
      <MobileBoard {...props} />
    </section>
  );
}
