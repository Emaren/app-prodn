import type {
  Activity,
  AdminUserRow,
} from "@/components/admin/command-tower/types";

export const INITIAL_ACTIVITY_BATCH = 20;
const PERSONA_BOTTOM_ORDER = ["emaren", "the ai scribe", "grimer"] as const;

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function formatShortDate(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortHash(value: string | null) {
  if (!value) return null;
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

export function formatActivityType(value: string) {
  return value.replace(/_/g, " ");
}

export function summarizeActivity(activity: Activity) {
  const label = activity.label ? ` · ${activity.label}` : "";
  if (activity.path) {
    return `${formatActivityType(activity.type)}${label} · ${activity.path}`;
  }
  return `${formatActivityType(activity.type)}${label}`;
}

export function findLatestPageView(actions: Activity[]) {
  return actions.find((action) => action.type === "page_view")?.path ?? null;
}

export function statusTone(status: string) {
  if (status === "accepted" || status === "claimed" || status === "won") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }
  if (status === "declined" || status === "rescinded" || status === "lost") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }
  if (status === "completed") {
    return "border-sky-300/30 bg-sky-400/10 text-sky-100";
  }
  return "border-amber-300/30 bg-amber-400/10 text-amber-100";
}

export function unreadTone(count: number) {
  return count > 0
    ? "border-red-400/30 bg-red-500/12 text-red-100"
    : "border-white/10 bg-white/5 text-slate-400";
}

export function formatWolo(value: number) {
  return new Intl.NumberFormat().format(value);
}

function normalizedDisplayName(value: string) {
  return value.trim().toLowerCase();
}

export function pinnedBottomRank(user: AdminUserRow) {
  const name = normalizedDisplayName(user.displayName);
  const directMatch = PERSONA_BOTTOM_ORDER.indexOf(name as (typeof PERSONA_BOTTOM_ORDER)[number]);
  if (directMatch >= 0) {
    return directMatch + 1;
  }

  if (user.isAdmin) {
    return 1;
  }

  return 0;
}

export function mergeUniqueActivities(...groups: Activity[][]) {
  const seen = new Set<number>();
  const merged: Activity[] = [];

  for (const group of groups) {
    for (const activity of group) {
      if (seen.has(activity.id)) {
        continue;
      }
      seen.add(activity.id);
      merged.push(activity);
    }
  }

  return merged.sort((left, right) => {
    const rightTime = new Date(right.createdAt).getTime();
    const leftTime = new Date(left.createdAt).getTime();
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return right.id - left.id;
  });
}
