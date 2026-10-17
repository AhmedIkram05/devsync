"""Entrypoint for the maintenance CronJob: python -m src.db.scripts.run_maintenance"""

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))


def main(argv=None):
    from src.app import create_app
    from src.services.maintenance_service import run_scheduled_maintenance

    parser = argparse.ArgumentParser(description="Run scheduled retention maintenance.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be removed without deleting or committing.",
    )
    args = parser.parse_args(argv)

    app, _ = create_app()
    with app.app_context():
        summary = run_scheduled_maintenance(dry_run=args.dry_run)
    print(f"maintenance summary (dry_run={args.dry_run}): {summary}")
    if summary.get("errors"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
