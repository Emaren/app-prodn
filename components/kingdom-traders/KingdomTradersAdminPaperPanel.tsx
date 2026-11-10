import type { RestrictedPaperReadResult } from "@/lib/kingdomTradersPaperReadonly.mjs";

/**
 * SERVER-RENDERED ONLY, UNMOUNTED until Session B's exact App handoff.
 * The caller must first pass requireAdmin. No hooks, tokens, direct fetch,
 * broker login, financial SQL or private network calls are present here.
 */
export function KingdomTradersAdminPaperPanel({
  result,
}: {
  result: RestrictedPaperReadResult;
}) {
  const ready = result.ok === true;
  const activeModel = ready ? result.model : null;

  return (
    <section
      aria-label="Kingdom Traders read-only PAPER status"
      style={{
        width: "100%",
        minWidth: 0,
        maxWidth: 1100,
        margin: "0 auto",
        padding: "clamp(14px, 3vw, 24px)",
        background: "#102138",
        borderRadius: 14,
        border: "1px solid #355273",
        color: "#edf5ff",
      }}
    >
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}>
        <div>
          <p style={{
            textTransform: "uppercase", letterSpacing: "0.15em",
            fontWeight: 700, fontSize: 12, color: "#b9d3ed",
          }}>
            Kingdom Traders · admin PAPER cockpit
          </p>
          <h2 style={{ margin: "6px 0" }}>Historical PAPER research</h2>
        </div>
        <strong
          role="status"
          aria-live="polite"
          style={{
            display: "inline-block",
            maxWidth: "100%",
            overflowWrap: "anywhere",
            padding: "10px 14px",
            borderRadius: 10,
            background: "#382618",
            color: "#ffe0b3",
            border: "1px solid #8b6331",
          }}
        >
          {ready ? "PAPER HALT — read-only source" : "HOLD — status unavailable"}
        </strong>
      </div>

      <p style={{ maxWidth: 780, lineHeight: 1.5, color: "#d4e5f4" }}>
        {ready
          ? "The 100 accounts and seven open positions are historically reproduced. " +
            "They are not 100 bots executing in current markets."
          : "The product release has not been admitted, the admin session is " +
            "not authorized, or verified private status is unavailable."}
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
        gap: 12,
      }}>
        {([
          { key: "accounts", title: "Historical accounts",
            value: ready ? String(activeModel?.originalAccounts) : "—" },
          { key: "positions", title: "Open, unpriced BTC positions",
            value: ready ? String(activeModel?.openUnpricedOriginalPositions) : "—" },
          { key: "orders", title: "Live and funded orders", value: "0" },
        ] as const).map((item) => (
          <div key={item.key} style={{
            minWidth: 0, padding: 16, borderRadius: 12,
            background: "#182f4b", border: "1px solid #46617c",
          }}>
            <p style={{ fontSize: 13, color: "#c3d7ec", marginTop: 0 }}>
              {item.title}
            </p>
            <p style={{ fontSize: "clamp(27px, 5vw, 36px)", margin: 0 }}>
              <strong>{item.value}</strong>
            </p>
          </div>
        ))}
      </div>

      <p style={{
        marginBottom: 0, marginTop: 18, lineHeight: 1.5,
        fontSize: 14, color: "#dfc091",
      }}>
        Fresh Kraken source: NOT VERIFIED. New PAPER orders: DISABLED.
        Real trading, leverage, wallet funding, betting, and WOLO:
        NOT AUTHORIZED. The independent operator cockpit stays private.
      </p>
    </section>
  );
}
