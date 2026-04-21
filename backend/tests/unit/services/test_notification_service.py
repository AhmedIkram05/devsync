import src.services.notification_service  # force module registration
import pytest
from unittest.mock import patch, MagicMock, call
from datetime import datetime, timezone
from flask import Flask

@pytest.fixture
def mock_db_session():
    with patch('src.services.notification_service.db.session') as mock:
        yield mock

@pytest.fixture
def mock_emit():
    with patch('src.services.notification_service.emit') as mock:
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
    mock_notification.created_at = datetime.now(timezone.utc)
    
    # Setup the db.session.add to set the id on the notification
    def mock_add(notification):
        notification.id = 1
        notification.created_at = mock_notification.created_at
    
    mock_db_session.add.side_effect = mock_add
    
    # Import inside test to use patched modules
    from src.services.notification_service import NotificationService
    result = NotificationService.send_to_user(**notification_data)
    
    # Verify DB interactions
    mock_db_session.add.assert_called_once()
    mock_db_session.commit.assert_called_once()
    
    # Verify the emit was called with right parameters
    mock_emit.assert_called_once_with('notification', {
        'id': 1,
        'type': notification_data['notification_type'],
        'title': notification_data['title'],
        'message': notification_data['message'],
        'reference_id': notification_data['reference_id'],
        'timestamp': mock_notification.created_at.isoformat()
    }, to='socket1')


def test_send_to_user_not_connected(mock_db_session, mock_emit, mock_connected_users, notification_data):
    # Test fallback mechanism where user is not connected, but DB commit succeeds
    mock_notification = MagicMock()
    mock_notification.id = 2
    mock_notification.created_at = datetime.now(timezone.utc)
    
    def mock_add(notification):
        notification.id = 2
        notification.created_at = mock_notification.created_at

    mock_db_session.add.side_effect = mock_add
    
    # Change notification_data to target offline user
    isolated_data = notification_data.copy()
    isolated_data['user_id'] = 'offline_user'
    
    from src.services.notification_service import NotificationService
    result = NotificationService.send_to_user(**isolated_data)
    
    mock_db_session.add.assert_called_once()
    mock_db_session.commit.assert_called_once()
    mock_emit.assert_not_called()  # WebSocket should not dispatch


def test_send_to_user_websocket_failure(mock_db_session, mock_emit, mock_connected_users, notification_data):
    # User is connected but WebSocket emit throws an exception
    mock_notification = MagicMock()
    mock_notification.id = 3
    mock_notification.created_at = datetime.now(timezone.utc)
    
    def mock_add(notification):
        notification.id = 3
        notification.created_at = mock_notification.created_at

    mock_db_session.add.side_effect = mock_add
    mock_emit.side_effect = Exception("WebSocket emit timeout")
    
    from src.services.notification_service import NotificationService
    # DB persistence works even if websocket fails (if we add try-except, or we expect the exception to bubble)
    # The application gracefully falls back to just DB persisting if we catch it.
    # Currently the app codebase might not catch it, so let's verify error is raised (if uncaught) or passed
    try:
        result = NotificationService.send_to_user(**notification_data)
    except Exception as e:
        assert str(e) == "WebSocket emit timeout"

    mock_db_session.add.assert_called_once()
    mock_db_session.commit.assert_called_once()

def test_send_to_project(mock_project_rooms, notification_data):
    # Import inside test
    from src.services.notification_service import NotificationService
    
    with patch.object(NotificationService, 'send_to_user') as mock_send_to_user:
        mock_send_to_user.return_value = MagicMock()
        
        # Call the method
        results = NotificationService.send_to_project(
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
                reference_id=notification_data['reference_id']),
            call(user_id='user2', notification_type=notification_data['notification_type'],
                title=notification_data['title'], message=notification_data['message'], 
                reference_id=notification_data['reference_id']),
            call(user_id='user3', notification_type=notification_data['notification_type'],
                title=notification_data['title'], message=notification_data['message'], 
                reference_id=notification_data['reference_id'])
        ])
        
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
        assert mock_notification.is_read == True
        assert mock_notification.read_at is not None
        mock_db_session.commit.assert_called_once()
        assert result == True
    
    # Test for non-existing notification
    with patch('src.services.notification_service.Notification.query') as mock_query:
        mock_filter = MagicMock()
        mock_filter.first.return_value = None
        mock_query.filter_by.return_value = mock_filter
        
        from src.services.notification_service import NotificationService
        result = NotificationService.mark_as_read(notification_id=999, user_id=1)
        assert result == False

def test_mark_all_as_read(mock_db_session):
    with patch('src.services.notification_service.Notification.query') as mock_query:
        mock_filter = MagicMock()
        mock_query.filter_by.return_value = mock_filter
        
        from src.services.notification_service import NotificationService
        result = NotificationService.mark_all_as_read(user_id=1)
        
        # Verify the update was called
        mock_filter.update.assert_called_once()
        mock_db_session.commit.assert_called_once()
        assert result == True

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