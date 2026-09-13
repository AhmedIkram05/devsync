import functools
import logging
import os

from flask import request
from flask_jwt_extended import decode_token
from flask_socketio import SocketIO, disconnect, emit, join_room, leave_room
from jwt.exceptions import InvalidTokenError

from .auth.rbac import Role
from .db.models import User, db, project_members
from .services.redis_client import get_redis


def _cors_allowed_origins():
    """D2: production locks socket origins to the allowed frontend; dev,
    compose and CI keep the wildcard so tooling keeps working."""
    if os.getenv("FLASK_ENV", "development").lower() == "production":
        origins = os.getenv("FRONTEND_URL", "").strip()
        return [origins] if origins else []
    return ["*"]


def _message_queue():
    """D4: cross-pod Socket.IO message queue on Redis. Unset in dev/CI means
    single-process mode (no broker to configure); prod falls back to the
    in-cluster queue service."""
    return os.getenv("REDIS_URL") or (
        "redis://devsync-redis:6379/0" if os.getenv("FLASK_ENV", "development").lower() == "production" else None
    )


# Initialize SocketIO
_mq_kwargs = {"message_queue": _message_queue()} if _message_queue() else {}
socketio = SocketIO(cors_allowed_origins=_cors_allowed_origins(), **_mq_kwargs)
logger = logging.getLogger(__name__)

# Store for connected users and project rooms
connected_users = {}  # user_id -> session_id
project_rooms = {}  # project_id -> [user_ids]
sid_users = {}  # session_id -> user_id

# D5 presence: small keys with short TTLs; the k8s pod name distinguishes
# replicas so a reconnect through another pod never deletes the newer key.
PRESENCE_PREFIX = "presence:user:"
PRESENCE_TTL_SECONDS = 30  # 3:1 with the 10s client heartbeat
POD_ID = os.getenv("HOSTNAME", "dev-local")


def _presence_set(user_id, sid):
    """D5: write/refresh the 30s presence key (pod:sid value)."""
    client = get_redis()
    if not client:
        return
    try:
        client.setex(f"{PRESENCE_PREFIX}{user_id}", PRESENCE_TTL_SECONDS, f"{POD_ID}:{sid}")
    except Exception:
        logger.warning("Presence refresh failed; Redis may be down (fail-open)", exc_info=True)


def _presence_delete(user_id, sid):
    """D5: graceful leave/disconnect clears the presence key. The stored value
    guards the cross-pod reconnect race — only our own (pod, sid) pair may
    delete; stale ghosts expire via TTL (~30s ceiling)."""
    client = get_redis()
    if not client:
        return
    key = f"{PRESENCE_PREFIX}{user_id}"
    try:
        stored = client.get(key)
        if stored is None or stored == f"{POD_ID}:{sid}":
            client.delete(key)
    except Exception:
        logger.warning("Presence delete failed; ghost expires via TTL", exc_info=True)


def _safe_emit(event, payload, to):
    """Best-effort emit: a Redis/MQ outage is logged and dropped, never 500.
    State remains authoritative in the DB; clients backfill via REST (ADR 0003)."""
    try:
        emit(event, payload, to=to)
        return True
    except Exception:
        logger.warning("Socket emit %s -> %s failed; MQ may be down (degraded)", event, to, exc_info=True)
        return False


def emit_dashboard_refresh(event_type, *, resource_type=None, resource_id=None, payload=None):
    """Broadcast a dashboard refresh event to all connected clients."""
    try:
        socketio.emit(
            "dashboard_updated",
            {
                "event_type": event_type,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "payload": payload or {},
            },
        )
    except Exception:
        logger.exception("Failed to emit dashboard refresh event")


def _normalize_user_id(user_id):
    """Keep JWT numeric identities consistent with database integer IDs."""
    if isinstance(user_id, str) and user_id.isdigit():
        return int(user_id)
    return user_id


def _extract_token(auth_payload=None):
    """Read a bearer token from either Socket.IO auth payloads or headers."""
    token = None

    if isinstance(auth_payload, dict):
        token = auth_payload.get("token") or auth_payload.get("access_token")
        authorization = auth_payload.get("Authorization") or auth_payload.get("authorization")
        if not token and isinstance(authorization, str):
            token = authorization
    elif isinstance(auth_payload, str):
        token = auth_payload

    if not token:
        token = request.headers.get("Authorization")

    if isinstance(token, str) and token.startswith("Bearer "):
        token = token.split(" ", 1)[1]

    return token


