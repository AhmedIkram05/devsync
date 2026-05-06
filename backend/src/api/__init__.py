"""API package initialization"""

from flask import Blueprint

# Create main API blueprint
api_bp = Blueprint('api', __name__, url_prefix='/api/v1')

# Import routes to register them with blueprint
from .routes import auth_routes, users_routes, projects_routes, tasks_routes, comments_routes, notifications_routes, dashboard_routes, admin_routes, github_routes

# Register all routes with the blueprint
auth_routes.register_routes(api_bp)
users_routes.register_routes(api_bp)
projects_routes.register_routes(api_bp)
tasks_routes.register_routes(api_bp)
comments_routes.register_routes(api_bp)
notifications_routes.register_routes(api_bp)
dashboard_routes.register_routes(api_bp)
admin_routes.register_routes(api_bp)
from .routes import report_routes

report_routes.register_routes(api_bp)
github_routes.register_routes(api_bp)  # Add GitHub routes

def init_app(app):
    """Register the API blueprint with the Flask app"""
    app.register_blueprint(api_bp)
