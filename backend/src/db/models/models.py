# This file contains the models for the database tables.

from datetime import datetime, timezone
from sqlalchemy import Index, CheckConstraint
from ..db_connection import db

# User-Project association table for many-to-many relationship
project_members = db.Table('project_members',
    db.Column('project_id', db.Integer, db.ForeignKey('projects.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('users.id'), primary_key=True)
)

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    github_username = db.Column(db.String(100))
    github_connected = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Fix __table_args__ by creating a tuple containing all indices
    __table_args__ = (
        Index('idx_users_email', 'email'),
        Index('idx_users_role', 'role'),
        CheckConstraint(
            "role IN ('developer', 'team_lead', 'admin')", 
            name='check_valid_role'
        ),
    )
    
    # Relationships
    created_tasks = db.relationship('Task', backref='creator', foreign_keys='Task.created_by')
    assigned_tasks = db.relationship('Task', backref='assignee', foreign_keys='Task.assigned_to')
    github_tokens = db.relationship('GitHubToken', backref='user', lazy=True)
    comments = db.relationship('Comment', backref='user', lazy=True)
    # Fix: Change the backref name to resolve the conflict
    notifications = db.relationship('Notification', backref='user_account', lazy=True)
    projects = db.relationship('Project', secondary=project_members, backref='team_members', lazy='dynamic')

    def __repr__(self):
        return f'<User {self.name}>'

class Task(db.Model):
    __tablename__ = 'tasks'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), nullable=False)
    priority = db.Column(db.String(20), default='medium')
    progress = db.Column(db.Integer, default=0)
    assigned_to = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    deadline = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'))
    
    # Fix __table_args__ format
    __table_args__ = (
        Index('idx_tasks_assigned_to', 'assigned_to'),
        Index('idx_tasks_created_at', 'created_at'),
        Index('idx_tasks_created_by', 'created_by'),
        Index('idx_tasks_deadline', 'deadline'),
        Index('idx_tasks_deadline_status', 'deadline', 'status'),
        Index('idx_tasks_progress', 'progress'),
        Index('idx_tasks_status', 'status'),
        Index('idx_tasks_status_assigned', 'status', 'assigned_to'),
        Index('idx_tasks_updated_at', 'updated_at'),
    )
    
    # Relationships
    github_links = db.relationship('TaskGitHubLink', backref='task', lazy=True)
    comments = db.relationship('Comment', backref='task', lazy=True)
    notifications = db.relationship('Notification', backref='task', lazy=True)

    def __repr__(self):
        return f'<Task {self.title}>'

class GitHubToken(db.Model):
    __tablename__ = 'github_tokens'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    access_token = db.Column(db.String(255), nullable=False)
    refresh_token = db.Column(db.String(255))
    token_expires_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f'<GitHubToken {self.id} for User {self.user_id}>'

class GitHubRepository(db.Model):
    __tablename__ = 'github_repositories'
    
    id = db.Column(db.Integer, primary_key=True)
    repo_name = db.Column(db.String(255), nullable=False)
    repo_url = db.Column(db.String(255), nullable=False)
    github_id = db.Column(db.Integer)
    
    # Relationships
    task_links = db.relationship('TaskGitHubLink', backref='repository', lazy=True)

    def __repr__(self):
        return f'<GitHubRepository {self.repo_name}>'

class TaskGitHubLink(db.Model):
    __tablename__ = 'task_github_links'
    
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'), nullable=False)
    repo_id = db.Column(db.Integer, db.ForeignKey('github_repositories.id'), nullable=False)
    issue_number = db.Column(db.Integer)
    pull_request_number = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f'<TaskGitHubLink task:{self.task_id} repo:{self.repo_id}>'

class Comment(db.Model):
    __tablename__ = 'comments'
    
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f'<Comment {self.id} on Task {self.task_id}>'

