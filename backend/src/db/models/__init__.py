"""
Database models package initialization.
Import and expose all models for easy access.
"""

# Import the db instance instead of creating a new one
from ..db_connection import db

# Import models to make them available when importing the package
from .models import User, Task, Project, Comment, GitHubToken, GitHubRepository, TaskGitHubLink, Notification, Report

# Export all models for easy importing
__all__ = [
    'db',
    'User',
    'Task',
    'Project',
    'Comment',
    'Notification',
    'GitHubToken',
    'GitHubRepository',
    'TaskGitHubLink',
    'Report'
]
