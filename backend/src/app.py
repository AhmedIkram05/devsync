# This file is the entry point for the Flask application.

import os
import re
import sys
from urllib.parse import urlparse
from dotenv import load_dotenv

from flask_swagger_ui import get_swaggerui_blueprint

# Add the backend directory to the Python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../"))
sys.path.insert(0, backend_dir)

# Handle both relative imports for package and absolute imports for direct execution
if __name__ == '__main__':
    from src.db.models import db
    from src.config.config import get_config
    from src.api import init_app as init_api
    from src.api.middlewares import setup_middlewares
    from src.socketio_server import init_socketio
else:
    from .db.models import db
    from .config.config import get_config
    from .api import init_app as init_api
    from .api.middlewares import setup_middlewares
    from .socketio_server import init_socketio

from datetime import timedelta
from flask import Flask, request, jsonify, make_response, send_file, abort
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS

# Load environment variables
load_dotenv(override=True)

def create_app(config_class=None):
    app = Flask(__name__)
    app.config.from_object(config_class or get_config())
    
    # Set up Swagger UI with the correct file path
    SWAGGER_URL = '/api/docs'  # URL for exposing Swagger UI
    API_URL = '/api/swagger.yaml'  # Our API url where the Swagger file is served
    
    # Create Swagger UI blueprint
    swaggerui_blueprint = get_swaggerui_blueprint(
        SWAGGER_URL,
        API_URL,
        config={
            'app_name': "DevSync API Documentation"
        }
    )
    
    # Register blueprint at URL
    app.register_blueprint(swaggerui_blueprint, url_prefix=SWAGGER_URL)
    
    # Make sure the directory exists for the swagger file
    swagger_dir = os.path.join(os.path.dirname(__file__), 'api')
    os.makedirs(swagger_dir, exist_ok=True)
    swagger_path = os.path.join(swagger_dir, 'swagger.yaml')
    
    @app.route('/api/swagger.yaml')
    def serve_swagger_spec():
        """Serve the Swagger YAML file"""
        try:
            return send_file(swagger_path, mimetype='text/yaml')
        except Exception as e:
            return jsonify({"error": f"Could not load Swagger file: {str(e)}"}), 500
    
    # Configure database using the selected config class/environment.
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # Configure JWT
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-super-secret-key-for-development-only')
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")))
    app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)
    app.config["JWT_TOKEN_LOCATION"] = ["cookies", "headers"]
    
    app.config["JWT_COOKIE_SECURE"] = True
    app.config["JWT_COOKIE_CSRF_PROTECT"] = False
    app.config["JWT_COOKIE_SAMESITE"] = None
    
    # Apply any override configurations
    if config_class:
        app.config.update(config_class)
    
    # Initialize extensions
    db.init_app(app)
    migrate = Migrate(app, db)
    jwt = JWTManager(app)

    explicit_allowed_origins = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }

    frontend_url = app.config.get('FRONTEND_URL') or os.getenv('FRONTEND_URL')
    if frontend_url:
        parsed_frontend_url = urlparse(frontend_url)
        if parsed_frontend_url.scheme and parsed_frontend_url.netloc:
            explicit_allowed_origins.add(f"{parsed_frontend_url.scheme}://{parsed_frontend_url.netloc}")

    extra_origins = os.getenv('CORS_ALLOWED_ORIGINS', '')
    if extra_origins:
        explicit_allowed_origins.update(
            origin.strip() for origin in extra_origins.split(',') if origin.strip()
        )

    allowed_origin_patterns = (
        r'^https?://192\.168\.\d+\.\d+(:\d+)?$',
        r'^https?://10\.\d+\.\d+\.\d+(:\d+)?$',
        r'^https?://172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$',
    )

    def is_allowed_origin(origin):
        return (
            origin in explicit_allowed_origins or
            any(re.match(pattern, origin) for pattern in allowed_origin_patterns)
        )
    
    CORS(app, 
         supports_credentials=True,
         allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
         origins=list(explicit_allowed_origins) + list(allowed_origin_patterns),
         expose_headers=["Content-Type", "Authorization"],
         max_age=600)
    
    @app.after_request
    def add_cors_headers(response):
        # Only add headers if they don't already exist
        origin = request.headers.get('Origin')
        if origin and is_allowed_origin(origin):
            # Check if header already exists (added by Flask-CORS)
            if 'Access-Control-Allow-Origin' not in response.headers:
                response.headers.add('Access-Control-Allow-Origin', origin)
            if 'Access-Control-Allow-Headers' not in response.headers:
                response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
            if 'Access-Control-Allow-Methods' not in response.headers:
                response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH')
            if 'Access-Control-Allow-Credentials' not in response.headers:
                response.headers.add('Access-Control-Allow-Credentials', 'true')
            if 'Access-Control-Max-Age' not in response.headers:
                response.headers.add('Access-Control-Max-Age', '600')
        return response

    # Simplify options handler to prevent duplicate headers
    @app.route('/', methods=['OPTIONS'])
    @app.route('/<path:path>', methods=['OPTIONS', 'GET'])
    def options_handler(path=None):
        if request.method == 'GET':
            abort(404)
        response = make_response()
        # We don't add CORS headers here, the after_request will handle it
        return response
    
    # JWT error handlers
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return {
            'status': 401,
            'message': 'The authentication token has expired',
            'error': 'token_expired'
        }, 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return {
            'status': 401,
            'message': 'Invalid authentication token',
            'error': 'token_invalid'
        }, 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return {
            'status': 401,
            'message': 'Authentication token is missing',
            'error': 'authorization_required'
        }, 401
    
    # Modified exempt function to correctly bypass JWT and auth checks for public routes
    @jwt.token_in_blocklist_loader
    def check_if_token_is_revoked(jwt_header, jwt_payload):
        return False
    
    # Define public routes that don't need authentication
    public_routes = [
        '/',
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/github/callback',
        '/api/v1/github/exchange',
        '/api/v1/github/connect',
        '/api/docs',
        '/api/swagger.yaml'
    ]
    
    # Middleware to remove Flask-JWT auth requirements for public routes
    @app.before_request
    def handle_auth_exemptions():
        path = request.path

        # Skip JWT verification for OPTIONS requests and public routes
        if request.method == 'OPTIONS' or any(path.startswith(route) for route in public_routes):
            return None
    
    # Initialize API routes (including auth routes)
    init_api(app)
    
    # Setup middlewares (error handlers, logging, rate limiting)
    setup_middlewares(app)
    
    # Initialize Socket.IO
    socketio = init_socketio(app)
    
    @app.route('/')
    def index():
        return "DevSync API is running"
    
    return app, socketio

if __name__ == '__main__':
    app, socketio = create_app()
    # Use socketio.run instead of app.run
    socketio.run(app, debug=True, host='0.0.0.0', port=8000)
