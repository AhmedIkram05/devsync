#!/usr/bin/env python3
"""Seed a deterministic medium dataset for the report benchmark.

50 users / 10 projects / 5,000 tasks, all under fixed @devsync.test identities
so reruns are idempotent. Intended for a local or disposable Postgres, never
production.

Usage:
    DATABASE_URL=postgresql://devsync:devsync@localhost:5433/devsync \
    python scripts/perf-seed.py

The known admin account is perf-admin@devsync.test / perf-benchmark-password.
"""

import os
import sys
from datetime import UTC, datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from src.app import create_app  # noqa: E402
from src.auth.helpers import hash_password  # noqa: E402
from src.db.models import Project, Task, User, db  # noqa: E402

USER_COUNT = 50
PROJECT_COUNT = 10
TASK_COUNT = 5000
ADMIN_EMAIL = "perf-admin@devsync.test"
BENCHMARK_PASSWORD = "perf-benchmark-password"
STATUSES = ("todo", "in_progress", "review", "done")


def main():
    app, _socketio = create_app()
    with app.app_context():
        if User.query.filter_by(email=ADMIN_EMAIL).first():
            print("perf seed already present; nothing to do")
            return 0

        now = datetime.now(UTC)
        password = hash_password(BENCHMARK_PASSWORD)

        users = [User(name="Perf Admin", email=ADMIN_EMAIL, password=password, role="admin")]
        for index in range(1, USER_COUNT):
            role = "team_lead" if index <= 5 else "developer"
            users.append(
                User(
                    name=f"Perf User {index:02d}",
                    email=f"perf-user-{index:02d}@devsync.test",
                    password=password,
                    role=role,
                )
            )
        db.session.add_all(users)
        db.session.flush()

        admin = users[0]
        projects = [
            Project(
                name=f"Perf Project {index:02d}",
                description="Synthetic dataset for report benchmarking",
                created_by=admin.id,
                status="active",
            )
            for index in range(PROJECT_COUNT)
        ]
        db.session.add_all(projects)
        db.session.flush()

        for project in projects:
            for user in users[1:]:
                if user.id % PROJECT_COUNT == project.id % PROJECT_COUNT:
                    project.team_members.append(user)

        rows = []
        for index in range(TASK_COUNT):
            project = projects[index % PROJECT_COUNT]
            assignee = users[1 + (index % (USER_COUNT - 1))]
            status = STATUSES[index % len(STATUSES)]
            created_at = now - timedelta(days=index % 365, minutes=index % 1440)
            rows.append(
                {
                    "title": f"Perf task {index:05d}",
                    "description": "Synthetic task for report benchmarking",
                    "status": status,
                    "priority": ("low", "medium", "high")[index % 3],
                    "progress": 100 if status == "done" else index % 100,
                    "project_id": project.id,
                    "assigned_to": assignee.id,
                    "created_by": admin.id,
                    "created_at": created_at,
                    "updated_at": created_at,
                    "deadline": created_at + timedelta(days=7),
                }
            )

        db.session.bulk_insert_mappings(Task, rows)
        db.session.commit()

    print(f"seeded {USER_COUNT} users, {PROJECT_COUNT} projects, {TASK_COUNT} tasks (admin: {ADMIN_EMAIL})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
