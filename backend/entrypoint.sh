#!/bin/bash
set -e

echo "Running database migrations..."
python -c "
from src.app import create_app
from flask_migrate import upgrade
app, socketio = create_app()
with app.app_context():
    upgrade()
"
echo "Migrations complete."

echo "Starting Gunicorn..."
exec gunicorn --config gunicorn.conf.py src.wsgi:app