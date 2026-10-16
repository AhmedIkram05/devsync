# Project controller - business logic

from flask import jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity
from sqlalchemy import or_

from ...auth.rbac import Role  # Changed to relative import
from ...db.models import Project, Task, User, db  # Changed to relative import
from ...db.models.models import project_members
from ...db.transaction import transactional
from ...services import audit_service
from ...socketio_server import emit_dashboard_refresh
from ..query_params import apply_sort, clean_search, get_pagination_args, paginate
from ..validators.project_validator import validate_project_data  # Changed to relative import

PROJECT_SORT_FIELDS = {
    "name": Project.name,
    "status": Project.status,
    "created_at": Project.created_at,
    "updated_at": Project.updated_at,
}

TASK_SORT_FIELDS = {
    "created_at": Task.created_at,
    "updated_at": Task.updated_at,
    "deadline": Task.deadline,
    "title": Task.title,
    "status": Task.status,
}


def _relationship_items(value):
    if value is None:
        return []
    if hasattr(value, "all"):
        return value.all()
    return list(value)


def _team_members_by_project(project_ids):
    """One query for every project's members on the page (avoids N+1 on the
    dynamic ``team_members`` relationship)."""
    if not project_ids:
        return {}
    rows = (
        db.session.query(project_members.c.project_id, User.id, User.name, User.role)
        .join(User, User.id == project_members.c.user_id)
        .filter(project_members.c.project_id.in_(project_ids))
        .all()
    )
    grouped = {project_id: [] for project_id in project_ids}
    for project_id, uid, name, role in rows:
        grouped[project_id].append({"id": uid, "name": name, "role": role})
    return grouped


def _apply_project_filters(query, status, search):
    if status:
        query = query.filter(Project.status == status)
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(Project.name.ilike(pattern), Project.description.ilike(pattern)))
    return query


def _serialize_project(project, member_map):
    members = member_map.get(project.id)
    if members is None:
        members = [
            {"id": member.id, "name": member.name, "role": member.role}
            for member in _relationship_items(project.team_members)
        ]
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "github_repo": project.github_repo,
        "created_by": project.created_by,
        "team_members": members,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


def get_all_projects():
    """Controller function to get all projects visible to the user"""
    user_id = get_jwt_identity()["user_id"]
    claims = get_jwt()
    user_role = claims.get("role")

    page, per_page = get_pagination_args()
    status = clean_search(request.args.get("status"))
    search = clean_search(request.args.get("search"))

    # Apply role-based access control for projects
    if user_role in [Role.ADMIN.value, Role.TEAM_LEAD.value]:
        # Admins and team leads can see all projects
        query = Project.query
    else:
        # Developers can only see projects they're assigned to
        user = User.query.get(user_id)
        query = user.projects

    query = _apply_project_filters(query, status, search)
    query = apply_sort(query, request.args.get("sort"), PROJECT_SORT_FIELDS, "-updated_at")
    projects, pagination = paginate(query, page, per_page)

    member_map = _team_members_by_project([project.id for project in projects])

    projects_data = [_serialize_project(project, member_map) for project in projects]

    return jsonify({"projects": projects_data, "pagination": pagination})


def get_project_by_id(project_id):
    """Controller function to get a specific project"""
    try:
        user_id = get_jwt_identity()["user_id"]
        claims = get_jwt()
        user_role = claims.get("role")

        project = Project.query.get_or_404(project_id)

        # Check if user has access to this project
        if user_role == Role.DEVELOPER.value:
            # Check if developer is assigned to this project
            user = User.query.get(user_id)
            if project not in user.projects:
                return jsonify({"message": "You do not have access to this project"}), 403

        # Get project creator's name
        creator = User.query.get(project.created_by)
        creator_name = creator.name if creator else "Unknown"

        # Get team members for this project
        team_members = [
            {"id": member.id, "name": member.name, "role": member.role}
            for member in _relationship_items(project.team_members)
        ]

        project_data = {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "status": project.status,
            "github_repo": project.github_repo,
            "created_by": project.created_by,
            "creator_name": creator_name,
            "team_members": team_members,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        }

        return jsonify({"project": project_data})
    except Exception:
        raise


