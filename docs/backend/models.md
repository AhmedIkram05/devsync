# DevSync Database Models

This document explains the database models used in DevSync to help team members understand our data structure.

## Core Models Overview

### User Model

- Represents users in the system with various roles (admin, team_lead, developer)
- Stores authentication information (email, hashed password)
- Connected to tasks, GitHub tokens, comments, and notifications

### Task Model

- Represents development work items
- Tracks status (common values: `backlog`, `todo`, `in_progress`, `review`, `done` — the legacy value `completed` is accepted and normalized to `done`) and progress percentage
- Stores `priority` (`low`/`medium`/`high`), optional `deadline`, `project_id`, and `progress` (0-100)
- Links to creators and assignees from the `User` model (foreign keys `created_by` and `assigned_to`)
- Can have comments, notifications, and GitHub links (`TaskGitHubLink`)

### GitHub Integration Models

- **GitHubToken**: Stores OAuth tokens for accessing the GitHub API
- **GitHubRepository**: Represents tracked repositories
- **TaskGitHubLink**: Maps tasks to GitHub issues/PRs in specific repositories. Each link stores a `task_id`, `repo_id`, and either an `issue_number` or `pull_request_number`.

### Activity Models

- **Comment**: Tracks discussions on tasks
- **Notification**: Manages user alerts for task changes and mentions. The model stores `notification_type`, `title`, `message`, `reference_id` (optional), `task_id` (optional), and read state. The DB column is `is_read` (boolean); the model exposes a `read` alias in `to_dict()` for backward compatibility with older frontend code.

### Additional activity & system models

- **Report**: Stores generated reports (`tasks`, `developers`, `github`) with `summary` and `details` JSON payloads and a `generated_at` timestamp. Reports are associated with the `User` who generated them.
- **AuditLog**: Records system/audit events, including an optional `actor_user_id`, `action`, `resource_type`, `metadata_info` and `created_at`.
- **SystemSetting**: Key/value table for system settings; values stored as JSON with `updated_by` and `updated_at` metadata.

## Key Relationships

- A user can create and be assigned to many tasks
- A user can have multiple GitHub tokens (for different scopes or accounts)
- Tasks can be linked to multiple GitHub issues or pull requests via `TaskGitHubLink`
- Comments connect users to tasks they're discussing
- Notifications link users to relevant tasks and events; the unread/read flag is stored as `is_read` in the DB
- Reports, AuditLogs, and SystemSettings provide administrative/systems functionality and are connected to `User` where relevant

## Database Schema

The models implement the schema defined in our SQL migration files, with proper indices for common queries and appropriate foreign key constraints.

For implementation, see `backend/models/models.py`.
