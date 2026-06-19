import os
import sys
from unittest.mock import patch

import pytest
from flask import Flask

# Add the backend directory (parent of tests) to sys.path so that "src" can be imported
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(scope="session")
def app():
    """Create and configure a Flask app for testing"""
    app = Flask(__name__)
    app.config.update(
        {
            "TESTING": True,
            "SECRET_KEY": "test_secret_key",
            "JWT_SECRET_KEY": "test_jwt_secret",
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "SQLALCHEMY_TRACK_MODIFICATIONS": False,
            "JWT_TOKEN_LOCATION": ["headers"],
        }
    )

    # Register routes
    with app.app_context():
        # We're not initializing the full app with all routes
        # to avoid database connections during unit tests
        pass

    yield app


@pytest.fixture
def client(app):
    """Create a test client for the app"""
    return app.test_client()


@pytest.fixture
def runner(app):
    """Create a test CLI runner for the app"""
    return app.test_cli_runner()