@transactional
def create_project():
    """Controller function to create a new project"""
    data = request.get_json()

    # Validate project data
    validation_result = validate_project_data(data)
    if validation_result:
        return validation_result

    user_id = get_jwt_identity()["user_id"]

    # Create new project
    new_project = Project(
        name=data["name"],
        description=data["description"],
        status=data.get("status", "active"),
        github_repo=data.get("github_repo"),
        created_by=user_id,
    )

    db.session.add(new_project)

    # Add team members if provided
    if "team_members" in data and data["team_members"]:
        for member_id in data["team_members"]:
            member = User.query.get(member_id)
            if member:
                new_project.team_members.append(member)

    db.session.flush()

    audit_service.record(action="project_created", resource_type="project", resource_id=new_project.id)
    emit_dashboard_refresh(
        "project_created", resource_type="project", resource_id=new_project.id, payload={"status": new_project.status}
    )

    return jsonify(
        {
            "message": "Project created successfully",
            "project": {"id": new_project.id, "name": new_project.name, "status": new_project.status},
        }
    ), 201


@transactional
def update_project(project_id):
    """Controller function to update a project"""
    data = request.get_json()

    # Validate project data
    validation_result = validate_project_data(data, update=True)
    if validation_result:
        return validation_result

    project = Project.query.get_or_404(project_id)

    # Update allowed fields
    if "name" in data:
        project.name = data["name"]
    if "description" in data:
        project.description = data["description"]
    if "status" in data:
        project.status = data["status"]
    if "github_repo" in data:
        project.github_repo = data["github_repo"]

    # Update team members if provided
    if "team_members" in data:
        # Clear existing team members
        project.team_members = []

        # Add new team members
        for member_id in data["team_members"]:
            member = User.query.get(member_id)
            if member:
                project.team_members.append(member)

    db.session.flush()

    audit_service.record(
        action="project_updated",
        resource_type="project",
        resource_id=project.id,
        metadata={
            "status": project.status,
            "team_members": [member.id for member in _relationship_items(project.team_members)],
        },
    )
    emit_dashboard_refresh(
        "project_updated",
        resource_type="project",
        resource_id=project.id,
        payload={"status": project.status},
        project_id=project.id,
    )

    return jsonify(
        {
            "message": "Project updated successfully",
            "project": {"id": project.id, "name": project.name, "status": project.status},
        }
    )


@transactional
def delete_project(project_id):
    """Controller function to delete a project"""
    project = Project.query.get_or_404(project_id)

    db.session.delete(project)
    db.session.flush()

    audit_service.record(action="project_deleted", resource_type="project", resource_id=project_id)
    emit_dashboard_refresh("project_deleted", resource_type="project", resource_id=project_id, project_id=project_id)

    # Updated to return 204
    return "", 204


def get_project_tasks(project_id):
    """Controller function to get all tasks for a project"""
    user_id = get_jwt_identity()["user_id"]
    claims = get_jwt()
    user_role = claims.get("role")

    project = Project.query.get_or_404(project_id)

    # Check if user has access to this project
    if user_role == Role.DEVELOPER.value:
        # Check if developer is assigned to this project
        user = User.query.get(user_id)
        if project not in user.projects:
            return jsonify({"message": "You do not have access to this project"}), 403

    # Get tasks for this project
    page, per_page = get_pagination_args()
    status = clean_search(request.args.get("status"))

    query = Task.query.filter_by(project_id=project_id)
    if status:
        query = query.filter(Task.status == status)
    query = apply_sort(query, request.args.get("sort"), TASK_SORT_FIELDS, "-created_at")
    tasks, pagination = paginate(query, page, per_page)

    tasks_data = [
        {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "priority": task.priority,
            "progress": task.progress,
            "assigned_to": task.assigned_to,
            "created_by": task.created_by,
            "deadline": task.deadline.isoformat() if task.deadline else None,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        }
        for task in tasks
    ]

    return jsonify({"tasks": tasks_data, "pagination": pagination})
