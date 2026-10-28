# Dashboard controller - business logic for user dashboards
import logging
from datetime import datetime, timedelta

from flask import jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload

from ...auth.rbac import Role  # Changed to relative import
from ...db.db_connection import db
from ...db.models import (  # Changed to relative import
    GitHubRepository,
    Project,
    Task,
    TaskGitHubLink,
    User,
    project_members,
)
from ...services.task_rules import OVERDUE_EXCLUDED_STATUSES, get_project_scope_ids
from .helpers import safe_query_all as _safe_query_all  # noqa: F401 (back-compat re-export)

# Root logging is owned by app config; library modules only get a namespaced logger.
logger = logging.getLogger(__name__)

COMPLETED_TASK_STATUSES = {"done", "completed"}
TEAM_LEAD_ACTIVE_PROJECT_STATUSES = {"active", "on_hold"}
IN_REVIEW_TASK_STATUSES = {"review", "in_review", "in-review"}


def _is_completed_status(status):
    return status in COMPLETED_TASK_STATUSES


def _is_completed_task(task):
    return _is_completed_status(getattr(task, "status", None))


def _task_to_dashboard_item(task):
    project = getattr(task, "project", None)
    return {
        "id": getattr(task, "id", None),
        "title": getattr(task, "title", None),
        "description": getattr(task, "description", None),
        "status": getattr(task, "status", None),
        "priority": getattr(task, "priority", None),
        "progress": getattr(task, "progress", 0) or 0,
        "deadline": getattr(task, "deadline", None).isoformat() if getattr(task, "deadline", None) else None,
        "project_id": getattr(task, "project_id", None),
        "project_name": project.name if project else None,
        "updated_at": getattr(task, "updated_at", None).isoformat() if getattr(task, "updated_at", None) else None,
        "created_at": getattr(task, "created_at", None).isoformat() if getattr(task, "created_at", None) else None,
    }


def _github_activity_to_item(link):
    task = getattr(link, "task", None)
    repository = getattr(link, "repository", None)
    event_type = "pull_request" if link.pull_request_number else "issue" if link.issue_number else "repository"
    label_number = link.pull_request_number or link.issue_number
    repo_url = repository.repo_url if repository else None
    if repo_url and label_number:
        if link.pull_request_number:
            repo_url = f"{repo_url.rstrip('/')}/pull/{link.pull_request_number}"
        elif link.issue_number:
            repo_url = f"{repo_url.rstrip('/')}/issues/{link.issue_number}"

    return {
        "id": link.id,
        "type": event_type,
        "title": task.title if task else "GitHub linked task",
        "repo": repository.repo_name if repository else "Unknown repository",
        "url": repo_url,
        "date": link.created_at.isoformat() if link.created_at else None,
        "label": f"#{label_number}" if label_number else "Linked repository",
    }


def get_user_tasks(user_id):
    """Helper function to get all tasks for a user"""
    try:
        # joinedload: serializers read task.project per row — without it,
        # every dashboard row fires its own query (N+1).
        return Task.query.options(joinedload(Task.project)).filter_by(assigned_to=user_id).all()
    except Exception as e:
        logger.error(f"Error fetching user tasks: {str(e)}")
        return []


def get_tasks_due_soon(user_id=None, project_ids=None):
    """Helper function to get tasks due soon for a user or a set of projects"""
    try:
        today = datetime.now().date()
        week_later = today + timedelta(days=7)
        query = (
            Task.query.filter(Task.deadline.isnot(None))
            .filter(Task.deadline.between(today, week_later))
            .filter(~Task.status.in_(COMPLETED_TASK_STATUSES))
        )

        if project_ids:
            query = query.filter(Task.project_id.in_(project_ids))
        elif user_id is not None:
            query = query.filter(Task.assigned_to == user_id)

        return query.options(joinedload(Task.project)).all()
    except Exception as e:
        logger.error(f"Error fetching tasks due soon: {str(e)}")
        return []


