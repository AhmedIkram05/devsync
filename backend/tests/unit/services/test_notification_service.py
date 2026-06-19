from datetime import UTC, datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

import pytest
import src.services.notification_service  # force module registration
from flask import Flask


@pytest.fixture
def mock_db_session():
    with patch('src.services.notification_service.db.session') as mock:
        yield mock

@pytest.fixture
def mock_emit():
    with patch('src.services.notification_service.socketio.emit') as mock:
        yield mock

@pytest.fixture
def mock_connected_users():
    with patch('src.services.notification_service.connected_users', {'user1': 'socket1'}):
        yield

@pytest.fixture
def mock_project_rooms():
    with patch('src.services.notification_service.project_rooms', {'project1': ['user1', 'user2', 'user3']}):
        yield

@pytest.fixture
def notification_data():
    return {
        'user_id': 'user1',
        'notification_type': 'task',
        'title': 'Test Title',
        'message': 'Test Message',
        'reference_id': 123
    }

@pytest.fixture(autouse=True)
def app_context_fixture():
    app = Flask(__name__)
    # Minimal config if needed
    with app.app_context():
        yield

def test_send_to_user(mock_db_session, mock_emit, mock_connected_users, notification_data):
    # Create a mock notification instance
    mock_notification = MagicMock()
    mock_notification.id = 1
    mock_notification.created_at = datetime.now(UTC)

    # Setup the db.session.add to set the id on the notification
    def mock_add(notification):
        notification.id = 1
        notification.created_at = mock_notification.created_at

    mock_db_session.add.side_effect = mock_add

    # Import inside test to use patched modules
    from src.services.notification_service import NotificationService
    NotificationService.send_to_user(**notification_data)

    # Verify DB interactions
    mock_db_session.add.assert_called_once()
    mock_db_session.commit.assert_called_once()

    # Verify the emit was called with right parameters
    mock_emit.assert_called_once()
    event_name, payload = mock_emit.call_args.args
    assert event_name == 'notification'
    assert payload['id'] == 1
    assert payload['type'] == notification_data['notification_type']
    assert payload['title'] == notification_data['title']
    assert payload['message'] == notification_data['message']
    assert payload['content'] == notification_data['message']
    assert payload['reference_id'] == notification_data['reference_id']
    assert payload['timestamp'] == mock_notification.created_at.isoformat()
    assert mock_emit.call_args.kwargs == {'to': 'socket1'}


def test_send_to_user_not_connected(mock_db_session, mock_emit, mock_connected_users, notification_data):
    # Test fallback mechanism where user is not connected, but DB commit succeeds
    mock_notification = MagicMock()
    mock_notification.id = 2
    mock_notification.created_at = datetime.now(UTC)

    def mock_add(notification):
        notification.id = 2
        notification.created_at = mock_notification.created_at

    mock_db_session.add.side_effect = mock_add

    # Change notification_data to target offline user
    isolated_data = notification_data.copy()
    isolated_data['user_id'] = 'offline_user'

    from src.services.notification_service import NotificationService
    NotificationService.send_to_user(**isolated_data)

    mock_db_session.add.assert_called_once()
    mock_db_session.commit.assert_called_once()
    mock_emit.assert_not_called()  # WebSocket should not dispatch


def test_send_to_user_websocket_failure_logs_and_commits(mock_db_session, mock_emit, mock_connected_users, notification_data):
    # User is connected but WebSocket emit throws an exception; DB commit should still succeed.
    mock_notification = MagicMock()
    mock_notification.id = 3
    mock_notification.created_at = datetime.now(UTC)

    def mock_add(notification):
        notification.id = 3
        notification.created_at = mock_notification.created_at

    mock_db_session.add.side_effect = mock_add
    mock_emit.side_effect = Exception("WebSocket emit timeout")

    with patch('src.services.notification_service.logger.exception') as mock_logger_exception:
        from src.services.notification_service import NotificationService

        result = NotificationService.send_to_user(**notification_data)

    mock_db_session.add.assert_called_once()
    mock_db_session.commit.assert_called_once()
    mock_logger_exception.assert_called_once()
    assert result.id == 3


