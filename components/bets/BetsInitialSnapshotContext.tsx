"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import type { BetBoardSnapshot } from "@/lib/bets";

const BetsInitialSnapshotContext = createContext<BetBoardSnapshot | null>(null);

export function BetsInitialSnapshotProvider({
  children,
  initialSnapshot,
}: {
  children: ReactNode;
  initialSnapshot: BetBoardSnapshot | null;
}) {
  return (
    <BetsInitialSnapshotContext.Provider value={initialSnapshot}>
      {children}
    </BetsInitialSnapshotContext.Provider>
  );
}

export function useBetsInitialSnapshot() {
  return useContext(BetsInitialSnapshotContext);
}