def get_recent_completed_tasks(user_id, timeframe="month"):
    """Helper function to get recent completed tasks for a user, bounding extreme date filters."""
    try:
        today = datetime.now().date()
        days_map = {"week": 7, "month": 30, "quarter": 90, "year": 365, "century": 36500}
        days = days_map.get(timeframe, 30)

        # Boundary fallback: default to 30 days if the timeframe exceeds 5 years (e.g. century)
        if days > 1825:
            days = 30

        time_ago = today - timedelta(days=days)
        return (
            Task.query.options(joinedload(Task.project))
            .filter_by(assigned_to=user_id)
            .filter(
                Task.status.in_(COMPLETED_TASK_STATUSES),
                Task.updated_at >= time_ago,
            )
            .all()
        )
    except Exception as e:
        logger.error(f"Error fetching completed tasks: {str(e)}")
        return []


def get_project_tasks(project_id):
    """Helper function to get all tasks for a project"""
    try:
        return Task.query.options(joinedload(Task.project)).filter_by(project_id=project_id).all()
    except Exception as e:
        logger.error(f"Error fetching project tasks: {str(e)}")
        return []


def get_project_tasks_due_soon(project_id):
    """Helper function to get tasks due soon for a project"""
    try:
        today = datetime.now().date()
        week_later = today + timedelta(days=7)
        return (
            Task.query.filter_by(project_id=project_id)
            .filter(Task.deadline.isnot(None))
            .filter(Task.deadline.between(today, week_later))
            .filter(~Task.status.in_(COMPLETED_TASK_STATUSES))
            .all()
        )
    except Exception as e:
        logger.error(f"Error fetching project tasks due soon: {str(e)}")
        return []


def get_recent_updated_project_tasks(project_id):
    """Helper function to get recently updated project tasks"""
    try:
        return Task.query.filter_by(project_id=project_id).order_by(Task.updated_at.desc()).limit(5).all()
    except Exception as e:
        logger.error(f"Error fetching updated project tasks: {str(e)}")
        return []


def get_user_dashboard():
    """Controller function to get dashboard data for the current user"""
    try:
        user_id = get_jwt_identity()["user_id"]
        claims = get_jwt()
        user_role = claims.get("role")

        # Log the request details for debugging
        logger.info(f"Getting dashboard for user ID: {user_id}, role: {user_role}")

        # Get basic user info
        user = User.query.get(user_id)
        if not user:
            logger.error(f"User not found: {user_id}")
            return jsonify({"message": "User not found"}), 404

        # Counts come from one GROUP BY — loading every row into Python just
        # to count it is what made this endpoint degrade (see get_client_dashboard).
        assigned_count, pending_count, completed_count = _assigned_task_counts(user_id)

        # Get tasks due soon (within 7 days)
        tasks_due_soon = get_tasks_due_soon(user_id)

        # Get recently completed tasks (last 30 days)
        completed_tasks = get_recent_completed_tasks(user_id)

        # Get projects user is part of
        user_projects = user.projects.all()  # Assuming a many-to-many relationship exists

        # Format response data
        dashboard_data = {
            "user": {"id": user.id, "name": user.name, "role": user.role},
            "tasks": {
                "assigned_count": assigned_count,
                "pending_count": pending_count,
                "completed_count": completed_count,
                "due_soon": [
                    {
                        "id": task.id,
                        "title": task.title,
                        "deadline": task.deadline.isoformat() if task.deadline else None,
                        "status": task.status,
                        "project_id": task.project_id,
                    }
                    for task in tasks_due_soon
                ],
                "recently_completed": [
                    {
                        "id": task.id,
                        "title": task.title,
                        "completed_date": task.updated_at.isoformat() if task.updated_at else None,
                        "project_id": task.project_id,
                    }
                    for task in completed_tasks[:5]
                ],  # Limit to 5 most recent
            },
            "projects": [
                {"id": project.id, "name": project.name, "status": project.status} for project in user_projects
            ],
        }

        # Add admin-specific data
        if user_role == Role.ADMIN.value:
            # Get team stats if they're an admin (project manager)
            dashboard_data["team"] = _admin_created_team_counts(user_id)

        return jsonify(dashboard_data)
    except Exception:
        logger.error("Error in get_user_dashboard", exc_info=True)
        return jsonify({"message": "An error occurred while loading the dashboard"}), 500


