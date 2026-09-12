# Gunicorn configuration for Flask-SocketIO with gevent
bind = "0.0.0.0:8000"
workers = 1  # For Socket.IO, it's usually best to start with 1 worker unless using a message queue
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"

# Logging: "-" for accesslog is stdout; errorlog "-" would be stderr, which
# GKE labels ERROR no matter the level. Route gunicorn's own logs to stdout.
accesslog = "-"
errorlog = "/dev/stdout"
loglevel = "info"

# Timeout
timeout = 120
keepalive = 5