def test_send_to_recipients_collects_truthy_results():
    from src.services.notification_service import NotificationService

    with patch.object(NotificationService, 'send_to_user', side_effect=[None, MagicMock(id=2), MagicMock(id=3)]) as mock_send:
        notifications = NotificationService.send_to_recipients(
            recipient_user_ids=[1, 2, 3],
            notification_type='task',
            title='Test',
            message='Message',
            reference_id=99,
            task_id=7,
        )

    assert len(notifications) == 2
    assert mock_send.call_count == 3


def test_send_to_recipients_empty_list_returns_empty():
    from src.services.notification_service import NotificationService

    assert NotificationService.send_to_recipients([], 'task', 'Title', 'Message') == []


@pytest.mark.parametrize(
    'changed_fields, expected_phrase, db_get_return',
    [
        ({'status': ('todo', 'in_progress')}, 'status changed to in_progress', None),
        ({'assigned_to': (1, 2)}, 'assigned to Alex', SimpleNamespace(name='Alex')),
        ({'deadline': ('2026-01-01', '2026-01-02')}, 'deadline updated to 2026-01-02', None),
        ({'priority': ('low', 'high')}, 'priority set to high', None),
        ({'description': ('old', 'new')}, 'updated (description)', None),
    ],
)
def test_task_updated_notification_v2_routes_main_change(changed_fields, expected_phrase, db_get_return):
    from src.services.notification_service import NotificationService

    with patch.object(NotificationService, 'send_to_recipients', return_value=[MagicMock(id=1)]) as mock_send:
        with patch('src.services.notification_service.db.session.get', return_value=db_get_return) as mock_db_get:
            NotificationService.task_updated_notification_v2(
                task_id=7,
                task_name='Implement feature',
                project_id=3,
                updated_by_user_id=4,
                assignee_id=5,
                changed_fields=changed_fields,
                project_name='Alpha',
                recipient_user_ids=[10],
            )

    assert mock_send.called
    message = mock_send.call_args.kwargs['message']
    assert expected_phrase in message
    if 'assigned_to' in changed_fields:
        mock_db_get.assert_called_once()


@pytest.mark.parametrize(
    'action_type, affected_user_role, changed_fields, expected_title, expected_fragment',
    [
        ('user_created', 'developer', None, 'New User Created', 'New user "Alice" as developer created'),
        ('user_updated', None, {'name': ('Old', 'New')}, 'User Updated', 'User "Alice" updated (name)'),
        ('user_deleted', None, None, 'User Deleted', 'User "Alice" was deleted'),
        ('user_archived', None, None, 'User Operation', 'User operation on "Alice"'),
    ],
)
def test_user_crud_notification_routes_and_excludes_admin(action_type, affected_user_role, changed_fields, expected_title, expected_fragment):
    from src.services.notification_service import NotificationService

    with patch.object(NotificationService, 'send_to_recipients', return_value=[MagicMock(id=1)]) as mock_send:
        NotificationService.user_crud_notification(
            action_type=action_type,
            affected_user_name='Alice',
            affected_user_role=affected_user_role,
            changed_fields=changed_fields,
            admin_user_id=2,
            recipient_user_ids=[1, 2, 3],
        )

    assert mock_send.called
    assert mock_send.call_args.kwargs['recipient_user_ids'] == [1, 3]
    assert mock_send.call_args.kwargs['title'] == expected_title
    assert expected_fragment in mock_send.call_args.kwargs['message']

