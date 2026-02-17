// components/WsBlocker.tsx
"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __wc_ws_patched?: boolean;
  }
}

export default function WsBlocker() {
  useEffect(() => {
    if (window.__wc_ws_patched) return;

    const OriginalWebSocket = window.WebSocket;

    const WrappedWebSocket = function (
      url: string | URL,
      protocols?: string | string[]
    ): WebSocket {
      const targetUrl = typeof url === "string" ? url : url.toString();

      if (targetUrl.includes("bridge.walletconnect.org")) {
        console.warn("Blocked stray WC WebSocket ➔", url);
        const dummySocket = {
          readyState: OriginalWebSocket.CLOSED,
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          onopen: null,
          onmessage: null,
          onerror: null,
          onclose: null,
        };
        return dummySocket as unknown as WebSocket;
      }

      return protocols === undefined
        ? new OriginalWebSocket(url)
        : new OriginalWebSocket(url, protocols);
    } as unknown as typeof WebSocket;

    WrappedWebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket = WrappedWebSocket;
    window.__wc_ws_patched = true;
  }, []);

  return null;
}
