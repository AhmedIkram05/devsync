import os
import sys

# Add the backend directory to the Python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from src.app import create_app

# Create the application object for Gunicorn
app, socketio = create_app()

if __name__ == "__main__":
    app.run()
