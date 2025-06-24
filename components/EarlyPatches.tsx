"use client";

import Script from "next/script";

export default function EarlyPatches() {
  const patch = `
    (function(){
      // Remember originals
      const _dp = Object.defineProperty;
      const _dps = Object.defineProperties;
      const _WS = window.WebSocket;

      // Wrap defineProperty / defineProperties
      Object.defineProperty = function(t,k,d){
        try { return _dp(t,k,d); }
        catch(e){ console.warn("blocked redefine", k); return t; }
      };
      Object.defineProperties = function(t,p){
        try { return _dps(t,p); }
        catch(e){ console.warn("blocked redefineProps", p); return t; }
      };

      // Block stray WalletConnect bridges
      window.WebSocket = function(url, protocols) {
        if (typeof url === "string" && url.includes("bridge.walletconnect.org")) {
          console.warn("Blocked stray WC WS ➔", url);
          return {
            readyState: _WS.CLOSED,
            send: ()=>{}, close: ()=>{},
            addEventListener: ()=>{}, removeEventListener: ()=>{},
            onopen:null, onmessage:null, onerror:null, onclose:null
          };
        }
        return new _WS(url, protocols);
      };
    })();
  `;

  return (
    <Script
      id="early-patches"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: patch }}
    />
  );
}
