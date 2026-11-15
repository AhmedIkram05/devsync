# Report controller - business logic for report operations

import logging
import math
from datetime import UTC, datetime, timedelta

from flask import jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity
from sqlalchemy import and_, case, func, or_

from src.socketio_server import emit_dashboard_refresh

from ...auth.rbac import Role
from ...db.models import Project, Report, Task, User, db, project_members
from ...db.transaction import transactional
from ...services import audit_service
from ...services.task_rules import COMPLETED_TASK_STATUSES, OVERDUE_EXCLUDED_STATUSES
from ..middlewares.error_handler import error_response
from ..validators.report_validator import validate_report_data
from .tasks_controller import _serialize_task

logger = logging.getLogger(__name__)

# Report data endpoint: server-side aggregation replaces the client-side
# "fetch every task page + every user, then reduce in JS" path.
REPORT_DATA_TYPES = ("tasks", "developers")
REPORT_DATE_RANGES = {"week": 7, "month": 30, "quarter": 90, "year": 365}
DETAILS_LIMIT = 1000
PROGRESS_ROLES = ("admin", "developer", "team_lead")


def _js_round(value):
    """JS Math.round parity: halves round up, not to even (Python's round())."""
    return int(math.floor(value + 0.5))


def _scoped_tasks(user_id, user_role):
    """Tasks visible to the caller, using the same rules as GET /tasks.

    The project scope is an inline UNION subquery rather than a
    ``get_user_project_ids`` lookup, so the whole report stays at two
    statements instead of four.
    """
    query = Task.query
    if user_role == Role.ADMIN.value:
        return query

    member_projects = db.session.query(project_members.c.project_id).filter(project_members.c.user_id == user_id)
    created_projects = db.session.query(Project.id).filter(Project.created_by == user_id)
    project_scope = member_projects.union(created_projects)
    return query.filter(
        or_(
            Task.assigned_to == user_id,
            Task.created_by == user_id,
            Task.project_id.in_(project_scope),
        )
    )


def _task_report_counts(query, now):
    """One conditional-aggregate query: total, completed, in-progress, overdue.

    ``team_members`` rides along as a scalar subquery so the whole summary is
    one round-trip instead of a second COUNT on users.
    """
    completed = func.lower(Task.status).in_(COMPLETED_TASK_STATUSES)
    overdue = and_(
        Task.deadline.isnot(None),
        Task.deadline < now,
        ~func.lower(Task.status).in_(OVERDUE_EXCLUDED_STATUSES),
    )
    team_members = db.session.query(func.count(User.id)).scalar_subquery()
    total, completed_count, in_progress, overdue_count, member_count = (
        query.with_entities(
            func.count(Task.id),
            func.count(case((completed, 1))),
            func.count(case((func.lower(Task.status) == "in_progress", 1))),
            func.count(case((overdue, 1))),
            team_members,
        )
        .order_by(None)
        .one()
    )
    return (
        int(total or 0),
        int(completed_count or 0),
        int(in_progress or 0),
        int(overdue_count or 0),
        int(member_count or 0),
    )


def _task_report_details(query):
    rows = (
        query.with_entities(Task, User.name)
        .outerjoin(User, Task.assigned_to == User.id)
        .order_by(Task.created_at.desc(), Task.id.desc())
        .limit(DETAILS_LIMIT)
        .all()
    )
    details = []
    for task, assignee_name in rows:
        item = _serialize_task(task)
        item["assignee_name"] = assignee_name
        details.append(item)
    return details


def _recent_tasks_by_user(user_ids):
    """Top-5 recent tasks per assignee in one window-function query (no N+1)."""
    if not user_ids:
        return {}

    ranked = (
        db.session.query(
            Task.id.label("task_id"),
            Task.assigned_to.label("assignee_id"),
            func.row_number()
            .over(
                partition_by=Task.assigned_to,
                order_by=(func.coalesce(Task.updated_at, Task.created_at).desc(), Task.id.desc()),
            )
            .label("position"),
        )
        .filter(Task.assigned_to.in_(user_ids))
        .subquery()
    )

    rows = (
        db.session.query(Task, ranked.c.assignee_id)
        .join(ranked, ranked.c.task_id == Task.id)
        .filter(ranked.c.position <= 5)
        .order_by(ranked.c.assignee_id.asc(), ranked.c.position.asc())
        .all()
    )

    grouped = {}
    for task, assignee_id in rows:
        grouped.setdefault(assignee_id, []).append(_serialize_task(task))
    return grouped


