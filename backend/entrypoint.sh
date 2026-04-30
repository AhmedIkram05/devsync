#!/bin/sh
set -e

echo "Running migrations..."
flask --app src.app:create_app db upgrade

echo "Starting app..."
exec gunicorn src.wsgi:app --bind 0.0.0.0:8000