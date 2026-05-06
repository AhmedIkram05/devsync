import sys
import os
import unittest
from unittest.mock import patch, MagicMock
import json
import requests
from flask import Flask

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

from backend.src.services.github_client import GitHubClient

class TestGitHubClient(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config['GITHUB_CLIENT_ID'] = 'test_client_id'
        self.app.config['GITHUB_CLIENT_SECRET'] = 'test_client_secret'
        self.app.config['GITHUB_REDIRECT_URI'] = 'http://localhost:8000/github/callback'
        self.app_context = self.app.app_context()
        self.app_context.push()
        GitHubClient.clear_shared_cache()
        self.client = GitHubClient(access_token='test_token')
        
    def tearDown(self):
        self.app_context.pop()

    def test_get_auth_url(self):
        state = 'test_state'
        auth_url = GitHubClient.get_auth_url(state)
        
        self.assertIn('https://github.com/login/oauth/authorize', auth_url)
        self.assertIn('client_id=test_client_id', auth_url)
        self.assertIn('state=test_state', auth_url)
        self.assertIn('scope=repo user', auth_url)

    @patch('backend.src.services.github_client.requests.post')
    def test_exchange_code_for_token_success(self, mock_post):
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'access_token': 'test_access_token',
            'token_type': 'bearer',
            'scope': 'repo,user'
        }
        mock_post.return_value = mock_response
        
        token_data = GitHubClient.exchange_code_for_token('test_code')
        
        self.assertEqual(token_data['access_token'], 'test_access_token')
        mock_post.assert_called_once()
        
    @patch('backend.src.services.github_client.requests.post')
    def test_exchange_code_for_token_failure(self, mock_post):
        # Mock failed response
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_post.return_value = mock_response
        
        token_data = GitHubClient.exchange_code_for_token('invalid_code')
        
        self.assertIsNone(token_data)
        mock_post.assert_called_once()

    def test_get_headers(self):
        headers = self.client.get_headers()
        self.assertEqual(headers['Authorization'], 'token test_token')
        self.assertEqual(headers['Accept'], 'application/vnd.github.v3+json')

    @patch('backend.src.services.github_client.requests.get')
    def test_get_user_profile_success(self, mock_get):
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'login': 'testuser',
            'id': 12345,
            'name': 'Test User'
        }
        mock_get.return_value = mock_response
        
        profile = self.client.get_user_profile()
        
        self.assertEqual(profile['login'], 'testuser')
        mock_get.assert_called_with('https://api.github.com/user', headers=self.client.get_headers())
        
    @patch('backend.src.services.github_client.requests.get')
    def test_get_user_profile_failure(self, mock_get):
        # Mock failed response
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_get.return_value = mock_response
        
        profile = self.client.get_user_profile()
        
        self.assertIsNone(profile)
        mock_get.assert_called_once()

    @patch('backend.src.services.github_client.requests.get')
    def test_get_user_repositories(self, mock_get):
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {'id': 1, 'name': 'repo1', 'full_name': 'user/repo1'},
            {'id': 2, 'name': 'repo2', 'full_name': 'user/repo2'}
        ]
        mock_get.return_value = mock_response
        
        repos = self.client.get_user_repositories(page=1, per_page=10)
        
        self.assertEqual(len(repos), 2)
        self.assertEqual(repos[0]['name'], 'repo1')
        mock_get.assert_called_with(
            'https://api.github.com/user/repos',
            params={'page': 1, 'per_page': 10, 'sort': 'updated', 
                   'affiliation': 'owner,collaborator,organization_member'},
            headers=self.client.get_headers()
        )

    @patch('backend.src.services.github_client.requests.get')
    def test_get_repository(self, mock_get):
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 1, 
            'name': 'repo1', 
            'full_name': 'owner/repo1'
        }
        mock_get.return_value = mock_response
        
        repo = self.client.get_repository('owner', 'repo1')
        
        self.assertEqual(repo['name'], 'repo1')
        mock_get.assert_called_with(
            'https://api.github.com/repos/owner/repo1',
            headers=self.client.get_headers()
        )

    @patch('backend.src.services.github_client.requests.get')
    def test_get_repository_issues(self, mock_get):
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {'id': 1, 'number': 101, 'title': 'Issue 1', 'state': 'open'}
        ]
        mock_get.return_value = mock_response
        
        issues = self.client.get_repository_issues('owner', 'repo1')
        
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]['title'], 'Issue 1')
        mock_get.assert_called_with(
            'https://api.github.com/repos/owner/repo1/issues',
            params={'state': 'open', 'page': 1, 'per_page': 30},
            headers=self.client.get_headers()
        )

    @patch('backend.src.services.github_client.requests.post')
    def test_create_issue_comment(self, mock_post):
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {
            'id': 1, 
            'body': 'Test comment'
        }
        mock_post.return_value = mock_response
        
        comment = self.client.create_issue_comment('owner', 'repo1', 101, 'Test comment')
        
        self.assertEqual(comment['body'], 'Test comment')
        mock_post.assert_called_with(
            'https://api.github.com/repos/owner/repo1/issues/101/comments',
            json={'body': 'Test comment'},
            headers=self.client.get_headers()
        )

    @patch('backend.src.services.github_client.requests.get')
    def test_get_recent_commits_uses_commits_endpoint(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {'sha': 'abc123'},
            {'sha': 'def456'},
        ]
        mock_response.headers = {}
        mock_get.return_value = mock_response

        commit_count = self.client.get_recent_commits('owner', 'repo1', since_days=30)

        self.assertEqual(commit_count, 2)
        mock_get.assert_called_once()
        called_url = mock_get.call_args.args[0]
        called_kwargs = mock_get.call_args.kwargs
        self.assertEqual(called_url, 'https://api.github.com/repos/owner/repo1/commits')
        self.assertEqual(called_kwargs['params']['page'], 1)
        self.assertEqual(called_kwargs['params']['per_page'], 100)
        self.assertIn('since', called_kwargs['params'])
        self.assertEqual(called_kwargs['headers'], self.client.get_headers())

    @patch('backend.src.services.github_client.requests.get')
    def test_get_open_pulls_count_uses_repository_pulls_endpoint(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [{'number': 1}]
        mock_response.headers = {}
        mock_get.return_value = mock_response

        pull_count = self.client.get_open_pulls_count('owner', 'repo1')

        # New optimized behavior: returns count from first page only (not paginated)
        self.assertEqual(pull_count, 1)
        called_url = mock_get.call_args.args[0]
        called_kwargs = mock_get.call_args.kwargs
        self.assertEqual(called_url, 'https://api.github.com/repos/owner/repo1/pulls')
        self.assertEqual(called_kwargs['params']['state'], 'open')
        self.assertEqual(called_kwargs['params']['per_page'], 1)

    @patch('backend.src.services.github_client.requests.get')
    def test_get_open_issues_count_filters_out_pull_requests(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {'number': 11, 'title': 'Issue only'},
            {'number': 12, 'pull_request': {'url': 'https://api.github.com/repos/owner/repo1/pulls/12'}},
        ]
        mock_response.headers = {}
        mock_get.return_value = mock_response

        issue_count = self.client.get_open_issues_count('owner', 'repo1')

        self.assertEqual(issue_count, 1)
        called_url = mock_get.call_args.args[0]
        called_kwargs = mock_get.call_args.kwargs
        self.assertEqual(called_url, 'https://api.github.com/repos/owner/repo1/issues')
        self.assertEqual(called_kwargs['params']['state'], 'open')

    @patch.object(GitHubClient, 'get_recent_commits', return_value=None)
    @patch.object(GitHubClient, 'get_open_pulls_count', return_value=3)
    @patch.object(GitHubClient, 'get_open_issues_count', return_value=None)
    def test_get_repository_activity_summary_keeps_fallback_issue_count(
        self,
        mock_issue_count,
        mock_pull_count,
        mock_recent_commits,
    ):
        summary = self.client.get_repository_activity_summary(
            'owner',
            'repo1',
            fallback_open_issues=9,
            since_days=30,
        )

        self.assertEqual(summary['open_issues'], 9)
        self.assertEqual(summary['open_prs'], 3)
        self.assertEqual(summary['recent_commits'], 0)

    def test_parse_state_param_invalid(self):
        # Mismatched/malformed state should safely return None
        result = GitHubClient.parse_state_param("invalid_base64_###")
        self.assertIsNone(result)

    @patch('backend.src.services.github_client.time.time')
    @patch('backend.src.services.github_client.time.sleep')
    def test_handle_rate_limit_sleep_and_retry(self, mock_sleep, mock_time):
        mock_time.return_value = 1000
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = 'Rate limit exceeded'
        mock_response.headers = {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': '1100'  # 100 seconds from now
        }
        
        result = self.client._handle_rate_limit(mock_response)
        
        # It should sleep for 100 seconds and return True (retry)
        mock_sleep.assert_called_with(100)
        self.assertTrue(result)

    @patch('backend.src.services.github_client.time.time')
    def test_handle_rate_limit_exceeded_returns_false(self, mock_time):
        mock_time.return_value = 1000
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = 'Rate limit exceeded'
        mock_response.headers = {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': '2000'  # 1000 seconds > 300
        }

        result = self.client._handle_rate_limit(mock_response)

        self.assertFalse(result)

if __name__ == '__main__':
    unittest.main()
