import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone
from flask import Flask

# Fix imports to use the correct path
@pytest.fixture
def mock_get_jwt_identity():
    with patch('src.api.controllers.notifications_controller.get_jwt_identity') as mock:
        mock.return_value = {'user_id': 1}
        yield mock

@pytest.fixture
def mock_db_session():
    with patch('src.api.controllers.notifications_controller.db.session') as mock:
        yield mock

@pytest.fixture
def mock_notification():
    notification = MagicMock()
    notification.id = 1
    notification.content = "Test notification"
    notification.is_read = False
    notification.task_id = 2
    notification.user_id = 1
    notification.created_at = datetime.now(timezone.utc)
    return notification

@pytest.fixture
def app_context():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config["JWT_HEADER_TYPE"] = "Bearer"  # add this so JWT helpers know what to expect
    # Use test_request_context to simulate an active request
    with app.test_request_context(json={'content': 'Test notification', 'user_id': 1, 'task_id': 2}):
        yield

def test_get_user_notifications(mock_get_jwt_identity, mock_db_session, app_context):
    with patch('src.api.controllers.notifications_controller.Notification.query') as mock_query:
        # Setup mock behavior
        mock_filter = MagicMock()
        mock_order = MagicMock()
        mock_query.filter_by.return_value = mock_filter
        mock_filter.order_by.return_value = mock_order
        
        notification = MagicMock()
        notification.id = 1
        notification.content = "Test notification"
        notification.is_read = False
        notification.task_id = 2
        notification.created_at = datetime.now(timezone.utc)
        
        mock_order.all.return_value = [notification]
        
        # Import inside test to use patched modules
        from src.api.controllers.notifications_controller import get_user_notifications
        response = get_user_notifications()
        
        # Verify response structure
        data = response.get_json()
        assert 'notifications' in data
        assert 'unread_count' in data
        assert len(data['notifications']) == 1
        assert data['unread_count'] == 1

def test_create_notification(mock_db_session, app_context):
    from flask import request
    # Override get_json directly so it returns a normal dict (not a coroutine)
    request.get_json = lambda: {
        'content': 'Test notification',
        'user_id': 1,
        'task_id': 2
    }
    with patch('src.api.controllers.notifications_controller.validate_notification_data') as mock_validate, \
         patch('src.api.controllers.notifications_controller.Notification') as MockNotification:
        # Setup mocks
        mock_validate.return_value = None  # No validation errors
        
        new_notification = MagicMock()
        new_notification.id = 1
        new_notification.content = 'Test notification'
        MockNotification.return_value = new_notification
        
        # Import inside test to use patched modules
        from src.api.controllers.notifications_controller import create_notification
        response, status_code = create_notification()
        
        # Verify response
        assert status_code == 201
        data = response.get_json()
        assert data['message'] == 'Notification created successfully'
        assert data['notification']['id'] == 1
        
        # Verify database interaction
        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_called_once()

def test_mark_notification_read(mock_get_jwt_identity, mock_db_session, mock_notification, app_context):
    with patch('src.api.controllers.notifications_controller.Notification.query') as mock_query:
        mock_query.get_or_404.return_value = mock_notification
        
        # Import inside test to use patched modules
        from src.api.controllers.notifications_controller import mark_notification_read
        response = mark_notification_read(1)
        
        # Verify notification was marked as read
        assert mock_notification.is_read == True
        mock_db_session.commit.assert_called_once()
        
        # Verify response
        data = response.get_json()
        assert data['message'] == 'Notification marked as read'

def test_mark_all_notifications_read(mock_get_jwt_identity, mock_db_session, app_context):
    with patch('src.api.controllers.notifications_controller.Notification.query') as mock_query:
        mock_filter = MagicMock()
        mock_query.filter_by.return_value = mock_filter
        
        # Import inside test to use patched modules
        from src.api.controllers.notifications_controller import mark_all_notifications_read
        response = mark_all_notifications_read()
        
        # Verify update was called
        mock_filter.update.assert_called_once()
        mock_db_session.commit.assert_called_once()
        
        # Verify response
        data = response.get_json()
        assert data['message'] == 'All notifications marked as read'

def test_delete_notification(mock_get_jwt_identity, mock_db_session, mock_notification, app_context):
    with patch('src.api.controllers.notifications_controller.Notification.query') as mock_query:
        mock_query.get_or_404.return_value = mock_notification
        
        # Import inside test to use patched modules
        from src.api.controllers.notifications_controller import delete_notification
        response = delete_notification(1)
        
        # Verify notification was deleted
        mock_db_session.delete.assert_called_once_with(mock_notification)
        mock_db_session.commit.assert_called_once()
        
        # Verify response
        data = response.get_json()
        assert data['message'] == 'Notification deleted'

def test_notification_not_found_or_unauthorized(mock_get_jwt_identity, app_context):
    with patch('src.api.controllers.notifications_controller.Notification.query') as mock_query:
        mock_notification = MagicMock()
        mock_notification.user_id = 2  # Different from logged-in user (1)
        mock_query.get_or_404.return_value = mock_notification
        
        # Import inside test to use patched modules
        from src.api.controllers.notifications_controller import delete_notification
        response, status_code = delete_notification(1)
        
        # Verify response
        assert status_code == 404
        data = response.get_json()
        assert data['message'] == 'Notification not found'