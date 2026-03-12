import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background:
            "radial-gradient(circle at top left, rgba(251,191,36,0.24), transparent 28%), linear-gradient(135deg, #0f172a 0%, #111827 55%, #020617 100%)",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              maxWidth: "820px",
            }}
          >
            <div
              style={{
                fontSize: 26,
                letterSpacing: "0.38em",
                textTransform: "uppercase",
                color: "rgba(253, 230, 138, 0.85)",
              }}
            >
              AoE2HD Bets
            </div>
            <div
              style={{
                fontSize: 74,
                lineHeight: 1.02,
                fontWeight: 700,
              }}
            >
              Tournament lobby, live chat, rivalry pages, and replay proof.
            </div>
            <div
              style={{
                fontSize: 28,
                lineHeight: 1.4,
                color: "rgba(226,232,240,0.88)",
              }}
            >
              Steam-linked identity for AoE2HD players, real parsed match feeds, and the trust layer
              for competitive bets.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "14px",
            }}
          >
            <div
              style={{
                border: "1px solid rgba(251,191,36,0.28)",
                background: "rgba(251,191,36,0.12)",
                color: "#fde68a",
                borderRadius: 9999,
                padding: "12px 20px",
                fontSize: 24,
                fontWeight: 600,
              }}
            >
              Live tournament lobby
            </div>
            <div
              style={{
                border: "1px solid rgba(56,189,248,0.24)",
                background: "rgba(56,189,248,0.12)",
                color: "#bae6fd",
                borderRadius: 9999,
                padding: "12px 20px",
                fontSize: 24,
                fontWeight: 600,
              }}
            >
              Replay-backed match history
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "16px",
            }}
          >
            {["Tournament", "Chat", "Players", "Proof"].map((label) => (
              <div
                key={label}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 28,
                  padding: "16px 22px",
                  fontSize: 24,
                  color: "rgba(226,232,240,0.95)",
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: 26,
              color: "rgba(148,163,184,0.92)",
            }}
          >
            aoe2hdbets.com
          </div>
        </div>
      </div>
    ),
    size
  );
}
