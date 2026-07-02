"use client";

import type { ComponentProps } from "react";

import WoloMarketExtremeTile from "@/components/lobby/WoloMarketExtremeTile";
import { WoloMarketTile as WoloMarketTileLegacy } from "@/components/lobby/WoloMarketTileLegacy";

type LegacyProps = ComponentProps<typeof WoloMarketTileLegacy>;

type WoloMarketTileProps = LegacyProps & {
  activeView?: string;
  className?: string;
  extreme?: boolean;
  mode?: string;
  surface?: string;
  variant?: string;
  view?: string;
  viewMode?: string;
};

function isExtreme(value: unknown) {
  return typeof value === "string" && value.trim().toLowerCase() === "extreme";
}

export default function WoloMarketTile(props: WoloMarketTileProps) {
  const extreme =
    props.extreme === true ||
    isExtreme(props.variant) ||
    isExtreme(props.view) ||
    isExtreme(props.viewMode) ||
    isExtreme(props.activeView) ||
    isExtreme(props.mode) ||
    isExtreme(props.surface);

  if (extreme) {
    return <WoloMarketExtremeTile className={props.className} />;
  }

  return <WoloMarketTileLegacy {...props} />;
}

export { WoloMarketTile };
