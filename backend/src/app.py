# This file is the entry point for the Flask application.

import os
from datetime import timedelta
from urllib.parse import urlparse

from dotenv import load_dotenv
from flask_swagger_ui import get_swaggerui_blueprint

from src.api import init_app as init_api
from src.api.middlewares import setup_middlewares
from src.config.config import (
    get_config,
    is_valid_cors_origin,
    normalize_origin,
    resolve_access_expire_minutes,
    resolve_cors_allowed_origins,
    resolve_fernet_keys,
    resolve_flask_secret,
    resolve_frontend_url,
    resolve_jwt_secret,
    resolve_oauth_state_secret,
    resolve_refresh_expire_days,
)

# Import before config-dependent modules to allow env vars to be read.
from src.db.models import db
from src.logging_config import setup_json_logging
from src.socketio_server import init_socketio

load_dotenv(override=False)

# Add the backend directory to the Python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../"))

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_migrate import Migrate

PUBLIC_ROUTES = [
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/github/callback",
    "/api/v1/github/exchange",
    "/api/v1/github/connect",
    "/health",
    "/api/docs",
    "/api/swagger.yaml",
]


def is_public_route(path):
    """Exact match or sub-path (route + '/'); naive startswith would leak."""
    if not path:
        return False
    return any(path == route or path.startswith(route + "/") for route in PUBLIC_ROUTES)


def _apply_jwt_expiry(app):
    """Derive Flask-JWT-Extended timedeltas from the single Config source."""
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
        minutes=resolve_access_expire_minutes(explicit_value=app.config.get("ACCESS_TOKEN_EXPIRE_MINUTES"))
    )
    app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(
        days=resolve_refresh_expire_days(explicit_value=app.config.get("REFRESH_TOKEN_EXPIRE_DAYS"))
    )