def _decode_user_id(auth_payload=None):
    token = _extract_token(auth_payload)
    if not token:
        return None

    decoded_token = decode_token(token)
    identity = decoded_token.get("identity", decoded_token.get("sub"))
    user_id = identity.get("user_id") if isinstance(identity, dict) else identity
    user_id = _normalize_user_id(user_id)
    if not isinstance(user_id, (int, str)) or user_id in ("", None):
        raise ValueError("Invalid user identity in token")
    return user_id


def authenticated_only(f):
    """Decorator that verifies JWT token for socket connections"""

    @functools.wraps(f)
    def wrapped(*args, **kwargs):
        user_id = sid_users.get(request.sid)

        try:
            if user_id is None:
                user_id = _decode_user_id()
                sid_users[request.sid] = user_id

            # Add user_id to the kwargs so event handlers can use it
            kwargs["user_id"] = user_id
            return f(*args, **kwargs)
        except (InvalidTokenError, TypeError, ValueError):
            disconnect()
            return False

    return wrapped


# Connection event handlers
@socketio.on("connect")
def handle_connect(auth=None):
    """Handle new connections"""
    try:
        user_id = _decode_user_id(auth)
    except (InvalidTokenError, TypeError, ValueError):
        print("Client rejected due to invalid socket token:", request.sid)
        return False

    if user_id is not None:
        sid_users[request.sid] = user_id
        connected_users[user_id] = request.sid
        print(f"User {user_id} connected with socket ID {request.sid}")
    else:
        # Keep unauthenticated connections possible for tests/legacy clients; protected events still verify auth.
        print("Client connected without socket auth:", request.sid)
    return True


@socketio.on("disconnect")
def handle_disconnect():
    """Handle client disconnections"""
    # Remove user from connected_users
    user_id = sid_users.pop(request.sid, None)
    if user_id is None:
        user_id = next((uid for uid, sid in connected_users.items() if sid == request.sid), None)

    if user_id:
        connected_users.pop(user_id, None)
        _presence_delete(user_id, request.sid)

        # Remove user from all project rooms
        for _project_id, members in project_rooms.items():
            if user_id in members:
                members.remove(user_id)

    print("Client disconnected:", request.sid)


@socketio.on("register")
@authenticated_only
def handle_register(data, user_id):
    """Register a user's socket connection"""
    sid_users[request.sid] = user_id
    connected_users[user_id] = request.sid
    _presence_set(user_id, request.sid)
    print(f"User {user_id} registered with socket ID {request.sid}")
    return {"status": "success", "message": "Registered successfully"}


@socketio.on("heartbeat")
@authenticated_only
def handle_heartbeat(data=None, user_id=None):
    """D5: the 10s client heartbeat refreshes the 30s presence key (3:1)."""
    _presence_set(user_id, request.sid)
    return {"status": "success", "ttl_seconds": PRESENCE_TTL_SECONDS}


def _membership_denied(project_id, user_id):
    """Return True when *user_id* may not join *project_id*'s room: project members and admins pass."""
    try:
        project_id = int(project_id)
        user_id = int(user_id)
    except (TypeError, ValueError):
        return True

    if db.session.query(project_members).filter_by(project_id=project_id, user_id=user_id).first() is not None:
        return False

    user = db.session.get(User, user_id)
    return not (user is not None and user.role == Role.ADMIN.value)


# Room management handlers
@socketio.on("join_project")
@authenticated_only
def handle_join_project(data, user_id):
    """Join a project room"""
    project_id = data.get("project_id")
    if not project_id:
        return {"status": "error", "message": "Project ID required"}

    # Server-side enforcement: only project members (or admins) may join a room.
    if _membership_denied(project_id, user_id):
        print(f"Rejected non-member {user_id} from joining project {project_id}")
        return {"status": "error", "message": "You are not a member of this project"}

    # Add user to project room
    join_room(f"project_{project_id}")

    # Track user in project_rooms
    if project_id not in project_rooms:
        project_rooms[project_id] = []

    if user_id not in project_rooms[project_id]:
        project_rooms[project_id].append(user_id)

    # Room action refreshes the presence TTL (D5: 3:1 margin vs heartbeat).
    _presence_set(user_id, request.sid)
    print(f"User {user_id} joined project {project_id}")
    return {"status": "success", "message": "Joined project room"}