class Notification(db.Model):
    """Notification model for storing user notifications"""
    __tablename__ = 'notifications'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    notification_type = db.Column(db.String(50), nullable=False)  # task, comment, mention, etc.
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    reference_id = db.Column(db.String(50), nullable=True)  # ID of related object (task_id, etc.)
    is_read = db.Column(db.Boolean, default=False)  # Changed from 'read' to 'is_read'
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    read_at = db.Column(db.DateTime, nullable=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'))

    # Add __table_args__ for indices
    __table_args__ = (
        Index('idx_notifications_created_at', 'created_at'),
        Index('idx_notifications_is_read', 'is_read'),  # Changed from 'read' to 'is_read'
        Index('idx_notifications_task_id', 'task_id'),
        Index('idx_notifications_user_id', 'user_id'),
    )

    def __repr__(self):
        return f"<Notification(id={self.id}, user_id={self.user_id}, type={self.notification_type})>"

    def to_dict(self):
        """Convert notification to dictionary"""
        created_at = self.created_at.isoformat() if self.created_at else None
        return {
            'id': self.id,
            'user_id': self.user_id,
            'notification_type': self.notification_type,
            'type': self.notification_type,
            'title': self.title,
            'message': self.message,
            'content': self.message,
            'reference_id': self.reference_id,
            'task_id': self.task_id,
            'is_read': self.is_read,
            'read': self.is_read,  # Keep API compatibility with older frontend code.
            'created_at': created_at,
            'timestamp': created_at,
            'read_at': self.read_at.isoformat() if self.read_at else None
        }

class Project(db.Model):
    """Project model representing development projects"""
    __tablename__ = 'projects'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(20), default='active')
    github_repo = db.Column(db.String(255))
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index('idx_projects_created_by', 'created_by'),
        Index('idx_projects_status', 'status'),
        Index('idx_projects_updated_at', 'updated_at'),
    )
    
    # Relationships
    tasks = db.relationship('Task', backref='project', lazy=True)
    
    def __repr__(self):
        return f'<Project {self.name}>'

class Report(db.Model):
    """Report model for storing generated reports"""
    __tablename__ = 'reports'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    report_type = db.Column(db.String(50), nullable=False)  # 'tasks', 'developers', 'github'
    date_range = db.Column(db.String(50), nullable=False)  # 'week', 'month', 'quarter', 'year'
    summary = db.Column(db.JSON, nullable=False)  # JSON object with summary metrics
    details = db.Column(db.JSON, nullable=False)  # JSON array with detailed data
    generated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    __table_args__ = (
        Index('idx_reports_user_id', 'user_id'),
        Index('idx_reports_user_generated', 'user_id', 'generated_at'),
        Index('idx_reports_type', 'report_type'),
        Index('idx_reports_generated_at', 'generated_at'),
    )
    
    # Relationships
    user = db.relationship('User', backref='reports')
    
    def to_dict(self):
        """Convert report to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.report_type,
            'dateRange': self.date_range,
            'summary': self.summary,
            'details': self.details,
            'generatedAt': self.generated_at.isoformat() if self.generated_at else None
        }
    
    def __repr__(self):
        return f'<Report {self.id} ({self.report_type}) by User {self.user_id}>'

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'

    id = db.Column(db.Integer, primary_key=True)
    actor_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    actor_role = db.Column(db.String(20))
    action = db.Column(db.String(100), nullable=False)
    resource_type = db.Column(db.String(50))
    resource_id = db.Column(db.String(50), nullable=True)
    ip = db.Column(db.String(45))
    user_agent = db.Column(db.String(255))
    metadata_info = db.Column(db.JSON)  # Using metadata_info instead of metadata to avoid conflict with SQLAlchemy
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index('idx_audit_logs_actor_time', 'actor_user_id', 'created_at'),
        Index('idx_audit_logs_action', 'action'),
        Index('idx_audit_logs_resource', 'resource_type'),
    )

    actor = db.relationship('User', backref='audit_logs')

    def __repr__(self):
        return f'<AuditLog {self.action} by {self.actor_user_id}>'

class SystemSetting(db.Model):
    __tablename__ = 'system_settings'

    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.JSON, nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    updater = db.relationship('User', backref='updated_settings')

    def __repr__(self):
        return f'<SystemSetting {self.key}>'
