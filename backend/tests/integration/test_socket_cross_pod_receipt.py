"""§4/A11 cross-pod socket broadcast receipt through the Redis message queue.

Two socket.io server instances bound to the same kombu queue emulate two pods:
"pod B" emits into a room owned by "pod A" and pod A's real client receives it.
Built on python-socketio's native servers/clients (flask_socketio's test client
refuses to coexist with a message-queue manager — its own contract) so the
receipt goes through the true pub/sub path. Sync everywhere: python-socketio
5.7.1's async mode has no kombu manager, and sync servers/clients exercise the
same protocol. Polling transport only (wsgiref can't terminate websockets) —
that is the standing production default anyway
(NotificationContext.jsx REACT_APP_SOCKET_TRANSPORT='polling'). Runs as its own CI step so the kombu subscription thread never
leaks into xdist worker state. Skips when no broker answers at REDIS_URL
(default 127.0.0.1:6379) — CI brings Redis up; the live check runs it over
`kubectl port-forward`.
"""

import os
import socket as socket_mod
import sys
import threading
from pathlib import Path
from socketserver import ThreadingMixIn
from unittest.mock import MagicMock
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

import pytest
import socketio as psio  # python-socketio: real protocol servers/clients


def _mq_url():
    """Broker override: REDIS_URL env, default 127.0.0.1:6379 (CI service)."""
    return os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")


def _redis_reachable():
    broker = _mq_url().replace("redis://", "").split("/", 1)[0]
    host, port = broker.rsplit(":", 1)
    try:
        sock = socket_mod.create_connection((host, int(port)), timeout=0.3)
        sock.close()
        return True
    except OSError:
        return False


requires_redis = pytest.mark.skipif(not _redis_reachable(), reason="no reachable Redis (CI provides one)")

# The child self-bounds every wait (10s port ready + 10s client connect + 10s
# join ack + 30s receipt retry), so it aborts with its own clear message well
# before this. The parent timeout is only a backstop against an unexpected hang.
_CHILD_TIMEOUT_SECONDS = 90


class _ThreadedWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


def _make_pod(port):
    """Mini pod: a real socket.io Server behind stdlib threaded WSGI."""
    pod = psio.Server(async_mode="threading", client_manager=psio.KombuManager(_mq_url()))

    @pod.on("join_project")
    def on_join(sid, data):
        pod.enter_room(sid, f"project_{data['project_id']}", "/")

    app = psio.WSGIApp(pod)

    def serve():
        server = make_server("127.0.0.1", port, app, server_class=_ThreadedWSGIServer, handler_class=WSGIRequestHandler)
        server.serve_forever()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    return thread


@requires_redis
def test_cross_pod_broadcast_receipt(tmp_path):
    """Real protocol stack: MQ publish from pod B reaches pod A's room client.

    Runs in a child interpreter (kombu's subscribe thread can outlive pytest's
    non-daemon teardown) and asserts on its exit code.
    """
    import subprocess

    result = subprocess.run(
        [sys.executable, "-c", _CROSSPOD_BODY],
        input="",
        capture_output=True,
        text=True,
        timeout=_CHILD_TIMEOUT_SECONDS,
        env={**os.environ, "REDIS_URL": _mq_url()},
    )
    assert result.returncode == 0, f"cross-pod receipt failed:\n{result.stdout}\n{result.stderr}"
    assert "RECEIVED" in result.stdout


def test_cross_pod_registry_shape_unchanged(monkeypatch):
    """Sanity: pod-scoped presence helpers still shape keys as <pod>:<sid>."""
    sys.path.insert(0, str(Path(__file__).parents[2]))
    import src.socketio_server as socket_module

    fake = MagicMock()
    fake.get.return_value = None
    monkeypatch.setattr(socket_module, "get_redis", lambda: fake)

    socket_module._presence_set(1, "sid-x")
    assert fake.setex.call_count == 1
    key, ttl, value = fake.setex.call_args_list[0][0]
    assert key == f"{socket_module.PRESENCE_PREFIX}1"
    assert ttl == socket_module.PRESENCE_TTL_SECONDS
    assert value.startswith(f"{socket_module.POD_ID}:")