def test_send_to_project(mock_project_rooms, notification_data):
    # Import inside test
    from src.services.notification_service import NotificationService

    with patch.object(NotificationService, 'send_to_user') as mock_send_to_user:
        mock_send_to_user.return_value = object()

        # Call the method
        NotificationService.send_to_project(
            project_id='project1',
            notification_type=notification_data['notification_type'],
            title=notification_data['title'],
            message=notification_data['message'],
            reference_id=notification_data['reference_id']
        )

        # Verify send_to_user was called for each project member
        assert mock_send_to_user.call_count == 3
        mock_send_to_user.assert_has_calls([
            call(user_id='user1', notification_type=notification_data['notification_type'],
                title=notification_data['title'], message=notification_data['message'],
                reference_id=notification_data['reference_id'], task_id=None),
            call(user_id='user2', notification_type=notification_data['notification_type'],
                title=notification_data['title'], message=notification_data['message'],
                reference_id=notification_data['reference_id'], task_id=None),
            call(user_id='user3', notification_type=notification_data['notification_type'],
                title=notification_data['title'], message=notification_data['message'],
                reference_id=notification_data['reference_id'], task_id=None)
        ], any_order=True)

        # Test exclusion logic
        mock_send_to_user.reset_mock()
        NotificationService.send_to_project(
            project_id='project1',
            notification_type='task',
            title='Test',
            message='Test',
            exclude_user_id='user2'
        )
        assert mock_send_to_user.call_count == 2  # only called for user1 and user3

def test_mark_as_read(mock_db_session):
    # Test for existing notification
    with patch('src.services.notification_service.Notification.query') as mock_query:
        mock_notification = MagicMock()
        mock_filter = MagicMock()
        mock_filter.first.return_value = mock_notification
        mock_query.filter_by.return_value = mock_filter

        from src.services.notification_service import NotificationService
        result = NotificationService.mark_as_read(notification_id=1, user_id=1)

        # Verify the notification was updated
        assert mock_notification.is_read
        assert mock_notification.read_at is not None
        mock_db_session.commit.assert_called_once()
        assert result

    # Test for non-existing notification
    with patch('src.services.notification_service.Notification.query') as mock_query:
        mock_filter = MagicMock()
        mock_filter.first.return_value = None
        mock_query.filter_by.return_value = mock_filter

        from src.services.notification_service import NotificationService
        result = NotificationService.mark_as_read(notification_id=999, user_id=1)
        assert not result

def test_mark_all_as_read(mock_db_session):
    with patch('src.services.notification_service.Notification.query') as mock_query:
        mock_filter = MagicMock()
        mock_query.filter_by.return_value = mock_filter

        from src.services.notification_service import NotificationService
        result = NotificationService.mark_all_as_read(user_id=1)

        # Verify the update was called
        mock_filter.update.assert_called_once()
        mock_db_session.commit.assert_called_once()
        assert result

def test_get_unread_count():
    with patch('src.services.notification_service.Notification.query') as mock_query:
        mock_filter = MagicMock()
        mock_query.filter_by.return_value = mock_filter
        mock_filter.count.return_value = 5

        from src.services.notification_service import NotificationService
        result = NotificationService.get_unread_count(user_id=1)

        assert result == 5

def test_get_user_notifications():
    with patch('src.services.notification_service.Notification.query') as mock_query:
        mock_filter = MagicMock()
        mock_order = MagicMock()
        mock_paginate = MagicMock()

        mock_query.filter_by.return_value = mock_filter
        mock_filter.order_by.return_value = mock_order
        mock_order.paginate.return_value = mock_paginate
        # Need to also set up filter_by on mock_filter for the unread_only case
        mock_filter.filter_by.return_value = mock_filter

        from src.services.notification_service import NotificationService
        # Test with default values
        result = NotificationService.get_user_notifications(user_id=1)
        mock_order.paginate.assert_called_with(page=1, per_page=10, error_out=False)
        assert result == mock_paginate

        # Test with custom values
        result = NotificationService.get_user_notifications(user_id=1, page=2, per_page=20, unread_only=True)
        # Should check mock_filter.filter_by (not mock_query.filter_by) since we call filter_by twice
        mock_filter.filter_by.assert_called_with(is_read=False)
        mock_order.paginate.assert_called_with(page=2, per_page=20, error_out=False)
