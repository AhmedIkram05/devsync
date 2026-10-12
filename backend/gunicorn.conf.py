# Gunicorn configuration for Flask-SocketIO with gevent
import os

bind = "0.0.0.0:8000"
# Multi-worker is enabled by the Redis message queue (REDIS_URL): each worker
# runs its own Socket.IO server and rooms fan out across processes, so
# "1 worker unless message queue" is satisfied. Env-driven so pr/port-forward
# envs and CI can stay at 1 while prod scales in-pod (GKE ConfigMap).
workers = int(os.environ.get("GUNICORN_WORKERS", "1"))
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"

# Logging: "-" for accesslog is stdout; errorlog "-" would be stderr, which
# GKE labels ERROR no matter the level. Route gunicorn's own logs to stdout.
accesslog = "-"
errorlog = "/dev/stdout"
loglevel = "info"

# Timeout
timeout = 120
keepalive = 5
