// components/WsBlocker.tsx
"use client";

import { useEffect } from "react";

export default function WsBlocker() {
  useEffect(() => {
    if ((window as any).__wc_ws_patched) return;
    const OriginalWebSocket = window.WebSocket;
    // @ts-ignore override
    window.WebSocket = function (url: string, protocols?: string | string[]) {
      if (url.includes("bridge.walletconnect.org")) {
        console.warn("Blocked stray WC WebSocket ➔", url);
        // Return dummy closed socket
        const dummy: any = {
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
        return dummy;
      }
      return new OriginalWebSocket(url, protocols as any);
    } as any;
    (window as any).__wc_ws_patched = true;
  }, []);

  return null;
}
