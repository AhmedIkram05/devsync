# DevSync Database Models

This document explains the database models used in DevSync to help team members understand our data structure.

## Core Models Overview

### User Model

- Represents users in the system with various roles (admin, team_lead, developer)
- Stores authentication information (email, hashed password)
- Connected to tasks, GitHub tokens, comments, and notifications

### Task Model

- Represents development work items
- Tracks status ("new", "in_progress", "resolved", "closed") and progress percentage
- Links to creators and assignees from the User model
- Can have comments, notifications, and GitHub links

### GitHub Integration Models

- **GitHubToken**: Stores OAuth tokens for accessing the GitHub API
- **GitHubRepository**: Represents tracked repositories
- **TaskGitHubLink**: Maps tasks to GitHub issues/PRs in specific repositories

### Activity Models

- **Comment**: Tracks discussions on tasks
- **Notification**: Manages user alerts for task changes and mentions

## Key Relationships

- A user can create and be assigned to many tasks
- A user can have multiple GitHub tokens (for different scopes or accounts)
- Tasks can be linked to multiple GitHub issues or pull requests
- Comments connect users to tasks they're discussing
- Notifications link users to relevant tasks and events

## Database Schema

The models implement the schema defined in our SQL migration files, with proper indices for common queries and appropriate foreign key constraints.

For implementation, see `backend/models/models.py`.
