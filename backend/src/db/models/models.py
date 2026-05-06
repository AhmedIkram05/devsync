# This file contains the models for the database tables.

from datetime import datetime
from sqlalchemy import Index
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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Fix __table_args__ by creating a tuple containing all indices
    __table_args__ = (
        Index('idx_users_email', 'email'),
        Index('idx_users_role', 'role'),
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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<TaskGitHubLink task:{self.task_id} repo:{self.repo_id}>'

class Comment(db.Model):
    __tablename__ = 'comments'
    
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
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
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.notification_type,
            'title': self.title,
            'message': self.message,
            'reference_id': self.reference_id,
            'read': self.is_read,  # Changed to use is_read but keep API compatibility
            'created_at': self.created_at.isoformat() if self.created_at else None,
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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_projects_created_by', 'created_by'),
        Index('idx_projects_status', 'status'),
        Index('idx_projects_updated_at', 'updated_at'),
    )
    
    # Relationships
    tasks = db.relationship('Task', backref='project', lazy=True)
    
    def __repr__(self):
        return f'<Project {self.name}>'
