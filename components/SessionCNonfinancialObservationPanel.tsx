/**
 * Session C PRODUCT-only unmounted operations preview.
 * No client hooks, session delegation, live fetch, mutations or finance ops.
 * Session B controls any eventual admin-only mounted route.
 */
type TrafficGapReadModel = {
  status: "HOLD_PENDING_CANONICAL_SOURCE_CERTIFICATION";
  missingOriginalDays: string[];
  missingProvisionalCompletedDays: string[];
  certifiedMetricMergedWithObserved: false;
};
type WatcherReadModel = {
  status: "OBSERVATIONAL_HOLD_NOT_A_LIVE_WATCHER_ADMISSION";
  classifications: {
    current: number; stale: number; future: number;
    outdatedVersion: number; disconnected: number; unverified: number;
  };
  connectedMeansReplayMonitoring: false;
};
type StorageReadModel = {
  status: "HOLD_PRIVATE_SIGNED_RECOVERY_NOT_PROVEN";
  planes: Array<{
    id: string; availableGiB: number | null;
    belowFloor: boolean | null; durableBackupVerified: false;
  }>;
  c06BackupCertified: false;
};

export function SessionCNonfinancialObservationPanel({
  traffic,
  watcher,
  storage,
}: {
  traffic?: TrafficGapReadModel | null;
  watcher?: WatcherReadModel | null;
  storage?: StorageReadModel | null;
}) {
  const mac = storage?.planes.find((plane) => plane.id === "mac");
  const gapCount = traffic ? traffic.missingOriginalDays.length : null;
  const provisionalGaps = traffic
    ? traffic.missingProvisionalCompletedDays.length : null;
  const watcherUnavailable = watcher
    ? watcher.classifications.stale +
      watcher.classifications.future +
      watcher.classifications.outdatedVersion +
      watcher.classifications.disconnected +
      watcher.classifications.unverified
    : null;
  const cards = [
    {
      title: "Original Traffic history gaps",
      value: gapCount === null ? "UNKNOWN" : String(gapCount),
      context: "Missing certified days are UNKNOWN, never zero.",
    },
    {
      title: "Observed-only Traffic gaps",
      value: provisionalGaps === null ? "UNKNOWN" : String(provisionalGaps),
      context: "Provisional IP/GETs cannot certify human sessions.",
    },
    {
      title: "Watcher 1.6.5 attention signals",
      value: watcherUnavailable === null ? "UNKNOWN" : String(watcherUnavailable),
      context: "Heartbeat presence cannot prove replay monitoring.",
    },
    {
      title: "Mac storage available",
      value: mac?.availableGiB === null || mac?.availableGiB === undefined
        ? "UNKNOWN" : String(mac.availableGiB) + " GiB",
      context: "30 GiB research capture reserve; backup proof stays open.",
    },
  ];

  return (
    <section
      aria-label="Session C nonfinancial source review"
      style={{
        width: "100%", minWidth: 0, maxWidth: 1100, margin: "0 auto",
        padding: "clamp(14px,3vw,24px)", color: "#edf4fd",
        background: "#15243a", borderRadius: 14,
        border: "1px solid #4e6881",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Traffic · Watcher · Storage OS</h2>
      <p role="status" aria-live="polite"
         style={{ color: "#f8d09b", lineHeight: 1.5 }}>
        SOURCE REVIEW ONLY — no runtime certification or backup acceptance
      </p>
      <div style={{
        display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,230px),1fr))",
      }}>
        {cards.map((card) => (
          <article key={card.title} style={{
            background: "#20334c", border: "1px solid #57738d",
            borderRadius: 12, padding: 15, minWidth: 0,
          }}>
            <h3 style={{ fontSize: 14, marginTop: 0 }}>{card.title}</h3>
            <strong style={{
              fontSize: "clamp(21px,4vw,30px)",
              overflowWrap: "anywhere",
            }}>
              {card.value}
            </strong>
            <p style={{ lineHeight: 1.5, fontSize: 13 }}>
              {card.context}
            </p>
          </article>
        ))}
      </div>
      <p style={{ lineHeight: 1.5 }}>
        The original Traffic graph remains authoritative. These findings do
        not replace its history, publish a second graph, create Traffic
        visitors, qualify Watcher replay, delete storage, or claim C06/C07
        backup-and-restore acceptance.
      </p>
    </section>
  );
}
