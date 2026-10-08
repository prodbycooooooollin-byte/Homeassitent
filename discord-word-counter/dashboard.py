"""Web-Dashboard (nur Standardbibliothek). Start: python dashboard.py"""
import base64
import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from dotenv import load_dotenv

from db import Store
from stats import compute

load_dotenv()
store = Store(os.getenv("DB_PATH", "counter.db"))
TZ = os.getenv("TIMEZONE", "Europe/Berlin")
PASSWORD = os.getenv("DASHBOARD_PASSWORD", "")
BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))  # _MEIPASS: Ordner in der PyInstaller-EXE
HTML = (BASE / "dashboard.html").read_bytes()


class Handler(BaseHTTPRequestHandler):
    def _authorized(self) -> bool:
        if not PASSWORD:
            return True
        header = self.headers.get("Authorization", "")
        if header.startswith("Basic "):
            try:
                _, _, pw = base64.b64decode(header[6:]).decode().partition(":")
                return hmac.compare_digest(pw, PASSWORD)
            except Exception:
                return False
        return False

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self._authorized():
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="Dashboard"')
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        url = urlparse(self.path)
        if url.path == "/":
            return self._send(200, HTML, "text/html; charset=utf-8")
        if url.path == "/api/stats":
            guilds = store.guilds()
            wanted = parse_qs(url.query).get("guild", [None])[0]
            gid = int(wanted) if wanted and wanted.isdigit() else (guilds[0][0] if guilds else None)
            data = compute(store.events(gid), store.names(gid), TZ) if gid else compute([], {}, TZ)
            data["guilds"] = [{"id": str(g), "name": n} for g, n in guilds]
            data["guild"] = str(gid) if gid else None
            return self._send(200, json.dumps(data).encode(), "application/json")
        self._send(404, b"not found", "text/plain")

    def log_message(self, *args):
        pass


def serve() -> None:
    host, port = os.getenv("DASHBOARD_HOST", "127.0.0.1"), int(os.getenv("DASHBOARD_PORT", "8080"))
    print(f"Dashboard läuft auf http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    serve()
