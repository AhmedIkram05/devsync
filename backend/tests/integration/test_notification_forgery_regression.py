"""P0 regression: POST /notifications cannot forge another user's notification."""

import os
import sys

import pytest
from flask_jwt_extended import create_access_token, get_csrf_token

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.app import create_app
from src.db.models import Notification, User, db


@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "testing")
    app, socketio = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "JWT_SECRET_KEY": "test-secret-key-for-notification-regression",
            "JWT_COOKIE_SECURE": False,
            "JWT_COOKIE_SAMESITE": "Lax",
        }
    )
    return app, socketio


@pytest.fixture
def app(app_and_socket):
    app, _ = app_and_socket
    return app


@pytest.fixture
def seeded(app):
    with app.app_context():
        db.create_all()
        db.session.add_all(
            [
                User(id=1, name="Dev One", email="dev1@example.com", password="x", role="developer"),
                User(id=2, name="Dev Two", email="dev2@example.com", password="x", role="developer"),
                User(id=3, name="Lead", email="lead@example.com", password="x", role="team_lead"),
            ]
        )
        db.session.commit()
    return app


def _authed_client(app, user_id, role):
    client = app.test_client()
    with app.app_context():
        token = create_access_token(identity={"user_id": user_id}, additional_claims={"role": role})
        csrf = get_csrf_token(token)
    client.set_cookie("access_token_cookie", token)
    client.set_cookie("csrf_access_token", csrf)
    return client, {"X-CSRF-TOKEN": csrf}


def _count_for(app, user_id):
    with app.app_context():
        return Notification.query.filter_by(user_id=user_id).count()


def test_developer_forged_target_forced_to_self(app, seeded):
    client, headers = _authed_client(app, 1, "developer")
    resp = client.post("/api/v1/notifications", headers=headers, json={"content": "hello", "user_id": 2})
    assert resp.status_code == 201
    assert _count_for(app, 1) == 1
    assert _count_for(app, 2) == 0


def test_developer_without_target_notifies_self(app, seeded):
    client, headers = _authed_client(app, 1, "developer")
    resp = client.post("/api/v1/notifications", headers=headers, json={"content": "hello"})
    assert resp.status_code == 201
    assert _count_for(app, 1) == 1


def test_team_lead_may_target_other_user(app, seeded):
    client, headers = _authed_client(app, 3, "team_lead")
    resp = client.post("/api/v1/notifications", headers=headers, json={"content": "hello", "user_id": 2})
    assert resp.status_code == 201
    assert _count_for(app, 2) == 1
    assert _count_for(app, 3) == 0
