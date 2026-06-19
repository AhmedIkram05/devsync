from flask import Blueprint, Flask
from src.api.routes import github_routes


def test_github_connect_requires_user_id():
    app = Flask(__name__)
    bp = Blueprint('testgh', __name__)
    github_routes.register_routes(bp)
    app.register_blueprint(bp)

    client = app.test_client()
    r = client.get('/github/connect')
    assert r.status_code == 400
    data = r.get_json()
    assert data and 'error' in data
