"""Entrypoint for the maintenance CronJob: python -m src.db.scripts.run_maintenance"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))


def main():
    from src.app import create_app
    from src.services.maintenance_service import run_scheduled_maintenance

    app, _ = create_app()
    with app.app_context():
        summary = run_scheduled_maintenance()
    print(f"maintenance summary: {summary}")
    if summary.get("errors"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
