import { PAGE_CHANGE_MANIFEST } from "./pageChangeManifest.generated.ts";

export type PageChangeNotice = {
  href: string;
  label: string;
  version: string;
};

export type SeenPageChangeVersions = Record<string, string>;

export const PAGE_CHANGE_NOTICE_STORAGE_KEY =
  "aoe2war:page-change-notices:v2";

export const PAGE_CHANGE_NOTICES =
  PAGE_CHANGE_MANIFEST satisfies readonly PageChangeNotice[];

export function parseSeenPageChangeVersions(
  raw: string | null
): SeenPageChangeVersions {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([href, version]) =>
          href.startsWith("/") &&
          typeof version === "string" &&
          version.length > 0
      )
    );
  } catch {
    return {};
  }
}

export function isPageChangeNoticeRoute(
  pathname: string | null,
  href: string
) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getUnseenPageChangeHrefs(
  seen: SeenPageChangeVersions,
  notices: readonly PageChangeNotice[] = PAGE_CHANGE_NOTICES
) {
  return notices
    .filter((notice) => seen[notice.href] !== notice.version)
    .map((notice) => notice.href);
}

export function markPageChangeNoticeSeen(
  seen: SeenPageChangeVersions,
  href: string,
  version: string
): SeenPageChangeVersions {
  if (seen[href] === version) return seen;
  return { ...seen, [href]: version };
}

export function pageChangeNoticeForPathname(pathname: string | null) {
  if (!pathname) return null;
  return (
    PAGE_CHANGE_NOTICES.find((notice) =>
      isPageChangeNoticeRoute(pathname, notice.href)
    ) ?? null
  );
}