def get_client_dashboard():
    """Controller function to get dashboard data for a developer or team lead."""
    try:
        user_id = get_jwt_identity()["user_id"]
        claims = get_jwt()
        user_role = claims.get("role")

        # Log the request details for debugging
        logger.info(f"Getting member dashboard for user ID: {user_id}, role: {user_role}")

        # Get basic user info
        user = User.query.get(user_id)
        if not user:
            logger.error(f"User not found: {user_id}")
            return jsonify({"message": "User not found"}), 404

        user_projects = list(user.projects.all())
        if user_role == Role.TEAM_LEAD.value:
            seen_project_ids = {project.id for project in user_projects}
            for project in Project.query.filter_by(created_by=user_id).all():
                if project.id not in seen_project_ids:
                    user_projects.append(project)
                    seen_project_ids.add(project.id)

        project_ids = [project.id for project in user_projects]
        is_team_lead = user_role == Role.TEAM_LEAD.value

        # Counts come from one GROUP BY — loading every row into Python just
        # to count it is what made this endpoint degrade per row as data grew.
        scope_filter = Task.project_id.in_(project_ids) if is_team_lead else (Task.assigned_to == user_id)
        try:
            status_rows = (
                db.session.query(Task.status, func.count(Task.id)).filter(scope_filter).group_by(Task.status).all()
            )
        except Exception as e:
            logger.error(f"Error counting scoped tasks: {str(e)}")
            status_rows = []
        status_counts = {status or "unknown": count for status, count in status_rows}

        if is_team_lead:
            tasks_due_soon = get_tasks_due_soon(project_ids=project_ids)
        else:
            tasks_due_soon = get_tasks_due_soon(user_id=user_id)

        # Recent list is capped in the DB (ORDER BY + LIMIT), not sorted in
        # Python after loading the whole table. 50 is a UI page, not a loss:
        # counts above still reflect the full scope.
        try:
            recent_tasks = (
                Task.query.options(joinedload(Task.project))
                .filter(scope_filter)
                .order_by(Task.updated_at.desc())
                .limit(50)
                .all()
            )
        except Exception as e:
            logger.error(f"Error fetching recent scoped tasks: {str(e)}")
            recent_tasks = []

        done_count = status_counts.get("done", 0) + status_counts.get("completed", 0)
        task_stats = {
            "total": sum(status_counts.values()),
            "assigned": sum(status_counts.values()),
            "todo": status_counts.get("todo", 0),
            "in_progress": status_counts.get("in_progress", 0),
            "review": status_counts.get("review", 0),
            "done": done_count,
            "due_soon": len(tasks_due_soon),
        }

        github_activity = []
        try:
            recent_links_query = TaskGitHubLink.query.join(Task).outerjoin(GitHubRepository)
            if is_team_lead and project_ids:
                recent_links_query = recent_links_query.filter(Task.project_id.in_(project_ids))
            else:
                recent_links_query = recent_links_query.filter(Task.assigned_to == user_id)

            recent_links = (
                recent_links_query.options(joinedload(TaskGitHubLink.task), joinedload(TaskGitHubLink.repository))
                .order_by(TaskGitHubLink.created_at.desc())
                .limit(5)
                .all()
            )
            github_activity = [_github_activity_to_item(link) for link in recent_links]
        except Exception as e:
            logger.error(f"Error fetching GitHub activity for client dashboard: {str(e)}")
            github_activity = []

        # Format response data
        dashboard_data = {
            "taskCounts": task_stats,
            "tasks": task_stats,
            "recentTasks": [_task_to_dashboard_item(task) for task in recent_tasks],
            # upcomingDeadlines is the single due-soon payload; the old
            # tasks_due_soon key duplicated the same rows in a thinner shape.
            "upcomingDeadlines": [_task_to_dashboard_item(task) for task in tasks_due_soon],
            "githubActivity": github_activity,
            "projects": [
                {"id": project.id, "name": project.name, "status": project.status} for project in user_projects
            ],
        }

        return jsonify(dashboard_data)
    except Exception:
        logger.error("Error in get_client_dashboard", exc_info=True)
        return jsonify({"message": "An error occurred while loading the dashboard"}), 500