# The receipt body runs in a child process: standalone python-socketio Server
# pair + KombuManager through the same broker, room join on pod A, publish into
# the room from pod B, receipt asserted client-side.
_CROSSPOD_BODY = r"""
from os import environ as _env
MQ = _env.get("REDIS_URL", "redis://127.0.0.1:6379/0")
import socket
import threading
import time

import socketio as psio
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, WSGIRequestHandler, make_server

# Bounded budgets (seconds); the child self-aborts with a clear message instead
# of hanging, so the parent's subprocess timeout stays a backstop.
PORT_READY_TIMEOUT = 10
JOIN_ACK_TIMEOUT = 10
RECEIPT_TIMEOUT = 30
EMIT_RETRY_INTERVAL = 1.0


class T(ThreadingMixIn, WSGIServer):
    daemon_threads = True


pod = psio.Server(async_mode="threading", client_manager=psio.KombuManager(MQ))


@pod.on("join_project")
def on_join(sid, data):
    pod.enter_room(sid, f"project_{data['project_id']}", "/")
    print("JOIN handled", flush=True)
    return {"joined": True}


app = psio.WSGIApp(pod)


def serve():
    srv = make_server("127.0.0.1", 8765, app, server_class=T, handler_class=WSGIRequestHandler)
    print("WSGI serving", flush=True)
    srv.serve_forever()


threading.Thread(target=serve, daemon=True).start()

# Readiness poll: retry connecting until the threaded WSGI server accepts.
# A fixed sleep here flakes when a loaded CI runner starts the server slowly.
_deadline = time.monotonic() + PORT_READY_TIMEOUT
while True:
    try:
        socket.create_connection(("127.0.0.1", 8765), timeout=0.5).close()
        break
    except OSError:
        if time.monotonic() >= _deadline:
            raise SystemExit("WSGI server on 127.0.0.1:8765 never became ready")
        time.sleep(0.1)
print("PORT UP", flush=True)

received = []
joined = threading.Event()
client = psio.Client()
client.on("task_updated", lambda d: (print("RECEIVED", d, flush=True), received.append(d)))
print("connecting client...", flush=True)
try:
    client.connect("http://127.0.0.1:8765", transports=["polling", "websocket"], wait_timeout=10)
    print("connected:", client.connected, flush=True)

    # Observable join signal: emit with an ack and wait (bounded) for the
    # server's room-join acknowledgement instead of sleeping a fixed second.
    client.emit("join_project", {"project_id": 90}, callback=lambda ack=None: joined.set())
    if not joined.wait(JOIN_ACK_TIMEOUT):
        raise SystemExit("join_project was not acknowledged by the server")

    pod_b = psio.Server(async_mode="threading", client_manager=psio.KombuManager(MQ))
    # The fanout subscription is created asynchronously on the first connect, so
    # a single publish can land before pod A is listening and be dropped.
    # Re-publish until the receipt is observed, bounded by RECEIPT_TIMEOUT.
    deadline = time.monotonic() + RECEIPT_TIMEOUT
    while not received and time.monotonic() < deadline:
        pod_b.emit("task_updated", {"task_id": 9, "update_type": "completed"}, to="project_90", namespace="/")
        retry_until = min(time.monotonic() + EMIT_RETRY_INTERVAL, deadline)
        while not received and time.monotonic() < retry_until:
            time.sleep(0.25)

    print("got:", received, flush=True)
except Exception as e:
    import traceback

    traceback.print_exc()
    print("FAIL:", e, flush=True)
client.disconnect() if client.connected else None
if not received:
    raise SystemExit("no cross-pod receipt within %ss (room join / MQ subscription never delivered)" % RECEIPT_TIMEOUT)
raise SystemExit(0)
"""
