#!/usr/bin/env python3
"""Emergency-only loopback HTTP 3033: no auth, DB, money or App dependency."""
from __future__ import annotations
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

VERSION = "aoe2war.app.c03.emergency-only-3033.v1"
BIND = "127.0.0.1"
PORT = 3033
PUBLIC_HTML = b"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AoE2WAR | Safe maintenance mode</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111923;color:#fff;font:16px system-ui}main{max-width:34rem;padding:2.5rem}h1{font-size:1.8rem}p{line-height:1.6;color:#cbd5e1}</style></head><body><main><h1>AoE2WAR is temporarily unavailable</h1><p>Read-only maintenance mode is active. Login, bets, wallets, payments and account actions are unavailable. No financial transaction has been submitted by this page.</p></main></body></html>"""
HEALTH = (json.dumps({
 "schema": VERSION, "status": "FAIL_CLOSED_EMERGENCY_ONLY_NOT_AUTHENTICATED_ROLLBACK",
 "financialExecutionAuthorized": False, "authContinuityVerified": False,
 "databaseConnectionAvailable": False, "eligibleForC03Handoff": False,
}, separators=(",", ":"), sort_keys=True) + "\n").encode()
MAX_URI = 1024

class SafeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"
    server_version = "AoE2WAR-EmergencyOnly"
    sys_version = ""
    timeout = 4

    def log_message(self, fmt: str, *args: object) -> None:
        return  # Never log user-supplied paths, tokens, or cookies.

    def _response(self, include_body: bool) -> None:
        if len(self.path) > MAX_URI:
            status, payload, content_type = 414, b"", "text/plain; charset=utf-8"
        elif self.path == "/__c03_internal/healthz" and self.command in ("GET", "HEAD"):
            status, payload, content_type = 200, HEALTH, "application/json; charset=utf-8"
        else:
            status = 503
            payload = PUBLIC_HTML if self.command in ("GET", "HEAD") else b""
            content_type = "text/html; charset=utf-8"
        self.send_response(status)
        for name, value in (
            ("Content-Type", content_type),
            ("Content-Length", str(len(payload))),
            ("Cache-Control", "private, no-store, max-age=0, must-revalidate"),
            ("CDN-Cache-Control", "no-store"), ("Pragma", "no-cache"),
            ("X-Content-Type-Options", "nosniff"), ("X-Frame-Options", "DENY"),
            ("Referrer-Policy", "no-referrer"),
            ("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"),
            ("X-AoE2WAR-Fallback", "failclosed-nonfinancial-only-v1"),
            ("Connection", "close"),
        ):
            self.send_header(name, value)
        self.end_headers()
        if include_body and payload:
            self.wfile.write(payload)
        self.close_connection = True

    def do_GET(self) -> None: self._response(True)
    def do_HEAD(self) -> None: self._response(False)
    def do_POST(self) -> None: self._response(False)
    def do_PUT(self) -> None: self._response(False)
    def do_PATCH(self) -> None: self._response(False)
    def do_DELETE(self) -> None: self._response(False)
    def do_OPTIONS(self) -> None: self._response(False)
    def do_CONNECT(self) -> None: self._response(False)
    def do_TRACE(self) -> None: self._response(False)

def serve(host: str = BIND, port: int = PORT) -> None:
    if host != BIND or not isinstance(port, int) or not 0 <= port <= 65535:
        raise ValueError("HOLD_C03_3033_MUST_BIND_LOOPBACK_ONLY")
    server = HTTPServer((host, port), SafeHandler, bind_and_activate=True)
    server.timeout = 4
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()

if __name__ == "__main__":
    serve()
