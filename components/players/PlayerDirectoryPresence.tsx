"use client";

import type { ReactNode } from "react";

import { usePublicPresenceContext } from "@/components/presence/PublicPresenceProvider";

function directoryPresenceCount(
  onlineUidSet: Set<string>,
  directoryUids: string[],
) {
  return directoryUids.reduce(
    (count, uid) => count + Number(onlineUidSet.has(uid)),
    0,
  );
}

export function PlayerPresenceCount({
  directoryUids,
}: {
  directoryUids: string[];
}) {
  const { onlineUidSet } = usePublicPresenceContext();

  return directoryPresenceCount(onlineUidSet, directoryUids);
}

export function PlayerPresenceStatus({ uid }: { uid: string | null }) {
  const { onlineUidSet } = usePublicPresenceContext();

  return uid && onlineUidSet.has(uid) ? "Online" : "Profile";
}

export function PlayerPresenceOnly({
  children,
  uid,
}: {
  children: ReactNode;
  uid: string | null;
}) {
  const { onlineUidSet } = usePublicPresenceContext();

  return uid && onlineUidSet.has(uid) ? children : null;
}

export function PlayerPresenceEmpty({
  children,
  directoryUids,
}: {
  children: ReactNode;
  directoryUids: string[];
}) {
  const { onlineUidSet } = usePublicPresenceContext();

  return directoryPresenceCount(onlineUidSet, directoryUids) === 0
    ? children
    : null;
}
