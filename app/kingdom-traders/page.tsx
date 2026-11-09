import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kingdom Traders — PAPER Research · AoE2WAR",
  description:
    "Read-only preview of the isolated Kingdom Traders PAPER cockpit. No wallets, live trading or financial execution.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/kingdom-traders" },
};

const cards = [
  {
    label: "Historical PAPER accounts",
    value: "100",
    detail: "Source-reproduced accounting records; NOT 100 currently running bots",
  },
  {
    label: "Open, unpriced positions",
    value: "7",
    detail: "Original fictional BTC inventory preserved without an exit",
  },
  {
    label: "Funded and live orders",
    value: "0",
    detail: "No wallet connection, trade API, leverage or WOLO permission",
  },
] as const;

export default function KingdomTradersProductPreview() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "clamp(20px, 5vw, 70px)",
        color: "#f3f7ff",
        background: "linear-gradient(145deg, #0b1729, #0c1020)",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <p
          style={{
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#a8c6df",
            fontSize: 12,
            fontWeight: 750,
          }}
        >
          ⚔ AoE2WAR / PRODUCT / KINGDOM TRADERS
        </p>
        <h1
          style={{
            fontSize: "clamp(36px, 5vw, 66px)",
            lineHeight: 1.07,
            margin: "24px 0 12px",
          }}
        >
          The Trading Control Tower
        </h1>
        <p style={{ maxWidth: 780, color: "#bed0e4", fontSize: 17 }}>
          The dedicated PAPER research service is isolated from betting, WOLO,
          wallets and the public AoE2WAR account system. This preview does not
          request, forward or expose any operator password or protected API.
        </p>
        <p
          role="status"
          style={{
            marginTop: 28,
            padding: 18,
            background: "#312519",
            color: "#ffdda6",
            border: "1px solid #7b5934",
            borderRadius: 12,
          }}
        >
          <strong>HALT — no independently verified later Kraken source.</strong>{" "}
          The historical source was short and already studied. Existing
          fictional positions are never assumed sold or reset, and no new
          PAPER orders are authorized.
        </p>
        <div
          style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 14,
          }}
        >
          {cards.map((card) => (
            <section
              key={card.label}
              style={{
                padding: 22,
                border: "1px solid #334c6b",
                borderRadius: 13,
                background: "#14243a",
              }}
            >
              <p style={{ margin: 0, color: "#b1c9df", fontSize: 13 }}>
                {card.label}
              </p>
              <p style={{ fontSize: 37, margin: "8px 0" }}>
                <strong>{card.value}</strong>
              </p>
              <p style={{ margin: 0, color: "#9fbbd5", fontSize: 13 }}>
                {card.detail}
              </p>
            </section>
          ))}
        </div>
        <section
          style={{
            marginTop: 34,
            padding: 24,
            borderRadius: 12,
            border: "1px solid #334c6b",
          }}
        >
          <h2 style={{ marginTop: 0 }}>PAPER cockpit integration</h2>
          <p style={{ color: "#bfcee0" }}>
            The standalone authenticated cockpit requires its own operator
            login and an independently trusted HTTPS origin. Public navigation
            and account integration remain disabled until the separate
            website-release owner transfers authority and the product TLS and
            privacy gates are accepted.
          </p>
          <p style={{ color: "#e4b970" }}>
            No sign-in forwarding. No private trading endpoint. No financial SQL
            access. No link to a certificate-untrusted origin.
          </p>
        </section>
      </div>
    </main>
  );
}
