import json
import os
import sys
import unittest

from flask import Flask

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

from backend.src.api.validators.github_validator import (
    validate_github_auth,
    validate_github_repo_data,
    validate_github_webhook_payload,
    validate_task_github_link,
)


class TestGitHubValidator(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app_context = self.app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()

    def test_validate_github_auth_valid(self):
        data = {'code': 'valid_code'}
        result = validate_github_auth(data)
        self.assertIsNone(result)

    def test_validate_github_auth_missing_code(self):
        data = {}
        response, status_code = validate_github_auth(data)
        self.assertEqual(status_code, 400)
        self.assertIn('GitHub authorization code is required', json.loads(response.data)['message'])

    def test_validate_github_auth_empty_code(self):
        data = {'code': ''}
        response, status_code = validate_github_auth(data)
        self.assertEqual(status_code, 400)
        self.assertIn('Invalid GitHub authorization code', json.loads(response.data)['message'])

    def test_validate_github_repo_data_valid(self):
        data = {
            'repository_name': 'owner/repo',
            'repository_url': 'https://github.com/owner/repo'
        }
        result = validate_github_repo_data(data)
        self.assertIsNone(result)

    def test_validate_github_repo_data_missing_fields(self):
        data = {'repository_name': 'owner/repo'}
        response, status_code = validate_github_repo_data(data)
        self.assertEqual(status_code, 400)
        self.assertIn('Missing required GitHub repository fields', json.loads(response.data)['message'])

    def test_validate_github_repo_data_invalid_name(self):
        data = {
            'repository_name': 'invalid-repo-name',
            'repository_url': 'https://github.com/owner/repo'
        }
        response, status_code = validate_github_repo_data(data)
        self.assertEqual(status_code, 400)
        self.assertIn('Invalid repository name format', json.loads(response.data)['message'])

    def test_validate_github_repo_data_invalid_url(self):
        data = {
            'repository_name': 'owner/repo',
            'repository_url': 'https://gitlab.com/owner/repo'
        }
        response, status_code = validate_github_repo_data(data)
        self.assertEqual(status_code, 400)
        self.assertIn('Invalid GitHub repository URL', json.loads(response.data)['message'])

    def test_validate_github_repo_data_short_webhook_secret(self):
        data = {
            'repository_name': 'owner/repo',
            'repository_url': 'https://github.com/owner/repo',
            'webhook_secret': 'short'
        }
        response, status_code = validate_github_repo_data(data)
        self.assertEqual(status_code, 400)
        self.assertIn('Webhook secret should be at least 16 characters', json.loads(response.data)['message'])

    def test_validate_github_webhook_payload_valid(self):
        data = {
            'action': 'opened',
            'repository': {'id': 12345}
        }
        result = validate_github_webhook_payload(data)
        self.assertIsNone(result)

    def test_validate_github_webhook_payload_missing_fields(self):
        data = {'action': 'opened'}
        response, status_code = validate_github_webhook_payload(data)
        self.assertEqual(status_code, 400)
        self.assertIn('Invalid webhook payload format', json.loads(response.data)['message'])

    def test_validate_github_webhook_payload_invalid_repo(self):
        data = {
            'action': 'opened',
            'repository': 'not-a-dict'
        }
        response, status_code = validate_github_webhook_payload(data)
        self.assertEqual(status_code, 400)
        self.assertIn('Invalid repository data', json.loads(response.data)['message'])

    def test_validate_task_github_link_valid(self):
        data = {
            'task_id': 1,
            'repo_id': 2,
            'issue_number': 3,
            'pull_request_number': 4
        }
        result = validate_task_github_link(data)
        self.assertIsNone(result)

    def test_validate_task_github_link_missing_fields(self):
        data = {'task_id': 1}
        response, status_code = validate_task_github_link(data)
        self.assertEqual(status_code, 400)
        self.assertIn('Missing required fields', json.loads(response.data)['message'])

    def test_validate_task_github_link_invalid_task_id(self):
        data = {
            'task_id': 'not-an-integer',
            'repo_id': 2
        }
        response, status_code = validate_task_github_link(data)
        self.assertEqual(status_code, 400)
        self.assertIn('Task ID must be an integer', json.loads(response.data)['message'])

if __name__ == '__main__':
    unittest.main()
