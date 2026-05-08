from types import SimpleNamespace
from unittest.mock import MagicMock, patch


@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'admin', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.validate_report_data', return_value=({'message': 'bad'}, 400))
def test_save_report_validation_error(mock_validate, mock_identity, mock_jwt, app):
    with app.test_request_context('/reports', method='POST', json={'report_type': 'bad'}):
        from backend.src.api.controllers.report_controller import save_report

        result = save_report()

    assert result == ({'message': 'bad'}, 400)


@patch('backend.src.api.controllers.report_controller.emit_dashboard_refresh')
@patch('backend.src.api.controllers.report_controller.audit_service.record')
@patch('backend.src.api.controllers.report_controller.db')
@patch('backend.src.api.controllers.report_controller.Report')
@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'admin', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.validate_report_data', return_value=None)
def test_save_report_success(
    mock_validate,
    mock_identity,
    mock_jwt,
    mock_report,
    mock_db,
    mock_audit,
    mock_emit,
    app,
):
    report_instance = SimpleNamespace(
        id=11,
        report_type='tasks',
        date_range='week',
        to_dict=lambda: {'id': 11, 'report_type': 'tasks'},
    )
    mock_report.return_value = report_instance

    payload = {
        'report_type': 'tasks',
        'date_range': 'week',
        'summary': {'count': 1},
        'details': [],
    }

    with app.test_request_context('/reports', method='POST', json=payload):
        from backend.src.api.controllers.report_controller import save_report

        response, status = save_report()

    assert status == 201
    assert response.get_json()['report']['id'] == 11
    mock_db.session.add.assert_called_once_with(report_instance)
    mock_db.session.commit.assert_called_once()
    mock_audit.assert_called_once()
    mock_emit.assert_called_once()


@patch('backend.src.api.controllers.report_controller.db')
@patch('backend.src.api.controllers.report_controller.Report')
@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'admin', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.validate_report_data', return_value=None)
def test_save_report_db_exception(mock_validate, mock_identity, mock_jwt, mock_report, mock_db, app):
    mock_db.session.commit.side_effect = Exception('db failed')
    mock_report.return_value = SimpleNamespace(id=1, report_type='tasks', date_range='week', to_dict=lambda: {})

    payload = {
        'report_type': 'tasks',
        'date_range': 'week',
        'summary': {},
        'details': [],
    }

    with app.test_request_context('/reports', method='POST', json=payload):
        from backend.src.api.controllers.report_controller import save_report

        response, status = save_report()

    assert status == 500
    assert 'Failed to save report' in response.get_json()['message']
    mock_db.session.rollback.assert_called_once()


@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'developer', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.Report')
def test_get_reports_for_developer_scopes_to_user(mock_report, mock_identity, mock_jwt, app):
    query = MagicMock()
    filtered_query = MagicMock()
    ordered_query = MagicMock()
    paginated = SimpleNamespace(items=[SimpleNamespace(to_dict=lambda: {'id': 1})], total=1, pages=1)

    mock_report.query = query
    query.filter_by.return_value = filtered_query
    filtered_query.filter_by.return_value = filtered_query
    filtered_query.order_by.return_value = ordered_query
    ordered_query.paginate.return_value = paginated

    with app.test_request_context('/reports?type=tasks&dateRange=week&page=1&per_page=5'):
        from backend.src.api.controllers.report_controller import get_reports

        response, status = get_reports()
        data = response.get_json()

    assert status == 200
    assert data['pagination']['total'] == 1
    assert any(call.kwargs.get('user_id') == 4 for call in query.filter_by.call_args_list)


@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'admin', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.Report')
def test_get_reports_handles_exception(mock_report, mock_identity, mock_jwt, app):
    query = MagicMock()
    mock_report.query = query
    query.order_by.side_effect = Exception('query failed')

    with app.test_request_context('/reports'):
        from backend.src.api.controllers.report_controller import get_reports

        response, status = get_reports()

    assert status == 500
    assert 'Failed to retrieve reports' in response.get_json()['message']


@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'developer', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.Report')
def test_get_report_by_id_not_found(mock_report, mock_identity, mock_jwt, app):
    mock_report.query.get.return_value = None

    with app.app_context():
        from backend.src.api.controllers.report_controller import get_report_by_id

        response, status = get_report_by_id(42)

    assert status == 404
    assert response.get_json()['message'] == 'Report not found'


@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'developer', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.Report')
def test_get_report_by_id_unauthorized_for_developer(mock_report, mock_identity, mock_jwt, app):
    mock_report.query.get.return_value = SimpleNamespace(user_id=9, to_dict=lambda: {'id': 9})

    with app.app_context():
        from backend.src.api.controllers.report_controller import get_report_by_id

        response, status = get_report_by_id(9)

    assert status == 403
    assert 'Unauthorized' in response.get_json()['message']


@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'admin', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.Report')
def test_get_report_by_id_success(mock_report, mock_identity, mock_jwt, app):
    mock_report.query.get.return_value = SimpleNamespace(user_id=9, to_dict=lambda: {'id': 9})

    with app.app_context():
        from backend.src.api.controllers.report_controller import get_report_by_id

        response, status = get_report_by_id(9)

    assert status == 200
    assert response.get_json()['report']['id'] == 9


@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'developer', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.Report')
def test_delete_report_not_found(mock_report, mock_identity, mock_jwt, app):
    mock_report.query.get.return_value = None

    with app.app_context():
        from backend.src.api.controllers.report_controller import delete_report

        response, status = delete_report(1)

    assert status == 404


@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'developer', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.Report')
def test_delete_report_unauthorized(mock_report, mock_identity, mock_jwt, app):
    mock_report.query.get.return_value = SimpleNamespace(user_id=8, report_type='tasks', date_range='week')

    with app.app_context():
        from backend.src.api.controllers.report_controller import delete_report

        response, status = delete_report(1)

    assert status == 403


@patch('backend.src.api.controllers.report_controller.emit_dashboard_refresh')
@patch('backend.src.api.controllers.report_controller.audit_service.record')
@patch('backend.src.api.controllers.report_controller.db')
@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'admin', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.Report')
def test_delete_report_success(mock_report, mock_identity, mock_jwt, mock_db, mock_audit, mock_emit, app):
    report = SimpleNamespace(user_id=8, report_type='tasks', date_range='week')
    mock_report.query.get.return_value = report

    with app.app_context():
        from backend.src.api.controllers.report_controller import delete_report

        response, status = delete_report(1)

    assert status == 200
    assert response.get_json()['message'] == 'Report deleted successfully'
    mock_db.session.delete.assert_called_once_with(report)
    mock_db.session.commit.assert_called_once()
    mock_audit.assert_called_once()
    mock_emit.assert_called_once()


@patch('backend.src.api.controllers.report_controller.db')
@patch('backend.src.api.controllers.report_controller.get_jwt', return_value={'role': 'admin', 'user_id': 4})
@patch('backend.src.api.controllers.report_controller.get_jwt_identity', return_value={'user_id': 4})
@patch('backend.src.api.controllers.report_controller.Report')
def test_delete_report_db_error(mock_report, mock_identity, mock_jwt, mock_db, app):
    mock_report.query.get.return_value = SimpleNamespace(user_id=8, report_type='tasks', date_range='week')
    mock_db.session.commit.side_effect = Exception('delete failed')

    with app.app_context():
        from backend.src.api.controllers.report_controller import delete_report

        response, status = delete_report(1)

    assert status == 500
    assert 'Failed to delete report' in response.get_json()['message']
    mock_db.session.rollback.assert_called_once()
