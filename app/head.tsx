import Script from "next/script";

export default function Head() {
  const patch = `
    (function(){
      const _dp = Object.defineProperty;
      const _dps = Object.defineProperties;

      Object.defineProperty = function(target, key, desc) {
        try {
          return _dp(target, key, desc);
        } catch (e) {
          if (e.message.includes("Cannot redefine property:")) {
            console.warn("⚡️ Suppressed defineProperty on", key);
            return target;
          }
          throw e;
        }
      };

      Object.defineProperties = function(target, props) {
        try {
          return _dps(target, props);
        } catch (e) {
          if (e.message.includes("Cannot redefine property:")) {
            console.warn("⚡️ Suppressed defineProperties", props);
            return target;
          }
          throw e;
        }
      };

      // Swallow those extension errors before they bubble up
      window.addEventListener(
        "error",
        (event) => {
          const msg = event.message || "";
          if (msg.includes("Cannot redefine property:") ||
              msg.includes("Access to storage is not allowed")) {
            event.stopImmediatePropagation();
            console.warn("⚡️ Suppressed extension error:", msg);
          }
        },
        true
      );

      window.addEventListener(
        "unhandledrejection",
        (event) => {
          const reason = event.reason?.message || event.reason || "";
          if (reason.includes("Cannot redefine property:") ||
              reason.includes("Access to storage is not allowed")) {
            event.preventDefault();
            console.warn("⚡️ Suppressed extension rejection:", reason);
          }
        },
        true
      );
    })();
  `;

  return (
    <>
      <Script
        id="suppress-extension-noise"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: patch }}
      />
      {/*–– the rest of your head tags: meta, title, manifest, etc. ––*/}
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="AoE2 Betting" />
      <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      <link rel="manifest" href="/manifest.json" />
      <title>AoE2 Betting</title>
      <meta name="description" content="Bet on AoE2 games" />
    </>
  );
}
