from types import SimpleNamespace
from unittest.mock import patch

from backend.src.services import notification_recipients


def test_to_int_handles_values():
    assert notification_recipients._to_int("10") == 10
    assert notification_recipients._to_int(3) == 3
    assert notification_recipients._to_int(None) is None
    assert notification_recipients._to_int("abc") is None


@patch("backend.src.services.notification_recipients.db")
def test_get_tls_for_project_invalid_project_id(mock_db):
    assert notification_recipients.get_tls_for_project("bad") == []
    mock_db.session.get.assert_not_called()


@patch("backend.src.services.notification_recipients.db")
def test_get_tls_for_project_missing_project(mock_db):
    mock_db.session.get.return_value = None
    assert notification_recipients.get_tls_for_project(1) == []


@patch("backend.src.services.notification_recipients.db")
def test_get_tls_for_project_extracts_team_leads(mock_db):
    members = [
        SimpleNamespace(id=1, role="team_lead"),
        SimpleNamespace(id=2, role="developer"),
        None,
    ]
    project = SimpleNamespace(team_members=members)
    mock_db.session.get.return_value = project

    assert notification_recipients.get_tls_for_project(1) == [1]


@patch("backend.src.services.notification_recipients.db")
def test_get_tls_for_project_handles_relationship_all(mock_db):
    relationship = SimpleNamespace(all=lambda: [SimpleNamespace(id=10, role="team_lead")])
    project = SimpleNamespace(team_members=relationship)
    mock_db.session.get.return_value = project

    assert notification_recipients.get_tls_for_project(5) == [10]


@patch("backend.src.services.notification_recipients.db")
def test_get_tls_for_project_handles_exception(mock_db):
    mock_db.session.get.side_effect = Exception("db error")
    assert notification_recipients.get_tls_for_project(1) == []


@patch("backend.src.services.notification_recipients.db")
def test_get_admins_for_project_returns_creator(mock_db):
    mock_db.session.get.return_value = SimpleNamespace(created_by=7)
    assert notification_recipients.get_admins_for_project(1) == [7]


@patch("backend.src.services.notification_recipients.db")
def test_get_admins_for_project_none_creator(mock_db):
    mock_db.session.get.return_value = SimpleNamespace(created_by=None)
    assert notification_recipients.get_admins_for_project(1) == []


@patch("backend.src.services.notification_recipients.User")
def test_get_all_admins_success(mock_user):
    mock_user.query.filter_by.return_value.all.return_value = [SimpleNamespace(id=1), SimpleNamespace(id=2)]
    assert notification_recipients.get_all_admins() == [1, 2]


@patch("backend.src.services.notification_recipients.User")
def test_get_all_admins_error(mock_user):
    mock_user.query.filter_by.side_effect = Exception("db error")
    assert notification_recipients.get_all_admins() == []


def test_get_recipients_for_task_assign_rules():
    assert notification_recipients.get_recipients_for_task_assign(1, 3, 1, 2) == [3]
    assert notification_recipients.get_recipients_for_task_assign(1, 2, 1, 2) == []
    assert notification_recipients.get_recipients_for_task_assign(1, None, 1, 2) == []


@patch("backend.src.services.notification_recipients.get_admins_for_project", return_value=[11])
@patch("backend.src.services.notification_recipients.get_tls_for_project", return_value=[9, 10])
def test_get_recipients_for_task_create_dedupes_and_excludes_actor(mock_tls, mock_admins):
    recipients = notification_recipients.get_recipients_for_task_create(
        task_id=1,
        project_id=5,
        creator_id=9,
        assignee_id=10,
    )

    assert set(recipients) == {10, 11}


@patch("backend.src.services.notification_recipients.get_admins_for_project", return_value=[2])
@patch("backend.src.services.notification_recipients.get_tls_for_project", return_value=[2, 3])
def test_get_recipients_for_task_update_excludes_updater(mock_tls, mock_admins):
    recipients = notification_recipients.get_recipients_for_task_update(
        task_id=1,
        project_id=5,
        updater_id=2,
        assignee_id=4,
    )

    assert set(recipients) == {3, 4}


@patch("backend.src.services.notification_recipients.get_all_admins", return_value=[20])
@patch("backend.src.services.notification_recipients.get_admins_for_project", return_value=[11])
@patch("backend.src.services.notification_recipients.get_tls_for_project", return_value=[9, 10])
def test_get_recipients_for_overdue_task_combines_scopes(mock_tls, mock_project_admins, mock_all_admins):
    recipients = notification_recipients.get_recipients_for_overdue_task(task_id=1, project_id=5, assignee_id=10)
    assert set(recipients) == {9, 10, 11, 20}


@patch("backend.src.services.notification_recipients.get_admins_for_project", return_value=[11])
@patch("backend.src.services.notification_recipients.get_tls_for_project", return_value=[9, 10])
def test_get_recipients_for_project_member_add_excludes_actor_and_new_member(mock_tls, mock_admins):
    recipients = notification_recipients.get_recipients_for_project_member_add(
        project_id=5, new_member_id=10, adder_id=9
    )
    assert set(recipients) == {10, 11}


@patch("backend.src.services.notification_recipients.get_all_admins", return_value=[20])
@patch("backend.src.services.notification_recipients.get_admins_for_project", return_value=[11])
@patch("backend.src.services.notification_recipients.get_tls_for_project", return_value=[9, 10])
def test_get_recipients_for_report_available_combines_scopes(mock_tls, mock_project_admins, mock_all_admins):
    recipients = notification_recipients.get_recipients_for_report_available(project_id=5, creator_id=9)
    assert set(recipients) == {9, 10, 11, 20}


@patch("backend.src.services.notification_recipients.get_all_admins", return_value=[1, 2])
def test_get_recipients_for_user_crud_only_admins(mock_get_all_admins):
    assert notification_recipients.get_recipients_for_user_crud("user_created", 99) == [1, 2]