@socketio.on("leave_project")
@authenticated_only
def handle_leave_project(data, user_id):
    """Leave a project room"""
    project_id = data.get("project_id")
    if not project_id:
        return {"status": "error", "message": "Project ID required"}

    # Remove user from project room
    leave_room(f"project_{project_id}")

    # Update project_rooms tracking
    if project_id in project_rooms and user_id in project_rooms[project_id]:
        project_rooms[project_id].remove(user_id)

    # Room action refreshes the presence TTL (user is still online, just left).
    _presence_set(user_id, request.sid)
    print(f"User {user_id} left project {project_id}")
    return {"status": "success", "message": "Left project room"}


# Event handlers for various notifications
@socketio.on("task_update")
@authenticated_only
def handle_task_update(data, user_id):
    """Broadcast task updates to project members"""
    project_id = data.get("project_id")
    task_id = data.get("task_id")
    update_type = data.get("update_type", "updated")  # created, updated, completed

    if not project_id or not task_id:
        return {"status": "error", "message": "Project ID and Task ID required"}

    # Emit-path membership re-check (plan §2.3): joining is not sticky proof —
    # memberships can change mid-session, so every broadcast re-verifies.
    if _membership_denied(project_id, user_id):
        return {"status": "error", "message": "You are not a member of this project"}

    # Broadcast to project room
    _safe_emit(
        "task_updated",
        {"task_id": task_id, "update_type": update_type, "updated_by": user_id, "timestamp": data.get("timestamp")},
        to=f"project_{project_id}",
    )

    return {"status": "success", "message": f"Task {update_type} notification sent"}


@socketio.on("comment_added")
@authenticated_only
def handle_comment_added(data, user_id):
    """Notify about new comments"""
    project_id = data.get("project_id")
    task_id = data.get("task_id")
    comment_id = data.get("comment_id")
    mentioned_users = data.get("mentioned_users", [])

    if not all([project_id, task_id, comment_id]):
        return {"status": "error", "message": "Missing required data"}

    # Emit-path membership re-check (plan §2.3): see handle_task_update.
    if _membership_denied(project_id, user_id):
        return {"status": "error", "message": "You are not a member of this project"}

    # Broadcast to project room
    _safe_emit(
        "new_comment",
        {"task_id": task_id, "comment_id": comment_id, "author_id": user_id, "timestamp": data.get("timestamp")},
        to=f"project_{project_id}",
    )

    # Additionally notify specifically mentioned users
    for mentioned_user in mentioned_users:
        if mentioned_user in connected_users:
            _safe_emit(
                "user_mentioned",
                {
                    "task_id": task_id,
                    "comment_id": comment_id,
                    "mentioned_by": user_id,
                    "timestamp": data.get("timestamp"),
                },
                to=connected_users[mentioned_user],
            )

    return {"status": "success", "message": "Comment notification sent"}


@socketio.on("project_updated")
@authenticated_only
def handle_project_updated(data, user_id):
    """Notify about project updates"""
    project_id = data.get("project_id")
    update_type = data.get("update_type", "updated")  # updated, member_added, etc.

    if not project_id:
        return {"status": "error", "message": "Project ID required"}

    # Emit-path membership re-check (plan §2.3): see handle_task_update.
    if _membership_denied(project_id, user_id):
        return {"status": "error", "message": "You are not a member of this project"}

    # Broadcast to project room
    _safe_emit(
        "project_update",
        {
            "project_id": project_id,
            "update_type": update_type,
            "updated_by": user_id,
            "data": data.get("data", {}),
            "timestamp": data.get("timestamp"),
        },
        to=f"project_{project_id}",
    )

    return {"status": "success", "message": f"Project {update_type} notification sent"}


def init_socketio(app):
    """Initialize SocketIO with the Flask app.

    message_queue only lands when a queue URL exists: flask_socketio treats
    the kwarg's presence (even None) as "wire up a queue manager", which
    changed handler ack behaviour in test clients. async_mode is decided per
    init (server rebuilt each init_app): prod keeps gevent (gunicorn
    geventwebsocket worker), tests force threading — the auto-picked gevent
    path silently swallows server→client pushes (get_received comes back
    empty), so any socket receipt test under pytest is dead without it.
    """
    socketio.init_app(
        app,
        cors_allowed_origins=_cors_allowed_origins(),
        async_mode="threading" if app.testing else "gevent",
        **({"message_queue": _message_queue()} if _message_queue() else {}),
    )
    return socketio
