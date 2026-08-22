"use client";

import type { LivingKingdomActor } from "./livingKingdomTypes";

export type LivingKingdomVisualSnapshot = {
  actors: LivingKingdomActor[];
  overflowCount: number;
  selfId: string | null;
  selfVisible: boolean;
};

const EMPTY_SNAPSHOT: LivingKingdomVisualSnapshot = {
  actors: [],
  overflowCount: 0,
  selfId: null,
  selfVisible: true,
};

let snapshot = EMPTY_SNAPSHOT;
const snapshotListeners = new Set<() => void>();
const showSelfListeners = new Set<() => void>();

export function getLivingKingdomVisualSnapshot() {
  return snapshot;
}

export function getLivingKingdomServerVisualSnapshot() {
  return EMPTY_SNAPSHOT;
}

export function publishLivingKingdomVisualSnapshot(next: LivingKingdomVisualSnapshot) {
  snapshot = next;
  for (const listener of snapshotListeners) listener();
}

export function subscribeLivingKingdomVisualSnapshot(listener: () => void) {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

export function requestLivingKingdomSelfAvatar() {
  for (const listener of showSelfListeners) listener();
}

export function subscribeLivingKingdomSelfAvatarRequest(listener: () => void) {
  showSelfListeners.add(listener);
  return () => {
    showSelfListeners.delete(listener);
  };
}

export function orderLivingKingdomChipActors(
  actors: readonly LivingKingdomActor[],
  selfId: string | null,
) {
  const sorted = [...actors].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const self = selfId
    ? sorted.find((actor) => actor.id === selfId)
    : undefined;

  return self
    ? [...sorted.filter((actor) => actor.id !== self.id), self]
    : sorted;
}