def _developer_report():
    """Per-developer progress from one GROUP BY plus one window query."""
    completed = func.lower(Task.status).in_(COMPLETED_TASK_STATUSES)
    rows = (
        db.session.query(
            User.id,
            User.name,
            User.role,
            func.count(Task.id).label("total"),
            func.count(case((completed, Task.id))).label("completed"),
        )
        .outerjoin(Task, Task.assigned_to == User.id)
        .filter(User.role.in_(PROGRESS_ROLES))
        .group_by(User.id, User.name, User.role)
        .order_by(User.name.asc(), User.id.asc())
        .all()
    )

    recent = _recent_tasks_by_user([row[0] for row in rows])
    details = []
    for user_id, name, role, total, completed_count in rows:
        total = int(total or 0)
        completed_count = int(completed_count or 0)
        details.append(
            {
                "id": user_id,
                "name": name,
                "role": role,
                "total_tasks": total,
                "completed_tasks": completed_count,
                "active_tasks": total - completed_count,
                "recent_tasks": recent.get(user_id, []),
            }
        )

    developer_count = len(details)
    total_tasks = sum(item["total_tasks"] for item in details)
    completed_tasks = sum(item["completed_tasks"] for item in details)
    summary = {
        "developers": developer_count,
        "avg_tasks": _js_round(total_tasks / developer_count) if developer_count else 0,
        "avg_completion": _js_round(completed_tasks / total_tasks * 100) if total_tasks else 0,
        "active_devs": sum(1 for item in details if item["active_tasks"] > 0),
    }
    return summary, details


def get_report_data():
    """Aggregate report data server-side for the tasks/developers report types.

    Replaces the client's page-everything-then-reduce path. GitHub reports stay
    client-side (they depend on the live GitHub API) and return 422 here.
    """
    user_id = get_jwt_identity()["user_id"]
    user_role = get_jwt().get("role")
    report_type = request.args.get("type", "tasks")
    date_range = request.args.get("date_range", "week")

    if report_type == "github":
        return error_response(
            "GitHub reports are generated client-side",
            "unsupported_report_type",
            422,
        )
    if report_type not in REPORT_DATA_TYPES:
        return error_response(
            "Invalid report type",
            "bad_request",
            400,
            details={"allowed": list(REPORT_DATA_TYPES)},
        )
    if date_range not in REPORT_DATE_RANGES:
        return error_response(
            "Invalid date range",
            "bad_request",
            400,
            details={"allowed": list(REPORT_DATE_RANGES)},
        )

    now = datetime.now(UTC)
    range_start = now - timedelta(days=REPORT_DATE_RANGES[date_range])

    try:
        if report_type == "developers":
            summary, details = _developer_report()
            row_count = len(details)
        else:
            query = _scoped_tasks(user_id, user_role).filter(Task.created_at >= range_start)
            total, completed, in_progress, overdue, team_members = _task_report_counts(query, now)
            details = _task_report_details(query)
            row_count = total
            summary = {
                "total": total,
                "completed": completed,
                "in_progress": in_progress,
                "overdue": overdue,
                "team_members": team_members,
            }
    except Exception:
        logger.error("Failed to build report data", exc_info=True)
        return jsonify({"message": "Failed to build report data"}), 500

    return (
        jsonify(
            {
                "summary": summary,
                "details": details[:DETAILS_LIMIT],
                "meta": {
                    "generated_at": now.isoformat(),
                    "range_start": range_start.isoformat(),
                    "truncated": row_count > DETAILS_LIMIT,
                    "row_count": row_count,
                },
            }
        ),
        200,
    )


