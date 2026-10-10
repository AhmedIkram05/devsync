# Role-Based Access Control (RBAC) implementation

from enum import Enum
from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity


class Role(Enum):
    """User roles with hierarchical permissions"""

    DEVELOPER = "developer"
    TEAM_LEAD = "team_lead"
    ADMIN = "admin"


DEVELOPER_PERMISSIONS = [
    "can_view_tasks",
    "can_update_assigned_tasks",
    "can_comment_on_tasks",
    "can_view_notifications",
    "can_manage_personal_notifications",
    "can_view_own_profile",
    "can_update_own_profile",
    "can_link_github_account",
]

TEAM_LEAD_PERMISSIONS = [
    *DEVELOPER_PERMISSIONS,
    "can_create_tasks",
    "can_assign_tasks",
    "can_update_any_task",
    "can_view_all_users",
    "can_view_system_stats",
    "can_generate_reports",
]

ADMIN_PERMISSIONS = [
    *TEAM_LEAD_PERMISSIONS,
    "can_manage_users",
    "can_manage_projects",
    "can_manage_system_settings",
    "can_view_audit_logs",
    "can_link_github_repos",
]


ROLE_PERMISSIONS = {
    Role.DEVELOPER.value: DEVELOPER_PERMISSIONS,
    Role.TEAM_LEAD.value: TEAM_LEAD_PERMISSIONS,
    Role.ADMIN.value: ADMIN_PERMISSIONS,
}


# ---------------------------------------------------------------------------
# Role hierarchy – higher value = more privileged
# ---------------------------------------------------------------------------
ROLE_HIERARCHY = {
    Role.DEVELOPER: 0,
    Role.TEAM_LEAD: 1,
    Role.ADMIN: 2,
}


def _role_level(role_value):
    """Return the numeric hierarchy level for a role string value."""
    for role_enum, level in ROLE_HIERARCHY.items():
        if role_enum.value == role_value:
            return level
    return -1


def has_permission(role_value, permission):
    """Check whether *role_value* (a string such as 'admin') grants *permission*."""
    return permission in ROLE_PERMISSIONS.get(role_value, [])


# ---------------------------------------------------------------------------
# Decorators
# ---------------------------------------------------------------------------


def require_role(role):
    """Decorator to require a specific role"""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            user_role = claims.get("role")
            expected_role = role.value if isinstance(role, Role) else role

            if not user_role or user_role != expected_role:
                return jsonify({"message": "Insufficient role permissions"}), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator


def require_permission(permission):
    """Decorator to require a specific permission"""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            user_role = claims.get("role")

            if not user_role or permission not in ROLE_PERMISSIONS.get(user_role, []):
                return jsonify({"message": "Insufficient permissions"}), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator


def role_at_least(min_role):
    """Decorator that requires the caller's role to be *min_role* or higher.

    Example::

        @role_at_least(Role.TEAM_LEAD)
        def some_view(): ...
    """
    min_role_enum = min_role if isinstance(min_role, Role) else Role(min_role)
    min_level = ROLE_HIERARCHY[min_role_enum]

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            user_role = claims.get("role")
            if not user_role or _role_level(user_role) < min_level:
                return jsonify({"message": "Insufficient permissions"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def get_user_project_ids(user_id):
    """Project IDs *user_id* belongs to (team member or creator). Empty set on bad input/DB error."""
    user_id = _to_int(user_id)
    if user_id is None:
        return set()

    from ..db.models import Project, db, project_members

    ids = set()
    try:
        rows = db.session.query(project_members.c.project_id).filter(project_members.c.user_id == user_id).all()
        ids.update(row[0] for row in rows)
        created = Project.query.filter_by(created_by=user_id).with_entities(Project.id).all()
        ids.update(row[0] for row in created)
    except Exception:
        pass
    ids.discard(None)
    return ids


def _is_project_member_or_creator(user_id, project_id):
    """True when *user_id* is a team member or the creator of *project_id*."""
    project_id = _to_int(project_id)
    if project_id is None:
        return False

    from ..db.models import Project, db, project_members

    try:
        if (
            db.session.query(project_members)
            .filter_by(project_id=project_id, user_id=user_id)
            .first()
            is not None
        ):
            return True
    except Exception:
        pass
    try:
        project = db.session.get(Project, project_id)
    except Exception:
        project = None
    return project is not None and _to_int(getattr(project, "created_by", None)) == user_id


def _task_visible_to(task, user_id):
    """A task is visible to project members/creators, plus its assignee and creator."""
    if task is None:
        return False
    if _to_int(getattr(task, "assigned_to", None)) == user_id:
        return True
    if _to_int(getattr(task, "created_by", None)) == user_id:
        return True
    return _is_project_member_or_creator(user_id, getattr(task, "project_id", None))


def require_project_membership(fn):
    """Central gate against cross-project disclosure.

    Resolves the project in scope from the view kwargs — ``project_id``
    directly, ``task_id`` via the task's project (assignee/creator also pass),
    or ``repo_id`` via projects with tasks linked to that repo (unlinked repos
    expose only the caller's own GitHub data, so they pass). Admins bypass.
    Missing objects yield 404 (no existence oracle); denial yields 403.
    Assumes ``@jwt_required`` ran first.
    """

    @wraps(fn)
    def wrapper(*args, **kwargs):
        identity = get_jwt_identity()
        user_id = identity.get("user_id") if isinstance(identity, dict) else identity
        user_id = _to_int(user_id)
        if user_id is None:
            return jsonify({"message": "Invalid user identity"}), 401
        claims = get_jwt()
        if claims.get("role") == Role.ADMIN.value:
            return fn(*args, **kwargs)

        from ..db.models import GitHubRepository, Project, Task, TaskGitHubLink, db

        if "task_id" in kwargs:
            task_id = _to_int(kwargs.get("task_id"))
            try:
                task = db.session.get(Task, task_id) if task_id is not None else None
            except Exception:
                task = None
            if task is None:
                return jsonify({"message": "Task not found"}), 404
            if not _task_visible_to(task, user_id):
                return jsonify({"message": "Task not found"}), 404
            return fn(*args, **kwargs)

        if "project_id" in kwargs:
            project_id = _to_int(kwargs.get("project_id"))
            try:
                project = db.session.get(Project, project_id) if project_id is not None else None
            except Exception:
                project = None
            if project is None:
                return jsonify({"message": "Project not found"}), 404
            if not _is_project_member_or_creator(user_id, project_id):
                return jsonify({"message": "You are not a member of this project"}), 403
            return fn(*args, **kwargs)

        if "repo_id" in kwargs:
            repo_id = _to_int(kwargs.get("repo_id"))
            try:
                repo = db.session.get(GitHubRepository, repo_id) if repo_id is not None else None
            except Exception:
                repo = None
            if repo is None:
                return jsonify({"message": "Repository not found"}), 404
            try:
                links = TaskGitHubLink.query.filter_by(repo_id=repo_id).all()
            except Exception:
                links = []
            linked_project_ids = set()
            for link in links:
                try:
                    task = db.session.get(Task, link.task_id)
                except Exception:
                    task = None
                if task is not None and _to_int(getattr(task, "project_id", None)) is not None:
                    linked_project_ids.add(_to_int(task.project_id))
            if linked_project_ids and not any(
                _is_project_member_or_creator(user_id, pid) for pid in linked_project_ids
            ):
                return jsonify({"message": "You are not a member of this project"}), 403
            return fn(*args, **kwargs)

        return fn(*args, **kwargs)

    return wrapper
