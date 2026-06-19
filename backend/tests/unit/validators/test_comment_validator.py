import json
import os
import sys
import unittest

from flask import Flask

# Create a test Flask app context for the validators to use
app = Flask(__name__)

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import after path setup
from backend.src.api.validators.comment_validator import validate_comment_data


class TestCommentValidator(unittest.TestCase):
    def test_comment_validation(self):
        with app.test_request_context():
            # Test valid comment data
            valid_data = {'content': 'This is a comment'}
            assert validate_comment_data(valid_data) is None

            # Test missing content field
            missing_content = {}
            response, code = validate_comment_data(missing_content)
            assert code == 400
            assert json.loads(response.data)['message'] == 'Missing required content field'

            # Test empty content
            empty_content = {'content': ''}
            response, code = validate_comment_data(empty_content)
            assert code == 400
            assert json.loads(response.data)['message'] == 'Comment content cannot be empty'

            # Test content too long
            long_content = {'content': 'a' * 1001}
            response, code = validate_comment_data(long_content)
            assert code == 400
            assert json.loads(response.data)['message'] == 'Comment content must be less than 1000 characters'

if __name__ == '__main__':
    unittest.main()
