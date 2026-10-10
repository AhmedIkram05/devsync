"""P0 regression: prod Socket.IO wiring must keep auth handlers on the serving server.

Root cause found live 2026-10-10: `socketio_server.py` passed `message_queue`
to the module-level `SocketIO(...)` constructor. Whenever a queue URL is set at
import (prod always sets one — `_message_queue()` falls back to the in-cluster
Redis), Flask-SocketIO initialises Server #1 immediately, so every `@socketio.on`
handler binds to #1; the later `init_socketio(app)` then builds Server #2 with an
empty handler queue and serves THAT. Result in prod: unauth connects accepted,
no event handler ever ran (auth guard included). CI never caught it because no
queue env exists at import there (single deferred server — the happy path).

The child below reproduces the exact prod import order (queue env set before
first import) and probes the real HTTP stack over engine.io polling — the same
probe that caught prod red-handed. Pre-fix it observes `40` (accept); fixed it
must observe `44` (connect error) for bare/garbage auth and `40` for a valid JWT.
"""

import json
import os
import socket
import subprocess
import sys
import urllib.request
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

CHILD = r"""
import os, sys, urllib.parse
sys.path.insert(0, os.environ["BACKEND_DIR"])

# Prod import order: queue env present BEFORE first import of socketio_server.
os.environ["FLASK_ENV"] = "production"
os.environ["REDIS_URL"] = "redis://127.0.0.1:9/0"  # nothing listens: refused fast
os.environ["FRONTEND_URL"] = "https://gcp.devsyncapp.me"

from wsgiref.simple_server import WSGIServer, make_server
from socketserver import ThreadingMixIn

from src.app import create_app
from src.auth.token_blocklist import reset_for_tests
from flask_jwt_extended import create_access_token

app, socketio = create_app(
    {
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
        "JWT_SECRET_KEY": "test-secret-key-for-prod-wiring-regression",
        "JWT_COOKIE_SECURE": False,
        "JWT_COOKIE_SAMESITE": "Lax",
    }
)
reset_for_tests()

handlers = socketio.server.handlers.get("/", {})
missing = [h for h in ("connect", "disconnect", "heartbeat", "join_project") if h not in handlers]
if missing:
    print(f"WIRING-BROKEN missing handlers on serving server: {missing}", flush=True)
    os._exit(2)

with app.app_context():
    token = create_access_token(identity={"user_id": 7}, additional_claims={"role": "developer"})
print(f"TOKEN {token}", flush=True)


class _ThreadedWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


port = int(sys.argv[1])
httpd = make_server("127.0.0.1", port, app.wsgi_app, server_class=_ThreadedWSGIServer)
print(f"READY {port}", flush=True)
httpd.serve_forever()
"""


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _http(method, url, body=None, timeout=15):
    req = urllib.request.Request(
        url,
        data=body.encode() if isinstance(body, str) else body,
        method=method,
        headers={"Content-Type": "text/plain;charset=UTF-8"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read().decode()


def _run_child(port):
    env = dict(os.environ)
    env["BACKEND_DIR"] = str(BACKEND_DIR)
    proc = subprocess.Popen(
        [sys.executable, "-c", CHILD, str(port)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env=env,
        cwd=str(BACKEND_DIR),
    )
    token = None
    assert proc.stdout is not None
    try:
        for line in proc.stdout:
            if line.startswith("WIRING-BROKEN"):
                proc.kill()
                raise AssertionError(line.strip())
            if line.startswith("TOKEN "):
                token = line.split(None, 1)[1].strip()
            if line.startswith("READY "):
                break
        else:
            raise AssertionError("child died before READY")
        yield token
    finally:
        proc.kill()


def _connect_result(base, payload):
    r, body = _http("GET", f"{base}/socket.io/?EIO=4&transport=polling")
    assert r == 200, f"handshake failed: {body[:200]}"
    sid = json.loads(body[1:])["sid"]
    r, _ = _http("POST", f"{base}/socket.io/?EIO=4&transport=polling&sid={sid}", payload)
    assert r == 200, "connect packet not accepted at transport level"
    r, poll = _http("GET", f"{base}/socket.io/?EIO=4&transport=polling&sid={sid}")
    assert r == 200
    return poll


def test_prod_wiring_rejects_unauth_over_real_http():
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    for token in _run_child(port):
        bare = _connect_result(base, "40")
        assert bare.startswith("44"), f"bare connect must be refused (44), got: {bare[:120]}"

        garbage = _connect_result(base, '40{"token":"garbage-token-xyz"}')
        assert garbage.startswith("44"), f"garbage-token connect must be refused (44), got: {garbage[:120]}"

        authed = _connect_result(base, "40" + json.dumps({"token": token}))
        assert authed.startswith("40"), f"valid JWT connect must be accepted (40), got: {authed[:120]}"
