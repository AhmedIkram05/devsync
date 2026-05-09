import os
import sys
import pytest
from flask_jwt_extended import create_access_token
from unittest.mock import MagicMock

# Add backend directory to import src.* modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.app import create_app
from src.api.routes import admin_routes
from src.api.controllers import users_controller
from src.db.models import (
    AuditLog,
    Comment,
    GitHubToken,
    Notification,
    Project,
    Report,
    SystemSetting,
    Task,
    User,
    db,
)
from src.services.notification_service import NotificationService

@pytest.fixture
def app_and_socket(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'testing')
    app, socketio = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'JWT_SECRET_KEY': 'test-secret-key-for-integration-suite-32',
        'JWT_COOKIE_SECURE': False,
        'JWT_COOKIE_SAMESITE': 'Lax',
    })
    return app, socketio

@pytest.fixture
def app(app_and_socket):
    app, _ = app_and_socket
    return app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def auth_headers(app):
    def _auth_headers(role, user_id=1):
        with app.app_context():
            token = create_access_token(
                identity={'user_id': user_id},
                additional_claims={'role': role}
            )
        return {'Authorization': f'Bearer {token}'}
    return _auth_headers

def test_admin_create_user_rbac(client, app, auth_headers, monkeypatch):
    """Test that only admins can create users via the admin endpoint"""
    handler = MagicMock(return_value=({'message': 'User created', 'user': {'id': 2}}, 201))
    monkeypatch.setattr(admin_routes, 'create_user', handler)

    user_data = {
        'name': 'New User',
        'email': 'new@example.com',
        'password': 'password123',
        'role': 'developer'
    }

    # 1. Developer should be forbidden
    resp = client.post('/api/v1/admin/users', json=user_data, headers=auth_headers('developer'))
    assert resp.status_code == 403
    
    # 2. Team Lead should be forbidden
    resp = client.post('/api/v1/admin/users', json=user_data, headers=auth_headers('team_lead'))
    assert resp.status_code == 403

    # 3. Admin should be allowed
    resp = client.post('/api/v1/admin/users', json=user_data, headers=auth_headers('admin'))
    assert resp.status_code == 201
    assert resp.get_json()['message'] == 'User created'
    assert handler.call_count == 1

def test_admin_get_users_rbac(client, app, auth_headers, monkeypatch):
    """Test that both admins and team leads can view the user list"""
    handler = MagicMock(return_value=({'users': []}, 200))
    monkeypatch.setattr(admin_routes, 'get_all_users', handler)

    # 1. Developer should be forbidden
    resp = client.get('/api/v1/admin/users', headers=auth_headers('developer'))
    assert resp.status_code == 403

    # 2. Team Lead should be allowed
    resp = client.get('/api/v1/admin/users', headers=auth_headers('team_lead'))
    assert resp.status_code == 200

    # 3. Admin should be allowed
    resp = client.get('/api/v1/admin/users', headers=auth_headers('admin'))
    assert resp.status_code == 200
    assert handler.call_count == 2

def test_admin_delete_user_rbac(client, app, auth_headers, monkeypatch):
    """Test that only admins can delete users"""
    handler = MagicMock(return_value=({'message': 'User deleted'}, 200))
    monkeypatch.setattr(admin_routes, 'delete_user', handler)

    # 1. Team Lead should be forbidden
    resp = client.delete('/api/v1/admin/users/2', headers=auth_headers('team_lead'))
    assert resp.status_code == 403

    # 2. Admin should be allowed
    resp = client.delete('/api/v1/admin/users/2', headers=auth_headers('admin'))
    assert resp.status_code == 200
    assert handler.call_count == 1


def test_admin_delete_user_cleans_dependencies(client, app, auth_headers, monkeypatch):
    """Deleting a user should clean up dependent rows instead of failing on FK constraints."""
    monkeypatch.setattr(users_controller.audit_service, 'record', lambda *args, **kwargs: None)
    monkeypatch.setattr(users_controller, 'emit_dashboard_refresh', lambda *args, **kwargs: None)
    monkeypatch.setattr(NotificationService, 'user_crud_notification', lambda *args, **kwargs: None)

    with app.app_context():
        db.create_all()
        try:
            admin = User(
                name='Admin User',
                email='admin-delete@example.com',
                password='password',
                role='admin',
            )
            target = User(
                name='Target User',
                email='target-delete@example.com',
                password='password',
                role='developer',
            )
            db.session.add_all([admin, target])
            db.session.commit()

            project = Project(
                name='Cleanup Project',
                description='Project owned by the target user',
                status='active',
                created_by=target.id,
            )
            task = Task(
                title='Cleanup Task',
                description='Task owned by the target user',
                status='todo',
                created_by=target.id,
                assigned_to=target.id,
                project=project,
            )
            db.session.add_all([project, task])
            db.session.commit()

            project.team_members.append(target)
            comment = Comment(task_id=task.id, user_id=target.id, content='Target comment')
            notification = Notification(
                user_id=target.id,
                notification_type='task_assigned',
                title='Task assigned',
                message='Assigned to target user',
            )
            token = GitHubToken(
                user_id=target.id,
                access_token='token-123',
                refresh_token='refresh-123',
            )
            report = Report(
                user_id=target.id,
                report_type='tasks',
                date_range='week',
                summary={},
                details=[],
            )
            audit_log = AuditLog(
                actor_user_id=target.id,
                actor_role='developer',
                action='user_login',
                resource_type='user',
                resource_id=str(target.id),
            )
            system_setting = SystemSetting(
                key='cleanup_setting',
                value={'enabled': True},
                updated_by=target.id,
            )
            db.session.add_all([comment, notification, token, report, audit_log, system_setting])
            db.session.commit()

            comment_id = comment.id
            notification_id = notification.id
            token_id = token.id
            report_id = report.id
            audit_log_id = audit_log.id
            system_setting_key = system_setting.key

            resp = client.delete(
                f'/api/v1/admin/users/{target.id}',
                headers=auth_headers('admin', user_id=admin.id),
            )

            assert resp.status_code == 200
            assert resp.get_json()['message'] == 'User deleted successfully'

            remaining_project = db.session.get(Project, project.id)
            remaining_task = db.session.get(Task, task.id)

            assert db.session.get(User, target.id) is None
            assert remaining_task.created_by == admin.id
            assert remaining_task.assigned_to is None
            assert remaining_project.created_by == admin.id
            assert target not in remaining_project.team_members
            assert db.session.get(Comment, comment_id) is None
            assert db.session.get(Notification, notification_id) is None
            assert db.session.get(GitHubToken, token_id) is None
            assert db.session.get(Report, report_id) is None
            assert db.session.get(AuditLog, audit_log_id).actor_user_id is None
            assert db.session.get(SystemSetting, system_setting_key).updated_by is None
        finally:
            db.session.remove()
            db.drop_all()