def _grouped_counts(rows):
    """Turn (key, count) GROUP BY rows into a {key: count} mapping."""
    return {(key or "unknown"): count for key, count in rows}


def _assigned_task_counts(user_id):
    """(assigned, pending, completed) for a user, from one GROUP BY.

    Rows are only loaded when the aggregate query itself fails (e.g.
    lightweight unit-test apps with no database bound), matching the
    degraded-mode style of the other helpers here.
    """
    try:
        rows = (
            db.session.query(Task.status, func.count(Task.id))
            .filter(Task.assigned_to == user_id)
            .group_by(Task.status)
            .all()
        )
    except Exception as e:
        logger.error(f"Error counting assigned tasks: {str(e)}")
        tasks = get_user_tasks(user_id)
        completed = len([t for t in tasks if _is_completed_task(t)])
        return len(tasks), len(tasks) - completed, completed
    counts = _grouped_counts(rows)
    total = sum(counts.values())
    completed = counts.get("done", 0) + counts.get("completed", 0)
    return total, total - completed, completed


def _admin_created_team_counts(user_id):
    """Task status counts across the projects *user_id* created, from one GROUP BY."""
    try:
        rows = (
            db.session.query(Task.status, func.count(Task.id))
            .join(Project, Task.project_id == Project.id)
            .filter(Project.created_by == user_id)
            .group_by(Task.status)
            .all()
        )
    except Exception as e:
        logger.error(f"Error counting team tasks: {str(e)}")
        try:
            team_tasks = (
                Task.query.join(Project, Task.project_id == Project.id).filter(Project.created_by == user_id).all()
            )
        except Exception:
            team_tasks = []
        return {
            "total_tasks": len(team_tasks),
            "completed_tasks": len([t for t in team_tasks if _is_completed_task(t)]),
            "in_progress_tasks": len([t for t in team_tasks if t.status == "in_progress"]),
            "pending_tasks": len([t for t in team_tasks if t.status == "todo"]),
        }
    counts = _grouped_counts(rows)
    return {
        "total_tasks": sum(counts.values()),
        "completed_tasks": counts.get("done", 0) + counts.get("completed", 0),
        "in_progress_tasks": counts.get("in_progress", 0),
        "pending_tasks": counts.get("todo", 0),
    }


def _task_status_counts():
    try:
        rows = db.session.query(Task.status, func.count(Task.id)).group_by(Task.status).all()
    except Exception as e:
        logger.error(f"Error counting tasks by status: {str(e)}")
        rows = []
    return _grouped_counts(rows)


def _user_role_counts():
    try:
        rows = db.session.query(User.role, func.count(User.id)).group_by(User.role).all()
    except Exception as e:
        logger.error(f"Error counting users by role: {str(e)}")
        rows = []
    counts = _grouped_counts(rows)
    return {
        "total": sum(counts.values()),
        "admin": counts.get(Role.ADMIN.value, 0),
        "team_lead": counts.get(Role.TEAM_LEAD.value, 0),
        "developer": counts.get(Role.DEVELOPER.value, 0),
    }


def _count_overdue_tasks(project_ids):
    """Count overdue tasks (past deadline, not completed/review) within scope."""
    today = datetime.now().date()
    try:
        query = Task.query.filter(
            Task.deadline.isnot(None),
            Task.deadline < today,
            ~Task.status.in_(OVERDUE_EXCLUDED_STATUSES),
        )
        if project_ids is not None:
            query = query.filter(Task.project_id.in_(project_ids))
        return query.count()
    except Exception as e:
        logger.error(f"Error counting overdue tasks: {str(e)}")
        return 0


