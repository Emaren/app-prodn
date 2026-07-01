import Link from "next/link";

import type { ClanViewMode } from "@/lib/clans";

const VIEWS: Array<{
  key: ClanViewMode;
  label: string;
  title: string;
}> = [
  { key: "basic", label: "B", title: "Basic" },
  { key: "advanced", label: "A", title: "Advanced" },
  { key: "extreme", label: "E", title: "Extreme" },
];

function hrefFor(basePath: string, mode: ClanViewMode) {
  return mode === "advanced"
    ? basePath
    : `${basePath}?view=${encodeURIComponent(mode)}`;
}

export default function ClanViewToggle({
  view,
  basePath,
  label = "Clan view mode",
}: {
  view: ClanViewMode;
  basePath: string;
  label?: string;
}) {
  return (
    <nav className="clan-bae-toggle" aria-label={label}>
      {VIEWS.map((item) => {
        const active = view === item.key;
        return (
          <Link
            key={item.key}
            href={hrefFor(basePath, item.key)}
            aria-current={active ? "page" : undefined}
            className={`clan-bae-toggle__item${
              active ? " clan-bae-toggle__item--active" : ""
            }`}
            title={item.title}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
