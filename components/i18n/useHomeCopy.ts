"use client";

import { useCallback } from "react";

import {
  useHomeCatalog,
} from "@/components/i18n/HomeCatalogContext";
import {
  translateHomeCopy,
  type HomeCopy,
} from "@/lib/i18n/homeCopy";

export function useHomeCopy(): HomeCopy {
  const catalog = useHomeCatalog();

  return useCallback(
    (source, values) => translateHomeCopy(catalog, source, values),
    [catalog],
  );
}