def _admin_task_stats(project_ids):
    status_counts = _task_status_counts()
    return {
        "total": sum(status_counts.values()),
        "backlog": status_counts.get("backlog", 0),
        "todo": status_counts.get("todo", 0),
        "in_progress": status_counts.get("in_progress", 0),
        "review": status_counts.get("review", 0),
        "done": status_counts.get("done", 0) + status_counts.get("completed", 0),
        "overdue": _count_overdue_tasks(project_ids),
    }


def _my_assigned_tasks(user_id):
    try:
        return (
            Task.query.options(joinedload(Task.project))
            .filter_by(assigned_to=user_id)
            .order_by(Task.updated_at.desc())
            .limit(50)
            .all()
        )
    except Exception as e:
        logger.error(f"Error fetching assigned tasks for admin dashboard: {str(e)}")
        return []


def _project_task_counts(project_ids):
    if not project_ids:
        return {}
    try:
        rows = (
            db.session.query(Task.project_id, func.count(Task.id))
            .filter(Task.project_id.in_(project_ids))
            .group_by(Task.project_id)
            .all()
        )
    except Exception as e:
        logger.error(f"Error counting tasks per project: {str(e)}")
        rows = []
    return {project_id: count for project_id, count in rows}


def _recent_projects():
    try:
        projects = Project.query.order_by(Project.updated_at.desc()).limit(3).all()
    except Exception as e:
        logger.error(f"Error fetching recent projects for admin dashboard: {str(e)}")
        return []
    task_counts = _project_task_counts([p.id for p in projects])
    return [
        {
            "id": p.id,
            "name": p.name,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "task_count": task_counts.get(p.id, 0),
        }
        for p in projects
    ]


def _team_lead_project_ids(user_id):
    """IDs of active/on-hold projects the team lead owns or is a member of.

    One membership join replaces the old Project.query.all() + lazy
    team_members-per-project N+1 that ran on every TL admin-dashboard poll.
    """
    normalized_status = func.lower(func.replace(Project.status, "-", "_"))
    try:
        rows = (
            db.session.query(Project.id)
            .outerjoin(project_members, project_members.c.project_id == Project.id)
            .filter(
                normalized_status.in_(TEAM_LEAD_ACTIVE_PROJECT_STATUSES),
                or_(Project.created_by == user_id, project_members.c.user_id == user_id),
            )
            .all()
        )
    except Exception as e:
        logger.error(f"Error fetching projects for TL dashboard: {str(e)}")
        return []
    return [row[0] for row in rows]


def _count_scoped_tasks(project_ids, *criteria):
    if not project_ids:
        return 0
    try:
        return Task.query.filter(Task.project_id.in_(project_ids), *criteria).count()
    except Exception as e:
        logger.error(f"Error counting scoped tasks: {str(e)}")
        return 0


def _compute_team_lead_kpis(user_id):
    project_ids = _team_lead_project_ids(user_id)
    today = datetime.now().date()
    week_later = today + timedelta(days=7)
    normalized_status = func.lower(func.replace(Task.status, "-", "_"))
    not_completed = ~normalized_status.in_(OVERDUE_EXCLUDED_STATUSES)
    return {
        "in_review_tasks": _count_scoped_tasks(project_ids, func.lower(Task.status).in_(IN_REVIEW_TASK_STATUSES)),
        "due_soon_tasks": _count_scoped_tasks(
            project_ids,
            Task.deadline.isnot(None),
            Task.deadline.between(today, week_later),
            not_completed,
        ),
        "overdue_not_complete_tasks": _count_scoped_tasks(
            project_ids,
            Task.deadline.isnot(None),
            Task.deadline < today,
            not_completed,
        ),
        "current_projects": len(project_ids),
    }


