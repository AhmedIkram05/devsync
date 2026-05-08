"""
Notification recipient calculator for role-based notification filtering.
Determines who should receive notifications based on user roles, project scope, and action type.
"""

from ..db.models import Task, Project, User
from ..db.db_connection import db
from .task_rules import get_project_scope_ids


def _to_int(value):
    """Safe int conversion"""
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def get_tls_for_project(project_id):
    """Get all Team Leads assigned to a project"""
    project_id = _to_int(project_id)
    if project_id is None:
        return []
    
    try:
        project = db.session.get(Project, project_id)
        if not project:
            return []
        
        team_leads = []
        members = getattr(project, 'team_members', []) or []
        if hasattr(members, 'all'):
            members = members.all()
        
        for member in members:
            if member is None:
                continue
            role = getattr(member, 'role', None)
            if role == 'team_lead':
                team_leads.append(member.id)
        
        return team_leads
    except Exception:
        return []


def get_admins_for_project(project_id):
    """Get the admin (creator) of a project"""
    project_id = _to_int(project_id)
    if project_id is None:
        return []
    
    try:
        project = db.session.get(Project, project_id)
        if not project:
            return []
        
        creator_id = getattr(project, 'created_by', None)
        if creator_id:
            return [creator_id]
        return []
    except Exception:
        return []


def get_all_admins():
    """Get all admin users in the system"""
    try:
        admins = User.query.filter_by(role='admin').all()
        return [admin.id for admin in admins]
    except Exception:
        return []


def get_recipients_for_task_assign(task_id, assignee_id, project_id, assigner_id):
    """
    Get recipients for task assignment notification.
    
    Recipients:
    - The person being assigned (if not the assigner)
    """
    assignee_id = _to_int(assignee_id)
    assigner_id = _to_int(assigner_id)
    
    if assignee_id is None or assignee_id == assigner_id:
        return []
    
    return [assignee_id]


def get_recipients_for_task_create(task_id, project_id, creator_id, assignee_id=None):
    """
    Get recipients for task creation notification.
    
    Recipients:
    - The assignee (if assigned)
    - All Team Leads of the project
    - The project creator (admin)
    """
    project_id = _to_int(project_id)
    creator_id = _to_int(creator_id)
    assignee_id = _to_int(assignee_id)
    
    recipients = set()
    
    # Notify the assignee
    if assignee_id is not None and assignee_id != creator_id:
        recipients.add(assignee_id)
    
    # Notify project TLs
    if project_id:
        tls = get_tls_for_project(project_id)
        for tl_id in tls:
            if tl_id != creator_id and tl_id != assignee_id:
                recipients.add(tl_id)
        
        # Notify project creator (admin)
        admins = get_admins_for_project(project_id)
        for admin_id in admins:
            if admin_id != creator_id and admin_id != assignee_id:
                recipients.add(admin_id)
    
    return list(recipients)


def get_recipients_for_task_update(task_id, project_id, updater_id, assignee_id=None):
    """
    Get recipients for task update notification.
    
    Recipients:
    - The assigned person (if task is assigned to them and they're not the updater)
    - All Team Leads of the project (for visibility of project-wide task updates)
    - Project admin
    """
    project_id = _to_int(project_id)
    updater_id = _to_int(updater_id)
    assignee_id = _to_int(assignee_id)
    
    recipients = set()
    
    # Notify the assignee
    if assignee_id is not None and assignee_id != updater_id:
        recipients.add(assignee_id)
    
    # Notify project TLs and project admin
    if project_id:
        tls = get_tls_for_project(project_id)
        for tl_id in tls:
            if tl_id != updater_id:
                recipients.add(tl_id)
        
        admins = get_admins_for_project(project_id)
        for admin_id in admins:
            if admin_id != updater_id:
                recipients.add(admin_id)
    
    return list(recipients)


def get_recipients_for_overdue_task(task_id, project_id, assignee_id):
    """
    Get recipients for overdue task notification.
    
    Recipients:
    - The assigned person (if assigned)
    - All Team Leads of the project
    - All Admins
    """
    project_id = _to_int(project_id)
    assignee_id = _to_int(assignee_id)
    
    recipients = set()
    
    # Notify the assignee
    if assignee_id is not None:
        recipients.add(assignee_id)
    
    # Notify project TLs and project admin
    if project_id:
        tls = get_tls_for_project(project_id)
        for tl_id in tls:
            recipients.add(tl_id)
        
        admins = get_admins_for_project(project_id)
        for admin_id in admins:
            recipients.add(admin_id)
    
    # Also notify all app-wide admins
    all_admins = get_all_admins()
    for admin_id in all_admins:
        recipients.add(admin_id)
    
    return list(recipients)


def get_recipients_for_project_member_add(project_id, new_member_id, adder_id):
    """
    Get recipients for project member add notification.
    
    Recipients:
    - The new member
    - All existing Team Leads in the project
    - Project admin
    """
    project_id = _to_int(project_id)
    new_member_id = _to_int(new_member_id)
    adder_id = _to_int(adder_id)
    
    recipients = set()
    
    # Notify the new member
    if new_member_id is not None:
        recipients.add(new_member_id)
    
    # Notify project TLs and admin
    if project_id:
        tls = get_tls_for_project(project_id)
        for tl_id in tls:
            if tl_id != new_member_id and tl_id != adder_id:
                recipients.add(tl_id)
        
        admins = get_admins_for_project(project_id)
        for admin_id in admins:
            if admin_id != new_member_id and admin_id != adder_id:
                recipients.add(admin_id)
    
    return list(recipients)


def get_recipients_for_report_available(project_id, creator_id):
    """
    Get recipients for 'report available for download' notification.
    
    Recipients:
    - The creator (if they're a TL/Admin)
    - All Team Leads of the project
    - All Admins
    """
    project_id = _to_int(project_id)
    creator_id = _to_int(creator_id)
    
    recipients = set()
    
    # Notify the creator
    if creator_id is not None:
        recipients.add(creator_id)
    
    # Notify project TLs
    if project_id:
        tls = get_tls_for_project(project_id)
        for tl_id in tls:
            recipients.add(tl_id)
        
        admins = get_admins_for_project(project_id)
        for admin_id in admins:
            recipients.add(admin_id)
    
    # Also notify all app-wide admins
    all_admins = get_all_admins()
    for admin_id in all_admins:
        recipients.add(admin_id)
    
    return list(recipients)


def get_recipients_for_user_crud(action_type, affected_user_id):
    """
    Get recipients for user CRUD operations (create, update, delete, role change).
    
    Recipients:
    - All Admins only
    
    Args:
        action_type: 'user_created', 'user_updated', 'user_deleted', 'user_role_changed'
        affected_user_id: The ID of the user being created/updated/deleted
    """
    # Only notify admins about user CRUD
    return get_all_admins()
