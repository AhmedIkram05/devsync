import sys
import os
import unittest
from unittest.mock import patch, MagicMock, Mock
import json
import uuid
from datetime import datetime
from flask import Flask
from werkzeug.datastructures import ImmutableMultiDict
import base64

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Create shared mocks used by controller-level patchers.
mock_request = Mock()
mock_jsonify = Mock()
mock_jwt = Mock()
mock_redirect = Mock()

# Now import the functions to test
from backend.src.api.controllers.github_controller import (
    initiate_github_auth,
    github_callback,
    get_github_repositories,
    link_task_with_github
)

class TestGitHubController(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.app.config['FRONTEND_URL'] = 'http://localhost:3000'
        self.app.config['GITHUB_CLIENT_ID'] = 'test-client-id'
        self.app.config['GITHUB_CLIENT_SECRET'] = 'test-client-secret'
        self.app.config['GITHUB_REDIRECT_URI'] = 'http://localhost:5000/api/github/callback'
        self.app_context = self.app.app_context()
        self.app_context.push()

        self.controller_patchers = [
            patch('backend.src.api.controllers.github_controller.request', mock_request),
            patch('backend.src.api.controllers.github_controller.jsonify', mock_jsonify),
            patch('backend.src.api.controllers.github_controller.get_jwt_identity', mock_jwt),
            patch('backend.src.api.controllers.github_controller.redirect', mock_redirect),
        ]
        for patcher in self.controller_patchers:
            patcher.start()
        
        # Reset mocks for each test
        mock_request.reset_mock()
        mock_jsonify.reset_mock()
        mock_jwt.reset_mock()
        mock_redirect.reset_mock()
        
        # Set default return values
        mock_jwt.return_value = {'user_id': 1}
        mock_jsonify.side_effect = lambda x: x
        
    def tearDown(self):
        for patcher in self.controller_patchers:
            patcher.stop()
        self.app_context.pop()

    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    @patch('backend.src.api.controllers.github_controller.uuid.uuid4')
    def test_initiate_github_auth(self, mock_uuid, mock_github_client):
        # Setup mocks
        mock_uuid.return_value = 'test-uuid'
        mock_github_client.get_auth_url.return_value = 'https://github.com/auth-url'
        
        # Call the function
        result = initiate_github_auth()
        
        # Assertions
        self.assertIn('authorization_url', result)
        self.assertEqual(result['authorization_url'], 'https://github.com/auth-url')
        mock_github_client.get_auth_url.assert_called_with('test-uuid')

    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    @patch('backend.src.api.controllers.github_controller.oauth_states')
    @patch('backend.src.api.controllers.github_controller.db')
    @patch('backend.src.api.controllers.github_controller.GitHubToken')
    @patch('backend.src.api.controllers.github_controller.User')
    def test_github_callback_success(self, mock_user_class, mock_token_class, 
                                   mock_db, mock_oauth_states, mock_github_client):
        # Setup mocks
        mock_request.args = ImmutableMultiDict([('code', 'test-code'), ('state', 'test-state')])
        
        mock_oauth_states.__contains__.return_value = True
        mock_oauth_states.__getitem__.return_value = {'user_id': 1}
        
        mock_github_client.exchange_code_for_token.return_value = {
            'access_token': 'test-access-token'
        }
        
        mock_client_instance = MagicMock()
        mock_github_client.return_value = mock_client_instance
        mock_client_instance.get_user_profile.return_value = {
            'login': 'testuser'
        }
        
        mock_user = MagicMock()
        mock_user_class.query.get.return_value = mock_user
        
        mock_token_class.query.filter_by.return_value.first.return_value = None
        
        # Call the function
        github_callback()
        
        # Assertions - updated to match the current implementation
        expected_redirect_url = 'http://localhost:3000/github/connected?success=true&github_username=testuser&user_id=1'
        mock_redirect.assert_called_with(expected_redirect_url)
        mock_db.session.add.assert_called_once()
        mock_db.session.commit.assert_called_once()
        self.assertEqual(mock_user.github_username, 'testuser')
        self.assertEqual(mock_user.github_connected, True)

    @patch('backend.src.api.controllers.github_controller.db')
    @patch('backend.src.api.controllers.github_controller.GitHubRepository')
    @patch('backend.src.api.controllers.github_controller.GitHubToken')
    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    def test_get_github_repositories(self, mock_github_client, mock_token_class, mock_repo_class, mock_db):
        # Setup mocks
        mock_token = MagicMock()
        mock_token.access_token = 'test-access-token'
        mock_token_class.query.filter_by.return_value.first.return_value = mock_token

        mock_repo_class.query.filter.return_value.all.return_value = []
        mock_local_repo = MagicMock()
        mock_local_repo.id = 101
        mock_local_repo.repo_name = 'user/repo1'
        mock_local_repo.repo_url = 'https://github.com/user/repo1'
        mock_repo_class.return_value = mock_local_repo
        
        mock_client_instance = MagicMock()
        mock_github_client.return_value = mock_client_instance
        mock_client_instance.get_repository_activity_summary.return_value = {
            'open_issues': 4,
            'open_prs': 2,
            'recent_commits': 7,
        }
        
        mock_client_instance.get_user_repositories.return_value = [
            {
                'id': 1,
                'name': 'repo1',
                'full_name': 'user/repo1',
                'owner': {'login': 'user'},
                'html_url': 'https://github.com/user/repo1',
                'description': 'Test repo 1',
                'private': False,
                'fork': False,
                'created_at': '2023-01-01T00:00:00Z',
                'updated_at': '2023-01-02T00:00:00Z',
                'pushed_at': '2023-01-03T00:00:00Z',
                'language': 'Python',
                'default_branch': 'main',
                'open_issues_count': 5
            }
        ]
        
        # Create a mock for request.args that supports the get() method with keyword arguments
        class MockArgs:
            def get(self, key, default=None, type=None):
                if key == 'page':
                    return 1 if type else '1'
                elif key == 'per_page':
                    return 10 if type else '10'
                return default

        mock_request.args = MockArgs()
        
        # Call the function
        result = get_github_repositories()
        
        # Assertions
        self.assertEqual(len(result['repositories']), 1)
        self.assertEqual(result['repositories'][0]['id'], 101)
        self.assertEqual(result['repositories'][0]['name'], 'repo1')
        self.assertEqual(result['repositories'][0]['open_issues'], 4)
        self.assertEqual(result['repositories'][0]['open_prs'], 2)
        self.assertEqual(result['repositories'][0]['recent_commits'], 7)
        mock_client_instance.get_user_repositories.assert_called_with(page=1, per_page=10)
        mock_client_instance.get_repository_activity_summary.assert_called_with(
            'user',
            'repo1',
            fallback_open_issues=5,
            since_days=7,
        )
        mock_db.session.add.assert_called_once()
        mock_db.session.commit.assert_called_once()

    @patch('backend.src.api.controllers.github_controller.validate_task_github_link')
    @patch('backend.src.api.controllers.github_controller.Task')
    @patch('backend.src.api.controllers.github_controller.GitHubRepository')
    @patch('backend.src.api.controllers.github_controller.TaskGitHubLink')
    @patch('backend.src.api.controllers.github_controller.GitHubToken')
    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    @patch('backend.src.api.controllers.github_controller.db')
    def test_link_task_with_github(self, mock_db, mock_github_client, mock_token_class, 
                                mock_link_class, mock_repo_class, mock_task_class, mock_validate):
        # Setup mocks
        mock_validate.return_value = None
        
        mock_request.get_json.return_value = {
            'repo_id': 1,
            'issue_number': 42
        }
        
        mock_task = MagicMock()
        mock_task.id = 10
        mock_task.title = 'Test Task'
        mock_task_class.query.get_or_404.return_value = mock_task
        
        mock_repo = MagicMock()
        mock_repo.repo_name = 'owner/repo'
        mock_repo_class.query.get_or_404.return_value = mock_repo
        
        mock_link_class.query.filter_by.return_value.first.return_value = None
        
        mock_token = MagicMock()
        mock_token.access_token = 'test-access-token'
        mock_token_class.query.filter_by.return_value.first.return_value = mock_token
        
        mock_client_instance = MagicMock()
        mock_github_client.return_value = mock_client_instance
        
        # Call the function
        result = link_task_with_github(10)
        
        # Assertions
        self.assertEqual(result['message'], 'Task linked with GitHub successfully')
        self.assertEqual(result['link']['task_id'], 10)
        self.assertEqual(result['link']['issue_number'], 42)
        mock_db.session.add.assert_called_once()
        mock_db.session.commit.assert_called_once()
        mock_client_instance.create_issue_comment.assert_called_once()

    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    @patch('backend.src.api.controllers.github_controller.oauth_states')
    @patch('backend.src.api.controllers.github_controller.db')
    @patch('backend.src.api.controllers.github_controller.GitHubToken')
    @patch('backend.src.api.controllers.github_controller.User')
    def test_github_callback_missing_parameters(self, mock_user_class, mock_token_class,
                                       mock_db, mock_oauth_states, mock_github_client):
        """Test github_callback with missing parameters"""
        # Setup mock for missing code
        mock_request.args = ImmutableMultiDict([('state', 'test-state')])
        
        # Call the function
        result = github_callback()
        
        # Assertions
        self.assertEqual(result[1], 400)  # Check status code
        self.assertEqual(result[0]['message'], 'Missing code or state parameter')
        
        # Setup mock for missing state
        mock_request.args = ImmutableMultiDict([('code', 'test-code')])
        
        # Call the function
        result = github_callback()
        
        # Assertions
        self.assertEqual(result[1], 400)
        self.assertEqual(result[0]['message'], 'Missing code or state parameter')

    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    @patch('backend.src.api.controllers.github_controller.oauth_states')
    @patch('backend.src.api.controllers.github_controller.db')
    @patch('backend.src.api.controllers.github_controller.GitHubToken')
    @patch('backend.src.api.controllers.github_controller.User')
    def test_github_callback_base64_encoded_state(self, mock_user_class, mock_token_class,
                                         mock_db, mock_oauth_states, mock_github_client):
        """Test github_callback with base64 encoded state"""
        # Create a state parameter that mimics what the frontend might send
        state_data = {'userId': 42}
        json_state = json.dumps(state_data).encode('utf-8')
        b64_state = base64.b64encode(json_state).decode('utf-8')
        # Replace standard base64 chars with URL-safe ones
        url_safe_state = b64_state.replace('+', '-').replace('/', '_').rstrip('=')
        
        # Setup mocks
        mock_request.args = ImmutableMultiDict([('code', 'test-code'), ('state', url_safe_state)])
        
        # Mock oauth_states to not contain this state
        mock_oauth_states.__contains__.return_value = False
        
        # Setup token exchange mock
        mock_github_client.exchange_code_for_token.return_value = {
            'access_token': 'test-access-token'
        }
        
        # Setup client instance mock
        mock_client_instance = MagicMock()
        mock_github_client.return_value = mock_client_instance
        mock_client_instance.get_user_profile.return_value = {
            'login': 'testuser'
        }
        
        # Mock user retrieval
        mock_user = MagicMock()
        mock_user_class.query.get.return_value = mock_user
        
        # Setup token query to return no existing token
        mock_token_class.query.filter_by.return_value.first.return_value = None
        
        # Call the function
        github_callback()
        
        # Assertions
        mock_user_class.query.get.assert_called_once_with(42)
        mock_db.session.add.assert_called_once()
        mock_db.session.commit.assert_called_once()
        self.assertEqual(mock_user.github_username, 'testuser')
        self.assertEqual(mock_user.github_connected, True)

    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    @patch('backend.src.api.controllers.github_controller.oauth_states')
    @patch('backend.src.api.controllers.github_controller.db')
    @patch('backend.src.api.controllers.github_controller.GitHubToken')
    @patch('backend.src.api.controllers.github_controller.User')
    def test_github_callback_update_existing_token(self, mock_user_class, mock_token_class,
                                          mock_db, mock_oauth_states, mock_github_client):
        """Test github_callback updating an existing token"""
        # Setup mocks
        mock_request.args = ImmutableMultiDict([('code', 'test-code'), ('state', 'test-state')])
        
        mock_oauth_states.__contains__.return_value = True
        mock_oauth_states.__getitem__.return_value = {'user_id': 1}
        
        # Setup token exchange mock
        mock_github_client.exchange_code_for_token.return_value = {
            'access_token': 'new-access-token',
            'refresh_token': 'new-refresh-token',
            'token_expires_at': '2023-12-31T23:59:59Z'
        }
        
        # Setup client instance mock
        mock_client_instance = MagicMock()
        mock_github_client.return_value = mock_client_instance
        mock_client_instance.get_user_profile.return_value = {
            'login': 'updateduser'
        }
        
        # Mock user retrieval
        mock_user = MagicMock()
        mock_user.github_username = 'oldusername'
        mock_user_class.query.get.return_value = mock_user
        
        # Setup existing token
        mock_existing_token = MagicMock()
        mock_existing_token.access_token = 'old-access-token'
        mock_existing_token.refresh_token = 'old-refresh-token'
        mock_token_class.query.filter_by.return_value.first.return_value = mock_existing_token
        
        # Call the function
        github_callback()
        
        # Assertions
        self.assertEqual(mock_existing_token.access_token, 'new-access-token')
        self.assertEqual(mock_existing_token.refresh_token, 'new-refresh-token')
        self.assertEqual(mock_existing_token.token_expires_at, '2023-12-31T23:59:59Z')
        self.assertEqual(mock_user.github_username, 'updateduser')
        self.assertEqual(mock_user.github_connected, True)
        mock_db.session.add.assert_not_called()  # Should not add a new token
        mock_db.session.commit.assert_called_once()

    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    @patch('backend.src.api.controllers.github_controller.oauth_states')
    @patch('backend.src.api.controllers.github_controller.db')
    def test_github_callback_token_exchange_failure(self, mock_db, mock_oauth_states, mock_github_client):
        """Test github_callback when token exchange fails"""
        # Setup mocks
        mock_request.args = ImmutableMultiDict([('code', 'invalid-code'), ('state', 'test-state')])
        
        mock_oauth_states.__contains__.return_value = True
        mock_oauth_states.__getitem__.return_value = {'user_id': 1}
        
        # Mock token exchange failure
        mock_github_client.exchange_code_for_token.return_value = None
        
        # Call the function
        result = github_callback()
        
        # Assertions
        self.assertEqual(result[1], 400)
        self.assertEqual(result[0]['message'], 'Failed to obtain access token')
        mock_db.session.commit.assert_not_called()
        
        # Test with empty response
        mock_github_client.exchange_code_for_token.return_value = {}
        
        # Call the function again
        result = github_callback()
        
        # Assertions
        self.assertEqual(result[1], 400)
        self.assertEqual(result[0]['message'], 'Failed to obtain access token')

    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    @patch('backend.src.api.controllers.github_controller.oauth_states')
    @patch('backend.src.api.controllers.github_controller.db')
    @patch('backend.src.api.controllers.github_controller.GitHubToken')
    def test_github_callback_profile_fetch_failure(self, mock_token_class, mock_db, 
                                         mock_oauth_states, mock_github_client):
        """Test github_callback when fetching GitHub profile fails"""
        # Setup mocks
        mock_request.args = ImmutableMultiDict([('code', 'test-code'), ('state', 'test-state')])
        
        mock_oauth_states.__contains__.return_value = True
        mock_oauth_states.__getitem__.return_value = {'user_id': 1}
        
        # Setup token exchange mock
        mock_github_client.exchange_code_for_token.return_value = {
            'access_token': 'test-access-token'
        }
        
        # Setup client instance mock with profile fetch failure
        mock_client_instance = MagicMock()
        mock_github_client.return_value = mock_client_instance
        mock_client_instance.get_user_profile.return_value = None
        
        # Call the function
        result = github_callback()
        
        # Assertions
        self.assertEqual(result[1], 400)
        self.assertEqual(result[0]['message'], 'Failed to fetch GitHub profile')
        mock_db.session.commit.assert_not_called()

    @patch('backend.src.api.controllers.github_controller.logger')
    @patch('backend.src.api.controllers.github_controller.oauth_states')
    def test_github_callback_invalid_state_parameter(self, mock_oauth_states, mock_logger):
        """Test github_callback with invalid state parameter"""
        # Setup mocks for invalid state parameter
        mock_request.args = ImmutableMultiDict([('code', 'test-code'), ('state', 'invalid-state')])
        
        # Mock oauth_states to not contain this state and to cause an exception when processing the state
        mock_oauth_states.__contains__.return_value = False
        
        # Call the function
        result = github_callback()
        
        # Assertions
        self.assertEqual(result[1], 400)
        self.assertIn('Invalid state parameter format', result[0]['error'])
        mock_logger.error.assert_called()

    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    @patch('backend.src.api.controllers.github_controller.oauth_states')
    @patch('backend.src.api.controllers.github_controller.db')
    @patch('backend.src.api.controllers.github_controller.GitHubToken')
    @patch('backend.src.api.controllers.github_controller.User')
    @patch('backend.src.api.controllers.github_controller.current_app', new_callable=MagicMock)
    def test_github_callback_redirection(self, mock_current_app, mock_user_class, mock_token_class,
                                mock_db, mock_oauth_states, mock_github_client):
        """Test github_callback's redirection to frontend"""
        # Setup mocks
        mock_request.args = ImmutableMultiDict([('code', 'test-code'), ('state', 'test-state')])
        
        mock_oauth_states.__contains__.return_value = True
        mock_oauth_states.__getitem__.return_value = {'user_id': 1}
        
        # Setup token exchange mock
        mock_github_client.exchange_code_for_token.return_value = {
            'access_token': 'test-access-token'
        }
        
        # Setup client instance mock
        mock_client_instance = MagicMock()
        mock_github_client.return_value = mock_client_instance
        mock_client_instance.get_user_profile.return_value = {
            'login': 'testuser'
        }
        
        # Mock user retrieval
        mock_user = MagicMock()
        mock_user_class.query.get.return_value = mock_user
        
        # Setup token query to return no existing token
        mock_token_class.query.filter_by.return_value.first.return_value = None
        
        # Setup custom frontend URL
        mock_current_app.config.get.side_effect = lambda key, default=None: 'https://devsync.example.com' if key == 'FRONTEND_URL' else default
        
        # Call the function
        github_callback()
        
        # Assertions
        expected_redirect_url = f"https://devsync.example.com/github/connected?success=true&github_username=testuser&user_id=1"
        mock_redirect.assert_called_with(expected_redirect_url)

    @patch('backend.src.api.controllers.github_controller.GitHubClient')
    @patch('backend.src.api.controllers.github_controller.oauth_states')
    @patch('backend.src.api.controllers.github_controller.db')
    @patch('backend.src.api.controllers.github_controller.GitHubToken')
    @patch('backend.src.api.controllers.github_controller.User')
    def test_github_callback_user_not_found(self, mock_user_class, mock_token_class,
                                   mock_db, mock_oauth_states, mock_github_client):
        """Test github_callback when user is not found"""
        # Setup mocks
        mock_request.args = ImmutableMultiDict([('code', 'test-code'), ('state', 'test-state')])
        
        mock_oauth_states.__contains__.return_value = True
        mock_oauth_states.__getitem__.return_value = {'user_id': 999}  # Non-existent user ID
        
        # Setup token exchange mock
        mock_github_client.exchange_code_for_token.return_value = {
            'access_token': 'test-access-token'
        }
        
        # Setup client instance mock
        mock_client_instance = MagicMock()
        mock_github_client.return_value = mock_client_instance
        mock_client_instance.get_user_profile.return_value = {
            'login': 'testuser'
        }
        
        # Mock user retrieval to return None (user not found)
        mock_user_class.query.get.return_value = None
        
        # Setup token query to return no existing token
        mock_token_class.query.filter_by.return_value.first.return_value = None
        
        # Call the function
        github_callback()
        
        # Assertions
        mock_user_class.query.get.assert_called_once_with(999)
        # Should still add the token even if user is not found
        mock_db.session.add.assert_called_once()
        mock_db.session.commit.assert_called_once()

if __name__ == '__main__':
    unittest.main()