def get_admin_dashboard():
    """Controller function to get admin dashboard data"""
    try:
        user_id = get_jwt_identity()["user_id"]
        claims = get_jwt()
        user_role = claims.get("role")

        # Check if user is admin or team lead
        if user_role not in [Role.ADMIN.value, Role.TEAM_LEAD.value]:
            logger.warning(f"Unauthorized user {user_id} with role {user_role} attempted to access admin dashboard")
            return jsonify({"message": "Unauthorized access"}), 403

        # Log the request details for debugging
        logger.info(f"Getting admin dashboard for user ID: {user_id}")

        # Get basic user info
        user = User.query.get(user_id)
        if not user:
            logger.error(f"User not found: {user_id}")
            return jsonify({"message": "User not found"}), 404

        admin_project_ids = get_project_scope_ids(user_id, user_role)

        dashboard_data = {
            "users": _user_role_counts(),
            "tasks": _admin_task_stats(admin_project_ids),
            "projects": {"total": Project.query.count()},
            "my_assigned_tasks": [_task_to_dashboard_item(t) for t in _my_assigned_tasks(user_id)],
        }

        if user_role == Role.TEAM_LEAD.value:
            dashboard_data["team_lead_kpis"] = _compute_team_lead_kpis(user_id)

        dashboard_data["recentProjects"] = _recent_projects()

        return jsonify(dashboard_data)
    except Exception:
        logger.error("Error in get_admin_dashboard", exc_info=True)
        return jsonify({"message": "An error occurred while loading the dashboard"}), 500


def _project_task_stats(project_id):
    """Project task counts from one GROUP BY, falling back to row counting."""
    try:
        rows = (
            db.session.query(Task.status, func.count(Task.id))
            .filter(Task.project_id == project_id)
            .group_by(Task.status)
            .all()
        )
    except Exception as e:
        logger.error(f"Error counting project tasks: {str(e)}")
        tasks = get_project_tasks(project_id)
        return {
            "total": len(tasks),
            "todo": len([t for t in tasks if t.status == "todo"]),
            "in_progress": len([t for t in tasks if t.status == "in_progress"]),
            "review": len([t for t in tasks if t.status == "review"]),
            "done": len([t for t in tasks if _is_completed_task(t)]),
        }
    counts = _grouped_counts(rows)
    return {
        "total": sum(counts.values()),
        "todo": counts.get("todo", 0),
        "in_progress": counts.get("in_progress", 0),
        "review": counts.get("review", 0),
        "done": counts.get("done", 0) + counts.get("completed", 0),
    }


def get_project_dashboard(project_id):
    """Controller function to get dashboard data for a specific project"""
    try:
        # Check if project exists
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"message": "Project not found"}), 404

        # Task statistics come from one GROUP BY (see get_client_dashboard)
        task_stats = _project_task_stats(project_id)

        # Calculate completion percentage
        completion_percentage = 0
        if task_stats["total"] > 0:
            completion_percentage = (task_stats["done"] / task_stats["total"]) * 100

        # Get tasks due soon (within 7 days)
        tasks_due_soon = get_project_tasks_due_soon(project_id)

        # Get recently updated tasks
        recently_updated = get_recent_updated_project_tasks(project_id)

        # Get team members (backref is a list when loaded from the DB,
        # a query when stubbed — handle both like the admin dashboard does).
        team_members = getattr(project, "team_members", []) or []
        if hasattr(team_members, "all"):
            team_members = team_members.all()

        dashboard_data = {
            "project": {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "status": project.status,
                "completion_percentage": completion_percentage,
            },
            "task_stats": task_stats,
            "tasks_due_soon": [
                {
                    "id": task.id,
                    "title": task.title,
                    "deadline": task.deadline.isoformat()
                    if task.deadline and hasattr(task.deadline, "isoformat")
                    else None,
                    "status": task.status,
                    "assigned_to": task.assigned_to,
                }
                for task in tasks_due_soon
            ],
            "recently_updated_tasks": [
                {
                    "id": task.id,
                    "title": task.title,
                    "status": task.status,
                    "updated_at": task.updated_at.isoformat() if task.updated_at else None,
                }
                for task in recently_updated
            ],
            "team_members": [{"id": member.id, "name": member.name, "role": member.role} for member in team_members],
        }

        return jsonify(dashboard_data)
    except Exception:
        logger.error("Error in get_project_dashboard", exc_info=True)
        return jsonify({"message": "An error occurred while loading the dashboard"}), 500
