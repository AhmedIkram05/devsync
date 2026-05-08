"""Unit tests for WSGI entry point."""

import importlib
import sys
from unittest.mock import MagicMock, patch


def _fresh_import_wsgi():
    """Import wsgi module with a clean module cache entry."""
    sys.modules.pop('src.wsgi', None)
    return importlib.import_module('src.wsgi')


class TestWSGI:
    """Test suite for wsgi.py module."""

    def test_wsgi_imports_successfully(self):
        """Importing wsgi should expose app and socketio from create_app."""
        mock_app = MagicMock(name='app')
        mock_socketio = MagicMock(name='socketio')

        with patch('src.app.create_app', return_value=(mock_app, mock_socketio)):
            module = _fresh_import_wsgi()

        assert module.app is mock_app
        assert module.socketio is mock_socketio

    def test_wsgi_inserts_backend_path_when_missing(self):
        """wsgi should prepend backend path when not present in sys.path."""
        backend_dir = '/tmp/devsync-backend'
        mock_app = MagicMock(name='app')
        mock_socketio = MagicMock(name='socketio')

        with patch.object(sys, 'path', ['/usr/lib/python']), \
             patch('os.path.dirname', return_value='/tmp/devsync-backend/src'), \
             patch('os.path.abspath', return_value=backend_dir), \
             patch('src.app.create_app', return_value=(mock_app, mock_socketio)):
            _fresh_import_wsgi()
            assert sys.path[0] == backend_dir

    def test_wsgi_does_not_duplicate_existing_backend_path(self):
        """wsgi should not duplicate backend path when already present."""
        backend_dir = '/tmp/devsync-backend'
        mock_app = MagicMock(name='app')
        mock_socketio = MagicMock(name='socketio')

        with patch.object(sys, 'path', [backend_dir, '/usr/lib/python']), \
             patch('os.path.dirname', return_value='/tmp/devsync-backend/src'), \
             patch('os.path.abspath', return_value=backend_dir), \
             patch('src.app.create_app', return_value=(mock_app, mock_socketio)):
            _fresh_import_wsgi()
            assert sys.path.count(backend_dir) == 1

    def test_wsgi_create_app_called_once_on_import(self):
        """wsgi import should call create_app exactly once."""
        with patch('src.app.create_app', return_value=(MagicMock(), MagicMock())) as mock_create_app:
            _fresh_import_wsgi()

        mock_create_app.assert_called_once()
