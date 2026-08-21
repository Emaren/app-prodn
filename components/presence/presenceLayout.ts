import type { LivingKingdomActor } from "./livingKingdomTypes";

const LIVING_KINGDOM_DEPTH_BANDS = 21;

export type PresenceRailSide = "left" | "right";

export type PresenceLayoutItem = {
  key: string;
  side: PresenceRailSide;
  y: number;
  members: LivingKingdomActor[];
  own: boolean;
};

export type PresenceLayoutOptions = {
  height: number;
  top: number;
  bottom: number;
  markerSize: number;
  gap: number;
  maxItems: number;
  oneRail?: boolean;
  selfId?: string | null;
};

export function stablePresenceHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function presenceSideForId(id: string): PresenceRailSide {
  return stablePresenceHash(id) % 2 === 0 ? "left" : "right";
}

export function clampPresenceDepthBand(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(LIVING_KINGDOM_DEPTH_BANDS - 1, Math.max(0, Math.round(value)));
}

export function depthBandToRatio(value: number) {
  return clampPresenceDepthBand(value) / (LIVING_KINGDOM_DEPTH_BANDS - 1);
}

export function presenceMaxItemsForViewport({
  height,
  top,
  bottom,
  markerSize,
  gap,
  oneRail,
  ceiling,
}: {
  height: number;
  top: number;
  bottom: number;
  markerSize: number;
  gap: number;
  oneRail: boolean;
  ceiling: number;
}) {
  const available = Math.max(0, height - top - bottom);
  const slotsPerRail = Math.max(0, Math.floor((available + gap) / (markerSize + gap)));
  return Math.min(ceiling, slotsPerRail * (oneRail ? 1 : 2));
}

function actorPriority(actor: LivingKingdomActor, selfId?: string | null) {
  if (actor.id === selfId) return 0;
  if (actor.motion !== "idle") return 1;
  return 2;
}

function collisionLayout(
  groups: Array<{ members: LivingKingdomActor[]; desiredY: number }>,
  minY: number,
  maxY: number,
  step: number,
) {
  const sorted = [...groups].sort((left, right) => {
    if (left.desiredY !== right.desiredY) return left.desiredY - right.desiredY;
    return left.members[0].id.localeCompare(right.members[0].id);
  });
  const positions = sorted.map((group) => Math.min(maxY, Math.max(minY, group.desiredY)));

  for (let index = 1; index < positions.length; index += 1) {
    positions[index] = Math.max(positions[index], positions[index - 1] + step);
  }

  if (positions.length && positions[positions.length - 1] > maxY) {
    positions[positions.length - 1] = maxY;
    for (let index = positions.length - 2; index >= 0; index -= 1) {
      positions[index] = Math.min(positions[index], positions[index + 1] - step);
    }
  }

  return sorted.map((group, index) => ({ ...group, y: Math.max(minY, positions[index]) }));
}

function groupRailActors(
  actors: LivingKingdomActor[],
  capacity: number,
  minY: number,
  maxY: number,
  selfId?: string | null,
) {
  if (actors.length <= capacity) {
    return actors.map((actor) => ({
      members: [actor],
      desiredY: minY + depthBandToRatio(actor.depthBand) * Math.max(0, maxY - minY),
    }));
  }

  const own = selfId ? actors.find((actor) => actor.id === selfId) : undefined;
  if (capacity <= 1) {
    const members = [...actors].sort((left, right) => {
      const priority = actorPriority(left, selfId) - actorPriority(right, selfId);
      return priority || left.id.localeCompare(right.id);
    });
    const anchor = own ?? members[0];
    return [{
      members,
      desiredY: minY + depthBandToRatio(anchor.depthBand) * Math.max(0, maxY - minY),
    }];
  }
  const bucketCapacity = Math.max(1, capacity - (own ? 1 : 0));
  const buckets = new Map<number, LivingKingdomActor[]>();

  for (const actor of actors) {
    if (actor.id === own?.id) continue;
    const slot = Math.min(
      bucketCapacity - 1,
      Math.floor(depthBandToRatio(actor.depthBand) * bucketCapacity),
    );
    const bucket = buckets.get(slot) ?? [];
    bucket.push(actor);
    buckets.set(slot, bucket);
  }

  const groups = [...buckets.entries()].map(([slot, members]) => ({
    members: members.sort((left, right) => {
      const priority = actorPriority(left, selfId) - actorPriority(right, selfId);
      return priority || left.id.localeCompare(right.id);
    }),
    desiredY:
      minY + ((slot + 0.5) / bucketCapacity) * Math.max(0, maxY - minY),
  }));

  if (own) {
    groups.push({
      members: [own],
      desiredY: minY + depthBandToRatio(own.depthBand) * Math.max(0, maxY - minY),
    });
  }

  return groups;
}

export function layoutPresenceActors(
  actors: LivingKingdomActor[],
  options: PresenceLayoutOptions,
): PresenceLayoutItem[] {
  if (!actors.length || options.maxItems <= 0 || options.height <= 0) return [];

  const minY = Math.max(0, options.top);
  const maxY = Math.max(minY, options.height - options.bottom - options.markerSize);
  const step = options.markerSize + options.gap;
  const rails: Record<PresenceRailSide, LivingKingdomActor[]> = { left: [], right: [] };

  for (const actor of [...actors].sort((left, right) => {
    const priority = actorPriority(left, options.selfId) - actorPriority(right, options.selfId);
    return priority || left.id.localeCompare(right.id);
  })) {
    rails[options.oneRail ? "right" : presenceSideForId(actor.id)].push(actor);
  }

  const sides: PresenceRailSide[] = options.oneRail ? ["right"] : ["left", "right"];
  const perRailCapacity = options.oneRail
    ? options.maxItems
    : Math.max(1, Math.floor(options.maxItems / 2));

  return sides.flatMap((side) => {
    const groups = groupRailActors(
      rails[side],
      perRailCapacity,
      minY,
      maxY,
      options.selfId,
    );
    return collisionLayout(groups, minY, maxY, step).map((group) => ({
      key: group.members.map((member) => member.id).sort().join("+"),
      side,
      y: group.y,
      members: group.members,
      own: Boolean(options.selfId && group.members.some((member) => member.id === options.selfId)),
    }));
  });
}
