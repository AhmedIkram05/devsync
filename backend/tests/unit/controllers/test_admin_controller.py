from types import SimpleNamespace
from unittest.mock import MagicMock, patch


@patch('backend.src.api.controllers.admin_controller.Task')
@patch('backend.src.api.controllers.admin_controller.Project')
@patch('backend.src.api.controllers.admin_controller.User')
def test_get_system_stats_counts_roles_statuses(mock_user, mock_project, mock_task, app):
    mock_user.query.all.return_value = [
        SimpleNamespace(role='admin'),
        SimpleNamespace(role='team_lead'),
        SimpleNamespace(role='developer'),
        SimpleNamespace(role='developer'),
    ]
    mock_project.query.all.return_value = [
        SimpleNamespace(status='active'),
        SimpleNamespace(status='completed'),
        SimpleNamespace(status='on_hold'),
    ]
    mock_task.query.all.return_value = [
        SimpleNamespace(status='todo'),
        SimpleNamespace(status='in_progress'),
        SimpleNamespace(status='review'),
        SimpleNamespace(status='done'),
        SimpleNamespace(status='completed'),
    ]

    with app.app_context():
        from backend.src.api.controllers.admin_controller import get_system_stats

        response = get_system_stats()
        data = response.get_json()

    assert data['users']['total'] == 4
    assert data['users']['admins'] == 1
    assert data['users']['team_leads'] == 1
    assert data['users']['developers'] == 2
    assert data['projects']['active'] == 1
    assert data['projects']['completed'] == 1
    assert data['projects']['on_hold'] == 1
    assert data['tasks']['todo'] == 1
    assert data['tasks']['in_progress'] == 1
    assert data['tasks']['review'] == 1
    assert data['tasks']['done'] == 2


@patch('backend.src.api.controllers.admin_controller.Task')
@patch('backend.src.api.controllers.admin_controller.Project')
@patch('backend.src.api.controllers.admin_controller.User')
def test_get_system_stats_handles_query_errors(mock_user, mock_project, mock_task, app):
    mock_user.query.all.side_effect = Exception('users failed')
    mock_project.query.all.side_effect = Exception('projects failed')
    mock_task.query.all.side_effect = Exception('tasks failed')

    with app.app_context():
        from backend.src.api.controllers.admin_controller import get_system_stats

        response = get_system_stats()
        data = response.get_json()

    assert data['users']['total'] == 0
    assert data['projects']['total'] == 0
    assert data['tasks']['total'] == 0


@patch('backend.src.api.controllers.admin_controller.settings_service.get_settings', return_value={'default_user_role': 'developer'})
def test_get_system_settings(mock_get_settings, app):
    with app.app_context():
        from backend.src.api.controllers.admin_controller import get_system_settings

        response = get_system_settings()

    assert response.get_json() == {'settings': {'default_user_role': 'developer'}}
    mock_get_settings.assert_called_once()


@patch('backend.src.api.controllers.admin_controller.validate_system_settings')
def test_update_system_settings_validation_error(mock_validate, app):
    mock_validate.return_value = ({'message': 'bad settings'}, 400)

    with app.test_request_context('/admin/settings', method='PUT', json={'allow_self_registration': True}):
        from backend.src.api.controllers.admin_controller import update_system_settings

        result = update_system_settings()

    assert result == ({'message': 'bad settings'}, 400)


@patch('backend.src.api.controllers.admin_controller.emit_dashboard_refresh')
@patch('backend.src.api.controllers.admin_controller.audit_service.record')
@patch('backend.src.api.controllers.admin_controller.settings_service.update_settings')
@patch('backend.src.api.controllers.admin_controller.get_jwt_identity', return_value={'user_id': 7})
@patch('backend.src.api.controllers.admin_controller.validate_system_settings', return_value=None)
def test_update_system_settings_success(mock_validate, mock_identity, mock_update_settings, mock_audit_record, mock_emit, app):
    payload = {'allow_self_registration': False, 'audit_log_retention_days': 14}

    with app.test_request_context('/admin/settings', method='PUT', json=payload):
        from backend.src.api.controllers.admin_controller import update_system_settings

        response = update_system_settings()
        data = response.get_json()

    assert data['message'] == 'System settings updated successfully'
    assert data['settings'] == payload
    mock_update_settings.assert_called_once_with(payload, 7)
    mock_audit_record.assert_called_once()
    mock_emit.assert_called_once()


@patch('backend.src.api.controllers.admin_controller.emit_dashboard_refresh')
@patch('backend.src.api.controllers.admin_controller.audit_service.record')
@patch('backend.src.api.controllers.admin_controller.settings_service.update_settings')
@patch('backend.src.api.controllers.admin_controller.get_jwt_identity', return_value=7)
@patch('backend.src.api.controllers.admin_controller.validate_system_settings', return_value=None)
def test_update_system_settings_success_with_scalar_identity(mock_validate, mock_identity, mock_update_settings, mock_audit_record, mock_emit, app):
    payload = {'allow_self_registration': True}

    with app.test_request_context('/admin/settings', method='PUT', json=payload):
        from backend.src.api.controllers.admin_controller import update_system_settings

        response = update_system_settings()
        data = response.get_json()

    assert data['message'] == 'System settings updated successfully'
    mock_update_settings.assert_called_once_with(payload, 7)
    mock_audit_record.assert_called_once()
    mock_emit.assert_called_once()


@patch('backend.src.api.controllers.admin_controller.User')
def test_update_user_role_not_found(mock_user, app):
    mock_user.query.get.return_value = None

    with app.test_request_context('/admin/users/8/role', method='PUT', json={'role': 'developer'}):
        from backend.src.api.controllers.admin_controller import update_user_role

        response, status = update_user_role(8)

    assert status == 404
    assert response.get_json()['message'] == 'User not found'


@patch('backend.src.api.controllers.admin_controller.User')
@patch('backend.src.api.controllers.admin_controller.validate_user_role_update')
def test_update_user_role_validation_error(mock_validate, mock_user, app):
    mock_user.query.get.return_value = SimpleNamespace(id=8, role='developer', name='U', email='u@test.com')
    mock_validate.return_value = ({'message': 'invalid role'}, 400)

    with app.test_request_context('/admin/users/8/role', method='PUT', json={'role': 'bad'}):
        from backend.src.api.controllers.admin_controller import update_user_role

        result = update_user_role(8)

    assert result == ({'message': 'invalid role'}, 400)


@patch('backend.src.api.controllers.admin_controller.emit_dashboard_refresh')
@patch('backend.src.api.controllers.admin_controller.audit_service.record')
@patch('backend.src.api.controllers.admin_controller.db')
@patch('backend.src.api.controllers.admin_controller.User')
@patch('backend.src.api.controllers.admin_controller.validate_user_role_update', return_value=None)
def test_update_user_role_success(mock_validate, mock_user, mock_db, mock_audit_record, mock_emit, app):
    user = SimpleNamespace(id=8, role='developer', name='Dev', email='dev@test.com')
    mock_user.query.get.return_value = user

    with app.test_request_context('/admin/users/8/role', method='PUT', json={'role': 'team_lead'}):
        from backend.src.api.controllers.admin_controller import update_user_role

        response = update_user_role(8)
        data = response.get_json()

    assert data['message'] == 'User role updated successfully'
    assert data['user']['role'] == 'team_lead'
    assert user.role == 'team_lead'
    mock_db.session.commit.assert_called_once()
    mock_audit_record.assert_called_once()
    mock_emit.assert_called_once()
