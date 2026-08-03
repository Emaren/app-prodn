"use client";

import { useCallback } from "react";
import { useLocale } from "next-intl";

import {
  homeCopy,
  type HomeCopy,
} from "@/lib/i18n/homeCopy";

export function useHomeCopy(): HomeCopy {
  const locale = useLocale();

  return useCallback(
    (source, values) => homeCopy(locale, source, values),
    [locale],
  );
}
