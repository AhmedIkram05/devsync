import os
import sys

# Add the backend directory to the Python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from src.app import create_app

# Create the application object for Gunicorn
app, socketio = create_app()

# Under the gevent worker (gunicorn.conf.py), sockets/time are monkey-patched
# but psycopg2 is not — every DB roundtrip would block the worker's event
# loop and throttle socket concurrency. Gunicorn loads the app inside each
# gevent worker AFTER monkey-patching, so this import point is post-patch and
# runs once per worker. Non-gevent processes (dev server, tests, migration
# jobs) skip the patch entirely.
try:
    from gevent.monkey import is_module_patched

    if is_module_patched("socket"):
        from psycogreen.gevent import patch_psycopg

        patch_psycopg()
except ImportError:
    pass  # gevent/psycogreen not installed — threading mode needs no patch

if __name__ == "__main__":
    app.run()
