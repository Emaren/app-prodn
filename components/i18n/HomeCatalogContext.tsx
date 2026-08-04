"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import type { HomeCatalog } from "@/lib/i18n/homeCopy";

const HomeCatalogContext = createContext<HomeCatalog | null>(null);

export function HomeCatalogProvider({
  catalog,
  children,
}: {
  catalog: HomeCatalog;
  children: ReactNode;
}) {
  return (
    <HomeCatalogContext.Provider value={catalog}>
      {children}
    </HomeCatalogContext.Provider>
  );
}

export function useHomeCatalog() {
  const catalog = useContext(HomeCatalogContext);

  if (!catalog) {
    throw new Error(
      "useHomeCatalog must be used inside HomeCatalogProvider",
    );
  }

  return catalog;
}