@transactional
def save_report():
    """Controller function to save a generated report"""
    user_id = get_jwt_identity()["user_id"]
    data = request.get_json()

    # Validate report data
    validation_result = validate_report_data(data)
    if validation_result:
        return validation_result

    try:
        # Create new report record
        report = Report(
            user_id=user_id,
            report_type=data["report_type"],
            date_range=data["date_range"],
            summary=data["summary"],
            details=data["details"],
        )

        db.session.add(report)
        db.session.flush()

        audit_service.record(
            action="report_created",
            resource_type="report",
            resource_id=report.id,
            metadata={"report_type": report.report_type, "date_range": report.date_range},
        )
        emit_dashboard_refresh(
            "report_created",
            resource_type="report",
            resource_id=report.id,
            payload={"report_type": report.report_type, "date_range": report.date_range},
        )

        return jsonify({"message": "Report saved successfully", "report": report.to_dict()}), 201

    except Exception:
        db.session.rollback()
        logger.error("Failed to save report", exc_info=True)
        return jsonify({"message": "Failed to save report"}), 500


def get_reports():
    """Controller function to get saved reports for the current user or team"""
    user_id = get_jwt_identity()["user_id"]
    claims = get_jwt()
    user_role = claims.get("role")

    # Parse query parameters for filtering
    report_type = request.args.get("type")
    date_range = request.args.get("dateRange")
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)

    try:
        query = Report.query

        # Filter by user role
        if user_role in [Role.ADMIN.value, Role.TEAM_LEAD.value]:
            # Admins and team leads can see all reports
            pass
        else:
            # Developers can only see their own reports
            query = query.filter_by(user_id=user_id)

        # Apply optional filters
        if report_type:
            query = query.filter_by(report_type=report_type)
        if date_range:
            query = query.filter_by(date_range=date_range)

        # Sort by most recent first
        query = query.order_by(Report.generated_at.desc())

        # Paginate results
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)

        reports = [report.to_dict() for report in paginated.items]

        return jsonify(
            {
                "message": "Reports retrieved successfully",
                "reports": reports,
                "pagination": {"page": page, "per_page": per_page, "total": paginated.total, "pages": paginated.pages},
            }
        ), 200

    except Exception:
        logger.error("Failed to retrieve reports", exc_info=True)
        return jsonify({"message": "Failed to retrieve reports"}), 500


def get_report_by_id(report_id):
    """Controller function to get a specific report by ID"""
    user_id = get_jwt_identity()["user_id"]
    claims = get_jwt()
    user_role = claims.get("role")

    try:
        report = Report.query.get(report_id)
        if not report:
            return jsonify({"message": "Report not found"}), 404

        # Check permissions
        if user_role not in [Role.ADMIN.value, Role.TEAM_LEAD.value] and report.user_id != user_id:
            return jsonify({"message": "Unauthorized access to this report"}), 403

        return jsonify({"message": "Report retrieved successfully", "report": report.to_dict()}), 200

    except Exception:
        logger.error("Failed to retrieve report", exc_info=True)
        return jsonify({"message": "Failed to retrieve report"}), 500


@transactional
def delete_report(report_id):
    """Controller function to delete a report"""
    user_id = get_jwt_identity()["user_id"]
    claims = get_jwt()
    user_role = claims.get("role")

    try:
        report = Report.query.get(report_id)
        if not report:
            return jsonify({"message": "Report not found"}), 404

        # Check permissions - can only delete own reports unless admin
        if user_role not in [Role.ADMIN.value] and report.user_id != user_id:
            return jsonify({"message": "Unauthorized to delete this report"}), 403

        db.session.delete(report)
        db.session.flush()

        audit_service.record(
            action="report_deleted",
            resource_type="report",
            resource_id=report_id,
            metadata={"report_type": report.report_type, "date_range": report.date_range},
        )
        emit_dashboard_refresh(
            "report_deleted",
            resource_type="report",
            resource_id=report_id,
            payload={"report_type": report.report_type, "date_range": report.date_range},
        )

        return jsonify({"message": "Report deleted successfully"}), 200

    except Exception:
        db.session.rollback()
        logger.error("Failed to delete report", exc_info=True)
        return jsonify({"message": "Failed to delete report"}), 500
