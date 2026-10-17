"""Audit logging: IP pseudonymisation and transaction isolation."""

from unittest.mock import MagicMock, patch

import pytest

from backend.src.db.transaction import transactional
from backend.src.services import audit_service

REMOTE_IP = "203.0.113.9"  # TEST-NET-3, never a real client


@transactional
def _in_managed_transaction(fn):
    """Run fn with the request-scoped transaction flag set, like @transactional."""
    return fn()


@pytest.fixture
def mock_db():
    return MagicMock()


def _run_record(mock_db, *, app, managed, action="user_test"):
    with patch.object(audit_service, "db", mock_db):
        with app.test_request_context("/audit-test", environ_base={"REMOTE_ADDR": REMOTE_IP}):
            if managed:
                _in_managed_transaction(lambda: audit_service.record(action))
            else:
                audit_service.record(action)


def test_record_stores_hashed_ip_never_raw(mock_db, app):
    _run_record(mock_db, app=app, managed=False)

    entry = mock_db.session.add.call_args[0][0]
    assert entry.ip != REMOTE_IP
    assert len(entry.ip) == 45  # fits AuditLog.ip
    assert int(entry.ip, 16)  # hex digest, not an address


def test_hashed_ip_is_stable_and_pepper_dependent(app):
    with app.app_context():
        first = audit_service._hashed_ip(REMOTE_IP)
        second = audit_service._hashed_ip(REMOTE_IP)
        other = audit_service._hashed_ip("198.51.100.7")

    assert first == second
    assert first != other

    with patch.dict("os.environ", {"AUDIT_IP_PEPPER": "different-pepper"}), app.app_context():
        assert audit_service._hashed_ip(REMOTE_IP) != first


def test_hashed_ip_is_none_without_pepper(mock_db, app):
    with patch.object(audit_service, "_audit_pepper", return_value=None):
        _run_record(mock_db, app=app, managed=False)

    assert mock_db.session.add.call_args[0][0].ip is None


def test_hashed_ip_is_none_without_address(app):
    with app.app_context():
        assert audit_service._hashed_ip(None) is None
        assert audit_service._hashed_ip("") is None


def test_audit_failure_in_managed_transaction_keeps_caller_work(mock_db, app):
    mock_db.session.flush.side_effect = RuntimeError("audit insert failed")

    _run_record(mock_db, app=app, managed=True)

    mock_db.session.begin_nested.assert_called_once()
    mock_db.session.begin_nested.return_value.rollback.assert_called_once()
    mock_db.session.rollback.assert_not_called()


def test_audit_success_in_managed_transaction_flushes_without_commit(mock_db, app):
    _run_record(mock_db, app=app, managed=True)

    mock_db.session.begin_nested.assert_called_once()
    mock_db.session.flush.assert_called_once()
    mock_db.session.commit.assert_not_called()
    mock_db.session.rollback.assert_not_called()


def test_audit_outside_managed_transaction_commits_and_rolls_back_on_error(mock_db, app):
    _run_record(mock_db, app=app, managed=False)
    mock_db.session.begin_nested.assert_not_called()
    mock_db.session.commit.assert_called_once()

    mock_db.session.commit.side_effect = RuntimeError("audit insert failed")
    _run_record(mock_db, app=app, managed=False)
    mock_db.session.rollback.assert_called_once()
