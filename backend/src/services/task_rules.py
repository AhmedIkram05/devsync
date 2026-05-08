"""Shared task rule helpers used by dashboard and notification logic."""

from datetime import datetime

from ..db.models import Project

COMPLETED_TASK_STATUSES = {'done', 'completed'}
OVERDUE_EXCLUDED_STATUSES = {'done', 'completed', 'review', 'in_review'}
PROJECT_SCOPE_ROLES = {'admin', 'team_lead'}


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_task_status(status):
    return (status or '').lower().replace('-', '_').replace(' ', '_')


def parse_task_deadline(deadline):
    if deadline in (None, ''):
        return None

    if hasattr(deadline, 'toordinal'):
        return deadline

    if isinstance(deadline, str):
        try:
            return datetime.fromisoformat(deadline)
        except ValueError:
            pass

    try:
        numeric = float(deadline)
    except (TypeError, ValueError):
        return None

    if numeric > 1e12:
        numeric /= 1000.0

    return datetime.fromtimestamp(numeric)


def get_project_scope_ids(user_id, user_role):
    """Return the project IDs visible to an admin/team lead for overdue logic."""
    if user_role not in PROJECT_SCOPE_ROLES:
        return set()

    user_id = _to_int(user_id)
    if user_id is None:
        return set()

    project_ids = set()

    try:
        projects = Project.query.all()
    except Exception:
        return set()

    for project in projects:
        members = getattr(project, 'team_members', []) or []
        if hasattr(members, 'all'):
            members = members.all()

        is_assigned = False
        for member in members:
            if member is None:
                continue
            if isinstance(member, (int, str)):
                if _to_int(member) == user_id:
                    is_assigned = True
                    break
                continue

            member_id = (
                getattr(member, 'id', None)
                or getattr(member, 'user_id', None)
                or getattr(member, 'userId', None)
                or getattr(member, 'member_id', None)
            )
            if _to_int(member_id) == user_id:
                is_assigned = True
                break

        if is_assigned or _to_int(getattr(project, 'created_by', None)) == user_id:
            project_ids.add(_to_int(getattr(project, 'id', None)))

    project_ids.discard(None)
    return project_ids


def is_task_overdue(task, *, project_ids=None, assigned_to=None, now=None):
    status = normalize_task_status(getattr(task, 'status', None))
    if status in OVERDUE_EXCLUDED_STATUSES:
        return False

    if project_ids is not None:
        task_project_id = getattr(task, 'project_id', None) or getattr(task, 'projectId', None)
        task_project = getattr(task, 'project', None)
        if task_project_id is None and task_project is not None:
            task_project_id = getattr(task_project, 'id', None) or getattr(task_project, 'project_id', None)

        if _to_int(task_project_id) not in project_ids:
            return False

    if assigned_to is not None:
        task_assignee = getattr(task, 'assigned_to', None) or getattr(task, 'assignedTo', None) or getattr(task, 'assignee', None)
        if isinstance(task_assignee, dict):
            task_assignee = task_assignee.get('id') or task_assignee.get('user_id') or task_assignee.get('userId')

        if _to_int(task_assignee) != _to_int(assigned_to):
            return False

    deadline = parse_task_deadline(
        getattr(task, 'deadline', None)
        or getattr(task, 'due_date', None)
        or getattr(task, 'dueDate', None)
        or getattr(task, 'due_at', None)
        or getattr(task, 'dueAt', None)
        or getattr(task, 'due', None)
    )
    if deadline is None:
        return False

    current_time = now or (datetime.now(deadline.tzinfo) if getattr(deadline, 'tzinfo', None) else datetime.now())
    return deadline < current_time


def count_overdue_tasks(tasks, **scope):
    return sum(1 for task in tasks if is_task_overdue(task, **scope))