import json
import os
import sys
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

from flask import Flask, Response, jsonify, request

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

class TestCommentsController(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()

        # Mock classes and objects
        self.mock_db = MagicMock()
        self.mock_task = MagicMock()
        self.mock_comment = MagicMock()
        self.mock_user = MagicMock()

        # Set up common mock return values
        self.mock_task.id = 1
        self.mock_comment.id = 1
        self.mock_comment.content = "Test comment"
        self.mock_comment.user_id = 1
        self.mock_comment.task_id = 1
        self.mock_comment.created_at = datetime.now()
        self.mock_comment.updated_at = datetime.now()

        self.mock_user.id = 1
        self.mock_user.name = "Test User"
        self.mock_user.avatar = "avatar.jpg"

    @patch('backend.src.api.controllers.comments_controller.Task')
    @patch('backend.src.api.controllers.comments_controller.Comment')
    @patch('backend.src.api.controllers.comments_controller.User')
    @patch('backend.src.api.controllers.comments_controller.jsonify')
    def test_get_task_comments(self, mock_jsonify, mock_user_class, mock_comment_class, mock_task_class):
        # Import locally to allow patching
        from backend.src.api.controllers.comments_controller import get_task_comments

        # Set up mocks
        mock_task_class.query.get_or_404.return_value = self.mock_task
        mock_comment_class.query.filter_by.return_value.order_by.return_value.all.return_value = [self.mock_comment]
        mock_user_class.query.get.return_value = self.mock_user
        mock_jsonify.side_effect = lambda x: x

        # Call the function
        result = get_task_comments(1)

        # Check results
        mock_task_class.query.get_or_404.assert_called_with(1)
        mock_comment_class.query.filter_by.assert_called_with(task_id=1)
        self.assertIn('comments', result)
        self.assertEqual(len(result['comments']), 1)
        self.assertEqual(result['comments'][0]['content'], "Test comment")
        self.assertEqual(result['comments'][0]['user_name'], "Test User")

    @patch('backend.src.api.controllers.comments_controller.get_jwt_identity')
    @patch('backend.src.api.controllers.comments_controller.Task')
    @patch('backend.src.api.controllers.comments_controller.Comment')
    @patch('backend.src.api.controllers.comments_controller.db')
    @patch('backend.src.api.controllers.comments_controller.User')
    @patch('backend.src.api.controllers.comments_controller.validate_comment_data')
    @patch('backend.src.api.controllers.comments_controller.jsonify')
    def test_add_comment(self, mock_jsonify, mock_validate, mock_user_class, mock_db, mock_comment_class,
                        mock_task_class, mock_jwt_identity):
        # Import locally to allow patching
        from backend.src.api.controllers.comments_controller import add_comment

        # Set up mocks for jsonify to return a dict instead of Response
        mock_jsonify.side_effect = lambda x: x

        # Set up mocks
        mock_validate.return_value = None
        mock_jwt_identity.return_value = {'user_id': 1}
        mock_task_class.query.get_or_404.return_value = self.mock_task
        mock_comment_class.return_value = self.mock_comment
        mock_user_class.query.get.return_value = self.mock_user

        # Create a request context
        with self.app.test_request_context(json={'content': 'Test comment'}):
            # Call the function
            response, status = add_comment(1)

        # Check results
        self.assertEqual(status, 201)
        self.assertEqual(response['message'], 'Comment added successfully')
        mock_db.session.add.assert_called_once()
        mock_db.session.commit.assert_called_once()

    @patch('backend.src.api.controllers.comments_controller.get_jwt_identity')
    @patch('backend.src.api.controllers.comments_controller.get_jwt')
    @patch('backend.src.api.controllers.comments_controller.Comment')
    @patch('backend.src.api.controllers.comments_controller.db')
    @patch('backend.src.api.controllers.comments_controller.validate_comment_data')
    @patch('backend.src.api.controllers.comments_controller.jsonify')
    def test_update_comment(self, mock_jsonify, mock_validate, mock_db, mock_comment_class, mock_get_jwt, mock_jwt_identity):
        # Import locally to allow patching
        from backend.src.api.controllers.comments_controller import update_comment

        # Set up jsonify to return dict instead of Response
        mock_jsonify.side_effect = lambda x: x

        # Set up mocks
        mock_validate.return_value = None
        mock_jwt_identity.return_value = {'user_id': 1}
        mock_get_jwt.return_value = {'role': 'developer'}
        mock_comment_class.query.get_or_404.return_value = self.mock_comment

        # Create a request context
        with self.app.test_request_context(json={'content': 'Updated comment'}):
            # Call the function
            response = update_comment(1)

        # Check results
        self.assertEqual(response['message'], 'Comment updated successfully')
        self.assertEqual(self.mock_comment.content, 'Updated comment')
        mock_db.session.commit.assert_called_once()

    @patch('backend.src.api.controllers.comments_controller.get_jwt_identity')
    @patch('backend.src.api.controllers.comments_controller.get_jwt')
    @patch('backend.src.api.controllers.comments_controller.Comment')
    @patch('backend.src.api.controllers.comments_controller.db')
    @patch('backend.src.api.controllers.comments_controller.jsonify')
    def test_delete_comment(self, mock_jsonify, mock_db, mock_comment_class, mock_get_jwt, mock_jwt_identity):
        # Import locally to allow patching
        from backend.src.api.controllers.comments_controller import delete_comment

        # Set up jsonify to return a dict instead of Response
        mock_jsonify.side_effect = lambda x: x

        # Set up mocks
        mock_jwt_identity.return_value = {'user_id': 1}
        mock_get_jwt.return_value = {'role': 'developer'}
        mock_comment_class.query.get_or_404.return_value = self.mock_comment

        # Use app context to avoid "Working outside of application context" error
        with self.app.app_context():
            # Call the function
            response = delete_comment(1)

        # Check results
        self.assertEqual(response['message'], 'Comment deleted successfully')
        mock_db.session.delete.assert_called_once_with(self.mock_comment)
        mock_db.session.commit.assert_called_once()

        @patch('backend.src.api.controllers.comments_controller.get_jwt_identity')
        @patch('backend.src.api.controllers.comments_controller.get_jwt')
        @patch('backend.src.api.controllers.comments_controller.Comment')
        @patch('backend.src.api.controllers.comments_controller.jsonify')
        def test_update_comment_unauthorized(self, mock_jsonify, mock_comment_class, mock_get_jwt, mock_jwt_identity):
            """Test updating a comment when user is not authorized"""
            # Import locally to allow patching

            # Set up jsonify to return tuple with response and status code
            mock_jsonify.side_effect = lambda x: (x, 403)

            # Set up mocks
            mock_jwt_identity.return_value = {'user_id': 2}  # Different from comment.user_id
if __name__ == '__main__':
    unittest.main()
