"""Sin Min Middle School 2026 Sports Meet local HTTP server with Token-free Git sync."""
import functools
import http.server
import json
import os
import subprocess
import sys
import threading
from datetime import datetime, timezone

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_PATH = os.path.join(ROOT_DIR, "data", "live-state.json")

_git_lock = threading.Lock()
_git_worker_active = False
_git_pending = False


def _run_git_push_loop():
    global _git_worker_active, _git_pending
    while True:
        with _git_lock:
            if not _git_pending:
                _git_worker_active = False
                return
            _git_pending = False

        try:
            subprocess.run(
                ["git", "add", "data/live-state.json"],
                cwd=ROOT_DIR,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
            diff = subprocess.run(
                ["git", "diff", "--cached", "--quiet", "--", "data/live-state.json"],
                cwd=ROOT_DIR,
            )
            if diff.returncode != 0:
                ts = datetime.now().strftime("%H:%M:%S")
                subprocess.run(
                    ["git", "commit", "-m", f"chore: 实时更新新民独立中学运动会成绩 ({ts})"],
                    cwd=ROOT_DIR,
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                )
                subprocess.run(
                    ["git", "push", "origin", "main"],
                    cwd=ROOT_DIR,
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                )
                print(f"[local-sync {ts}] Pushed data/live-state.json to GitHub.", flush=True)
        except Exception as exc:
            print(f"[local-sync error] {exc}", flush=True)


def _schedule_git_push():
    global _git_worker_active, _git_pending
    with _git_lock:
        _git_pending = True
        if not _git_worker_active:
            _git_worker_active = True
            t = threading.Thread(target=_run_git_push_loop, daemon=True)
            t.start()


class SportsServerHandler(http.server.SimpleHTTPRequestHandler):
    """Serve workspace files and handle /api/local-sync without a GitHub token."""

    def _send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path_only = self.path.split("?", 1)[0]
        if path_only == "/api/local-sync-status":
            self._send_json(
                200,
                {
                    "ok": True,
                    "mode": "local_git",
                    "repo": "felixyu9722/sinmin-sports-2026",
                },
            )
            return
        super().do_GET()

    def do_POST(self):
        path_only = self.path.split("?", 1)[0]
        if path_only != "/api/local-sync":
            self._send_json(404, {"ok": False, "error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            state = json.loads(raw.decode("utf-8"))
            if not isinstance(state, dict) or not isinstance(state.get("events"), list):
                self._send_json(400, {"ok": False, "error": "Invalid sports state payload"})
                return

            meta = state.setdefault("meta", {})
            meta["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

            os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
            with open(STATE_PATH, "w", encoding="utf-8", newline="\n") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)

            _schedule_git_push()
            self._send_json(
                200,
                {
                    "ok": True,
                    "saved": "data/live-state.json",
                    "updatedAt": meta["updatedAt"],
                    "pushed": "background",
                },
            )
        except Exception as exc:
            self._send_json(500, {"ok": False, "error": str(exc)})

    def log_message(self, format, *args):
        if args and str(args[0]).startswith(("POST /api/", "GET /api/")):
            super().log_message(format, *args)


class QuietThreadingHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        _, exc, _ = sys.exc_info()
        if isinstance(exc, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = functools.partial(SportsServerHandler, directory=ROOT_DIR)
    httpd = QuietThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"Sin Min Sports 2026 local server listening on http://localhost:{port}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
