#!/bin/bash
set -e

# Run database migrations
echo "Running database migrations..."
flask db upgrade
echo "Migrations complete."

# Start Gunicorn
echo "Starting Gunicorn..."
exec gunicorn --config gunicorn.conf.py src.wsgi:app
