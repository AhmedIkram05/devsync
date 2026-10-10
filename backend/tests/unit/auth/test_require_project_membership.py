import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from flask import Flask, jsonify

# Set up import path for backend package imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")))

from backend.src.auth.rbac import get_user_project_ids, require_project_membership

membership_test_app = Flask(__name__)

MODELS = "backend.src.db.models"


class _ModelMocks:
    """Patch the model layer behind the membership gate.

    db.session.get dispatches on the model mock; the project_members lookup
    returns *member_row* (left as a bare MagicMock chain when "missing").
    """

    def __init__(self, task=None, project=None, repo=None, member_row="missing", links=None):
        self.task_mock = MagicMock(name="Task")
        self.project_mock = MagicMock(name="Project")
        self.repo_mock = MagicMock(name="GitHubRepository")
        self.links_mock = MagicMock(name="TaskGitHubLink")
        self.db_mock = MagicMock(name="db")
        store = {}
        if task is not None:
            store[self.task_mock] = task
        if project is not None:
            store[self.project_mock] = project
        if repo is not None:
            store[self.repo_mock] = repo
        self.db_mock.session.get.side_effect = lambda model, _id: store.get(model)
        if member_row != "missing":
            self.db_mock.session.query.return_value.filter_by.return_value.first.return_value = member_row
        if links is not None:
            self.links_mock.query.filter_by.return_value.all.return_value = links
        self._patchers = [
            patch(f"{MODELS}.Task", self.task_mock),
            patch(f"{MODELS}.Project", self.project_mock),
            patch(f"{MODELS}.GitHubRepository", self.repo_mock),
            patch(f"{MODELS}.TaskGitHubLink", self.links_mock),
            patch(f"{MODELS}.db", self.db_mock),
        ]

    def __enter__(self):
        for patcher in self._patchers:
            patcher.start()
        return self

    def __exit__(self, *exc):
        for patcher in self._patchers:
            patcher.stop()
        return False


def _identity(user_id=1, role="developer"):
    return (
        patch("backend.src.auth.rbac.get_jwt_identity", return_value={"user_id": user_id}),
        patch("backend.src.auth.rbac.get_jwt", return_value={"role": role}),
    )


def _view():
    @require_project_membership
    def protected_endpoint(**kwargs):
        return jsonify({"ok": True}), 200

    return protected_endpoint


def _call(view, **kwargs):
    with membership_test_app.test_request_context():
        return view(**kwargs)


def test_get_user_project_ids_rejects_bad_input():
    assert get_user_project_ids(None) == set()
    assert get_user_project_ids("abc") == set()


def test_get_user_project_ids_merges_member_and_created():
    db_mock = MagicMock(name="db")
    project_mock = MagicMock(name="Project")
    db_mock.session.query.return_value.filter.return_value.all.return_value = [(5,)]
    project_mock.query.filter_by.return_value.with_entities.return_value.all.return_value = [(8,)]
    with patch(f"{MODELS}.db", db_mock), patch(f"{MODELS}.Project", project_mock):
        assert get_user_project_ids(1) == {5, 8}


def test_get_user_project_ids_fail_safe_on_db_error():
    db_mock = MagicMock(name="db")
    db_mock.session.query.side_effect = RuntimeError("db down")
    with patch(f"{MODELS}.db", db_mock):
        assert get_user_project_ids(1) == set()


def test_invalid_identity_rejected():
    id_patch, claims_patch = _identity(user_id=None)
    with id_patch, claims_patch:
        _response, status = _call(_view(), task_id=1)
    assert status == 401


def test_admin_bypasses_membership():
    id_patch, claims_patch = _identity(user_id=9, role="admin")
    with id_patch, claims_patch:
        response, status = _call(_view(), task_id=1, project_id=2, repo_id=3)
    assert status == 200
    assert response.get_json() == {"ok": True}


def test_task_missing_returns_404():
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks():
        response, status = _call(_view(), task_id=99)
    assert status == 404
    assert response.get_json() == {"message": "Task not found"}


def test_task_assignee_passes():
    task = SimpleNamespace(assigned_to=1, created_by=2, project_id=50)
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks(task=task):
        _response, status = _call(_view(), task_id=10)
    assert status == 200


def test_task_creator_passes():
    task = SimpleNamespace(assigned_to=2, created_by=1, project_id=50)
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks(task=task):
        _response, status = _call(_view(), task_id=10)
    assert status == 200


def test_task_project_member_passes():
    task = SimpleNamespace(assigned_to=2, created_by=2, project_id=50)
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks(task=task, member_row=SimpleNamespace()):
        _response, status = _call(_view(), task_id=10)
    assert status == 200


def test_task_outsider_returns_404():
    task = SimpleNamespace(assigned_to=2, created_by=2, project_id=50)
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks(task=task, member_row=None):
        response, status = _call(_view(), task_id=10)
    assert status == 404
    assert response.get_json() == {"message": "Task not found"}


def test_task_without_project_visible_to_assignee_only():
    task = SimpleNamespace(assigned_to=2, created_by=2, project_id=None)
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks(task=task, member_row=None):
        _response, status = _call(_view(), task_id=10)
    assert status == 404


def test_project_missing_returns_404():
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks():
        response, status = _call(_view(), project_id=99)
    assert status == 404
    assert response.get_json() == {"message": "Project not found"}


def test_project_member_passes():
    project = SimpleNamespace(created_by=2)
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks(project=project, member_row=SimpleNamespace()):
        _response, status = _call(_view(), project_id=11)
    assert status == 200


def test_project_creator_passes():
    project = SimpleNamespace(created_by=1)
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks(project=project, member_row=None):
        _response, status = _call(_view(), project_id=11)
    assert status == 200


def test_project_outsider_returns_403():
    project = SimpleNamespace(created_by=2)
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks(project=project, member_row=None):
        response, status = _call(_view(), project_id=11)
    assert status == 403
    assert response.get_json() == {"message": "You are not a member of this project"}


def test_repo_missing_returns_404():
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks():
        response, status = _call(_view(), repo_id=99)
    assert status == 404
    assert response.get_json() == {"message": "Repository not found"}


def test_repo_without_links_passes():
    repo = SimpleNamespace()
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch, _ModelMocks(repo=repo, links=[]):
        _response, status = _call(_view(), repo_id=70)
    assert status == 200


def test_repo_linked_project_member_passes():
    repo = SimpleNamespace()
    task = SimpleNamespace(assigned_to=2, created_by=2, project_id=50)
    id_patch, claims_patch = _identity()
    models = _ModelMocks(repo=repo, task=task, member_row=SimpleNamespace(), links=[SimpleNamespace(task_id=10)])
    with id_patch, claims_patch, models:
        _response, status = _call(_view(), repo_id=71)
    assert status == 200


def test_repo_linked_project_outsider_returns_403():
    repo = SimpleNamespace()
    task = SimpleNamespace(assigned_to=2, created_by=2, project_id=50)
    id_patch, claims_patch = _identity()
    models = _ModelMocks(repo=repo, task=task, member_row=None, links=[SimpleNamespace(task_id=10)])
    with id_patch, claims_patch, models:
        response, status = _call(_view(), repo_id=71)
    assert status == 403


def test_view_without_scope_kwargs_passes():
    id_patch, claims_patch = _identity()
    with id_patch, claims_patch:
        response, status = _call(_view())
    assert status == 200
    assert response.get_json() == {"ok": True}
