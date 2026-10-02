import pytest
from flask import Blueprint, Flask
from flask_jwt_extended import JWTManager
from src.api.routes import github_routes


def _build_app():
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test-secret-key"
    app.config["JWT_SECRET_KEY"] = "jwt-secret-key"
    JWTManager(app)
    bp = Blueprint("testgh", __name__)
    github_routes.register_routes(bp)
    app.register_blueprint(bp)
    return app


def test_github_connect_rejects_unauthenticated_caller():
    """The account being linked is taken from the token, so a JWT is required."""
    client = _build_app().test_client()

    assert client.get("/github/connect").status_code == 401
    assert client.post("/github/connect", json={}).status_code == 401


def test_github_connect_uses_token_identity_not_body(monkeypatch):
    """A caller must not be able to name a different account in the request.

    Patched before the blueprint is registered: the @jwt_required wrapper is
    bound to the view at decoration time, so patching after would be a no-op.
    """
    monkeypatch.setattr(github_routes, "jwt_required", lambda *_a, **_k: lambda fn: fn)
    monkeypatch.setattr(github_routes, "get_jwt_identity", lambda: {"user_id": 7})

    looked_up = []

    class _Query:
        @staticmethod
        def get(user_id):
            looked_up.append(user_id)
            return None

    monkeypatch.setattr(github_routes, "User", type("User", (), {"query": _Query()}))

    response = _build_app().test_client().post("/github/connect", json={"userId": 999})

    assert looked_up == [7]
    assert response.status_code == 404
