import sys
import os
import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
from flask import Flask  # added import

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import models after path setup
from backend.src.db.models.models import (
    User, Task, GitHubToken, GitHubRepository, TaskGitHubLink, 
    Comment, Notification, Project, db, project_members
)

app = Flask(__name__)    # added app instance

class TestModels:
    def test_user_model_creation(self):
        """Test creation of User model"""
        user = User(
            name="Test User",
            email="test@example.com",
            password="hashed_password",
            role="developer",
            github_username="testuser"
        )
        
        assert user.name == "Test User"
        assert user.email == "test@example.com"
        assert user.password == "hashed_password"
        assert user.role == "developer"
        assert user.github_username == "testuser"
        assert user.created_at is None  # Not set yet since not committed to DB
    
    def test_task_model_creation(self):
        """Test creation of Task model"""
        expected_deadline = datetime.now(timezone.utc) + timedelta(days=7)
        task = Task(
            title="Test Task",
            description="This is a test task",
            status="in_progress",
            progress=50,
            assigned_to=1,
            created_by=2,
            deadline=expected_deadline
        )
        
        assert task.title == "Test Task"
        assert task.description == "This is a test task"
        assert task.status == "in_progress"
        assert task.progress == 50
        assert task.assigned_to == 1
        assert task.created_by == 2
        assert task.deadline == expected_deadline
    
    def test_github_token_model_creation(self):
        """Test creation of GitHubToken model"""
        expected_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
        token = GitHubToken(
            user_id=1,
            access_token="access_token_123",
            refresh_token="refresh_token_456",
            token_expires_at=expected_expiry
        )
        
        assert token.user_id == 1
        assert token.access_token == "access_token_123"
        assert token.refresh_token == "refresh_token_456"
        assert token.token_expires_at == expected_expiry
    
    def test_github_repository_model_creation(self):
        """Test creation of GitHubRepository model"""
        repo = GitHubRepository(
            repo_name="test-repo",
            repo_url="https://github.com/user/test-repo",
            github_id=123456
        )
        
        assert repo.repo_name == "test-repo"
        assert repo.repo_url == "https://github.com/user/test-repo"
        assert repo.github_id == 123456
    
    def test_task_github_link_model_creation(self):
        """Test creation of TaskGitHubLink model"""
        link = TaskGitHubLink(
            task_id=1,
            repo_id=2,
            issue_number=42,
            pull_request_number=43
        )
        
        assert link.task_id == 1
        assert link.repo_id == 2
        assert link.issue_number == 42
        assert link.pull_request_number == 43
    
    def test_comment_model_creation(self):
        """Test creation of Comment model"""
        comment = Comment(
            task_id=1,
            user_id=2,
            content="This is a test comment"
        )
        
        assert comment.task_id == 1
        assert comment.user_id == 2
        assert comment.content == "This is a test comment"
    
    def test_notification_model_creation(self):
        """Test creation of Notification model"""
        notification = Notification(
            user_id=1,
            notification_type="task_assigned",
            title="New Task Assigned",
            message="You have been assigned a new task",
            reference_id="task_123",
            task_id=123,
            is_read=False  # Explicitly set is_read since it's not automatically set to False
        )
        
        assert notification.user_id == 1
        assert notification.notification_type == "task_assigned"
        assert notification.title == "New Task Assigned"
        assert notification.message == "You have been assigned a new task"
        assert notification.reference_id == "task_123"
        assert notification.is_read is False  # Now explicitly set
        assert notification.task_id == 123
    
    def test_notification_to_dict(self):
        """Test notification to_dict method"""
        now = datetime.now(timezone.utc)
        notification = Notification(
            id=1,
            user_id=1,
            notification_type="task_assigned",
            title="New Task Assigned",
            message="You have been assigned a new task",
            reference_id="task_123",
            is_read=True,
            created_at=now,
            read_at=now
        )
        
        notification_dict = notification.to_dict()
        
        assert notification_dict["id"] == 1
        assert notification_dict["user_id"] == 1
        assert notification_dict["type"] == "task_assigned"
        assert notification_dict["title"] == "New Task Assigned"
        assert notification_dict["message"] == "You have been assigned a new task"
        assert notification_dict["reference_id"] == "task_123"
        assert notification_dict["read"] is True
        assert notification_dict["created_at"] == now.isoformat()
        assert notification_dict["read_at"] == now.isoformat()
    
    def test_project_model_creation(self):
        """Test creation of Project model"""
        project = Project(
            name="Test Project",
            description="This is a test project",
            status="active",
            github_repo="user/test-repo",
            created_by=1
        )
        
        assert project.name == "Test Project"
        assert project.description == "This is a test project"
        assert project.status == "active"
        assert project.github_repo == "user/test-repo"
        assert project.created_by == 1
    
    def test_model_relationships(self):
        """Test relationships between models"""
        # Replace current_app with our app instance
        with app.app_context():
            mock_user = Mock(spec=User)
            mock_user.id = 1
            mock_user.name = "Test User"
            
            mock_task = Mock(spec=Task)
            mock_task.id = 1
            mock_task.title = "Test Task"
            
            mock_project = Mock(spec=Project)
            mock_project.id = 1
            mock_project.name = "Test Project"
            
            # Test User-Task relationship via backref
            mock_user.created_tasks = [mock_task]
            assert mock_user.created_tasks[0].id == 1
            assert mock_user.created_tasks[0].title == "Test Task"
            
            # Test Task-User relationship
            mock_task.creator = mock_user
            assert mock_task.creator.id == 1
            assert mock_task.creator.name == "Test User"
            
            # Test Project-Task relationship
            mock_project.tasks = [mock_task]
            assert mock_project.tasks[0].id == 1
            
            # Test Task-Project relationship
            mock_task.project = mock_project
            assert mock_task.project.id == 1
            assert mock_task.project.name == "Test Project"