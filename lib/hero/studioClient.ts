import type {
  HeroScreenConfig,
  HeroScreenType,
} from "./types.ts";

type PositionedHeroItem = {
  position: number;
  screen: { id: number };
};

type HeroStudioPreviewDraft = {
  id: number;
  type: HeroScreenType;
  mediaAssetId: number | null;
  config: HeroScreenConfig;
};

export type HeroStudioPreviewMode = "desktop" | "mobile";

function normalizeHeroItemPositions<T extends PositionedHeroItem>(
  items: readonly T[]
): T[] {
  return items.map((item, position) => ({ ...item, position }));
}

export function prependHeroItems<T extends PositionedHeroItem>(
  current: readonly T[],
  incoming: readonly T[]
): T[] {
  const seenScreenIds = new Set(current.map((item) => item.screen.id));
  const uniqueIncoming = incoming.filter((item) => {
    if (seenScreenIds.has(item.screen.id)) return false;
    seenScreenIds.add(item.screen.id);
    return true;
  });

  return normalizeHeroItemPositions([...uniqueIncoming, ...current]);
}

export function reorderHeroItem<T extends PositionedHeroItem>(
  current: readonly T[],
  screenId: number,
  toIndex: number
): T[] {
  const fromIndex = current.findIndex((item) => item.screen.id === screenId);
  if (fromIndex < 0 || current.length < 2) {
    return [...current];
  }

  const wrappedIndex =
    ((toIndex % current.length) + current.length) % current.length;
  if (fromIndex === wrappedIndex) return [...current];

  const next = [...current];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return [...current];
  next.splice(wrappedIndex, 0, moved);
  return normalizeHeroItemPositions(next);
}

export function heroStudioPreviewKey(
  draft: HeroStudioPreviewDraft,
  mode: HeroStudioPreviewMode
) {
  const config = draft.config;
  return [
    draft.id,
    draft.type,
    draft.mediaAssetId ?? "",
    mode,
    config.imageFit ?? "cover",
    config.backgroundImageUrl ?? "",
    config.mobileBackgroundImageUrl ?? "",
    config.videoUrl ?? "",
    config.posterUrl ?? "",
    config.overlayOpacity ?? "",
    config.pureImage === true ? "pure" : "composed",
    config.languageCode ?? "en",
    config.languageGroupKey ?? "",
  ].join("|");
}
