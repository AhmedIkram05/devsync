"""API routes package initialisation"""

# Import route modules for easy access

# These should be relative imports
from . import (
    admin_routes,
    audit_routes,
    auth_routes,
    comments_routes,
    dashboard_routes,
    github_routes,
    notifications_routes,
    projects_routes,
    tasks_routes,
    users_routes,
)

"""API routes registration"""

from flask import Blueprint


def register_all_routes(app):
    """Register all API routes with the Flask application"""
    api_bp = Blueprint("api", __name__)

    # Register routes with blueprint
    auth_routes.register_routes(api_bp)
    users_routes.register_routes(api_bp)
    projects_routes.register_routes(api_bp)
    tasks_routes.register_routes(api_bp)
    comments_routes.register_routes(api_bp)
    dashboard_routes.register_routes(api_bp)
    admin_routes.register_routes(api_bp)
    notifications_routes.register_routes(api_bp)
    github_routes.register_routes(api_bp)
    audit_routes.register_routes(api_bp)

    # Register blueprint with app
    app.register_blueprint(api_bp, url_prefix="/api")