def create_app(config_class=None):
    setup_json_logging()
    app = Flask(__name__)
    app.config.from_object(config_class or get_config())
    app_env = os.getenv("FLASK_ENV", "development").lower()

    # Set up Swagger UI with the correct file path
    swagger_url = "/api/docs"  # URL for exposing Swagger UI
    api_url = "/api/swagger.yaml"  # Our API url where the Swagger file is served

    # Create Swagger UI blueprint
    swaggerui_blueprint = get_swaggerui_blueprint(
        swagger_url, api_url, config={"app_name": "DevSync API Documentation"}
    )

    # Register blueprint at URL
    app.register_blueprint(swaggerui_blueprint, url_prefix=swagger_url)

    # Serve the canonical Swagger file from the docs tree.
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    swagger_path = os.path.join(project_root, "docs", "backend", "swagger.yaml")

    @app.route("/api/swagger.yaml")
    def serve_swagger_spec():
        """Serve the Swagger YAML file"""
        try:
            return send_file(swagger_path, mimetype="text/yaml")
        except Exception as e:
            return jsonify({"error": f"Could not load Swagger file: {str(e)}"}), 500

    # Configure database using the selected config class/environment.
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # Configure JWT + sessions — fail-closed, distinct keys, no silent fallback.
    if isinstance(config_class, dict):
        explicit_flask = config_class.get("SECRET_KEY")
        explicit_jwt = config_class.get("JWT_SECRET_KEY")
        explicit_fernet = config_class.get("FERNET_KEYS") or config_class.get("FERNET_KEY")
        explicit_oauth = config_class.get("OAUTH_STATE_SECRET")
    else:
        explicit_flask = app.config.get("SECRET_KEY")
        explicit_jwt = app.config.get("JWT_SECRET_KEY")
        explicit_fernet = app.config.get("FERNET_KEYS") or app.config.get("FERNET_KEY")
        explicit_oauth = app.config.get("OAUTH_STATE_SECRET")
    flask_secret = resolve_flask_secret(explicit_value=explicit_flask)
    jwt_secret = resolve_jwt_secret(explicit_value=explicit_jwt)
    app.config["SECRET_KEY"] = flask_secret
    app.config["JWT_SECRET_KEY"] = jwt_secret
    # Fail fast in prod when FERNET_KEY is missing/invalid; testing derives.
    fernet_keys = resolve_fernet_keys(explicit_value=explicit_fernet, jwt_secret=jwt_secret)
    app.config["FERNET_KEYS"] = fernet_keys
    app.config["FERNET_KEY"] = fernet_keys[0]
    app.config["OAUTH_STATE_SECRET"] = resolve_oauth_state_secret(explicit_value=explicit_oauth, jwt_secret=jwt_secret)
    _apply_jwt_expiry(app)
    app.config["JWT_TOKEN_LOCATION"] = ["cookies"]
    app.config["JWT_IDENTITY_CLAIM"] = "identity"
    configured_secure = app.config.get("JWT_COOKIE_SECURE")
    if configured_secure is None:
        configured_secure = os.getenv("JWT_COOKIE_SECURE")

    if isinstance(configured_secure, str):
        jwt_cookie_secure = configured_secure.strip().lower() in {"1", "true", "yes", "on"}
    elif isinstance(configured_secure, bool):
        jwt_cookie_secure = configured_secure
    elif configured_secure is None:
        jwt_cookie_secure = app_env == "production"
    else:
        jwt_cookie_secure = bool(configured_secure)

    app.config["JWT_COOKIE_SECURE"] = jwt_cookie_secure

    configured_samesite = app.config.get("JWT_COOKIE_SAMESITE")
    if configured_samesite is None:
        configured_samesite = os.getenv("JWT_COOKIE_SAMESITE")

    if configured_samesite:
        normalized_samesite = str(configured_samesite).strip().lower()
        if normalized_samesite == "none":
            app.config["JWT_COOKIE_SAMESITE"] = "None"
        elif normalized_samesite == "strict":
            app.config["JWT_COOKIE_SAMESITE"] = "Strict"
        else:
            app.config["JWT_COOKIE_SAMESITE"] = "Lax"
    else:
        app.config["JWT_COOKIE_SAMESITE"] = "None" if jwt_cookie_secure else "Lax"

    if app.config["JWT_COOKIE_SAMESITE"] == "None" and not app.config["JWT_COOKIE_SECURE"]:
        raise ValueError('JWT_COOKIE_SAMESITE="None" requires JWT_COOKIE_SECURE to be True')

    app.config["JWT_COOKIE_CSRF_PROTECT"] = True

    # Apply any override configurations
    if config_class:
        app.config.update(config_class)

    # Re-validate after overrides so a dict cannot inject a default/empty secret.
    flask_secret = resolve_flask_secret(explicit_value=app.config.get("SECRET_KEY"))
    jwt_secret = resolve_jwt_secret(explicit_value=app.config.get("JWT_SECRET_KEY"))
    app.config["SECRET_KEY"] = flask_secret
    app.config["JWT_SECRET_KEY"] = jwt_secret
    fernet_keys = resolve_fernet_keys(
        explicit_value=app.config.get("FERNET_KEYS") or app.config.get("FERNET_KEY"),
        jwt_secret=jwt_secret,
    )
    app.config["FERNET_KEYS"] = fernet_keys
    app.config["FERNET_KEY"] = fernet_keys[0]
    app.config["OAUTH_STATE_SECRET"] = resolve_oauth_state_secret(
        explicit_value=app.config.get("OAUTH_STATE_SECRET"), jwt_secret=jwt_secret
    )
    # Re-derive expiries after dict overrides so minutes/days stay single-sourced.
    _apply_jwt_expiry(app)

    # Initialize extensions
    db.init_app(app)
    Migrate(app, db)
    jwt = JWTManager(app)

    explicit_allowed_origins = {
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://devsyncapp.me",
        "https://www.devsyncapp.me",
    }

    frontend_url = app.config.get("FRONTEND_URL") or os.getenv("FRONTEND_URL")
    if frontend_url:
        token = frontend_url.strip()
        if not is_valid_cors_origin(token):
            raise ValueError(f"Invalid FRONTEND_URL: {frontend_url!r}. Must be like https://example.com")
        parsed_frontend_url = urlparse(token)
        if (
            app_env == "production"
            and parsed_frontend_url.scheme != "https"
            and (parsed_frontend_url.hostname or "").lower() not in {"localhost", "127.0.0.1", "::1"}
        ):
            raise ValueError("FRONTEND_URL must use https in production")
        explicit_allowed_origins.add(normalize_origin(token))
    # Re-validate resolved value so a dict override cannot inject '*'/bad origin.
    resolved_frontend = resolve_frontend_url(env=app_env)
    if resolved_frontend:
        explicit_allowed_origins.add(resolved_frontend)

    for extra in resolve_cors_allowed_origins():
        explicit_allowed_origins.add(extra)

    CORS(
        app,
        supports_credentials=True,
        allow_headers=["Content-Type", "X-CSRF-TOKEN", "X-Requested-With"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        origins=sorted(explicit_allowed_origins),
        expose_headers=["Content-Type", "X-CSRF-TOKEN"],
        max_age=600,
    )

    @app.after_request
    def ensure_vary_origin(response):
        if request.headers.get("Origin"):
            vary = response.headers.get("Vary", "")
            if "Origin" not in vary:
                response.headers["Vary"] = f"{vary}, Origin" if vary else "Origin"
        return response

    # Preflight OPTIONS is handled by Flask-CORS on registered routes; a
    # catch-all OPTIONS rule would turn GETs to unknown paths into 405 (then
    # 500), so it is deliberately omitted here.

    # JWT error handlers
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return {"status": 401, "message": "The authentication token has expired", "error": "token_expired"}, 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return {"status": 401, "message": "Invalid authentication token", "error": "token_invalid"}, 401

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return {"status": 401, "message": "Authentication token is missing", "error": "authorization_required"}, 401

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        # Refresh reuse detection (fail-closed): a revoked refresh jti
        # presented again revokes every user token + audits, then 401s.
        if jwt_payload.get("type") == "refresh":
            try:
                from src.auth.token_blocklist import revoke_all_user_tokens

                identity = jwt_payload.get("identity", jwt_payload.get("sub"))
                user_id = identity.get("user_id") if isinstance(identity, dict) else identity
                if user_id is not None:
                    revoke_all_user_tokens(user_id)
                try:
                    from src.services import audit_service

                    audit_service.record(
                        action="refresh_reuse_detected",
                        actor={"user_id": user_id, "role": jwt_payload.get("role")},
                        resource_type="user",
                        resource_id=user_id,
                    )
                except Exception:
                    app.logger.warning("refresh reuse audit failed", exc_info=True)
            except Exception as exc:
                app.logger.warning("refresh reuse revocation failed: %s", exc)
        return {"status": 401, "message": "The authentication token has been revoked", "error": "token_revoked"}, 401

    # Modified exempt function to correctly bypass JWT and auth checks for public routes
    @jwt.token_in_blocklist_loader
    def check_if_token_is_revoked(jwt_header, jwt_payload):
        # Fail-open for availability: backend errors log + metric and allow
        # the request; refresh rotation itself is fail-closed on reuse.
        try:
            from src.auth.token_blocklist import is_token_revoked

            return is_token_revoked(jwt_payload)
        except Exception as exc:
            app.logger.warning("blocklist check failed (fail-open): %s", exc)
            return False

    @app.before_request
    def handle_auth_exemptions():
        if request.method == "OPTIONS" or is_public_route(request.path):
            return None

    # Initialize API routes (including auth routes)
    init_api(app)

    # Setup middlewares (error handlers, logging, rate limiting)
    setup_middlewares(app)

    # Initialize Socket.IO
    socketio = init_socketio(app)

    @app.route("/")
    def index():
        return "DevSync API is running"

    @app.route("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    return app, socketio


if __name__ == "__main__":
    app, socketio = create_app()
