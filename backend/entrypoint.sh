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

if [ "${DB_BOOTSTRAP_FALLBACK:-false}" = "true" ]; then
    echo "DB_BOOTSTRAP_FALLBACK enabled; verifying database bootstrap..."
    python -c "
from sqlalchemy import inspect
from src.app import create_app
from src.db.models import db
from src.db.scripts.setup_database import setup_database

app, socketio = create_app()
with app.app_context():
    inspector = inspect(db.engine)
    if not inspector.has_table('users'):
        print('users table missing after migrations; running setup_database bootstrap...')
        if not setup_database():
            raise RuntimeError('Database bootstrap failed')
    else:
        print('users table exists; skipping bootstrap.')
"
    echo "Database bootstrap verification complete."
else
    echo "DB_BOOTSTRAP_FALLBACK disabled; skipping bootstrap fallback."
fi

echo "Starting Gunicorn..."
exec gunicorn --config gunicorn.conf.py src.wsgi:app