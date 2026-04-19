"""
Database inspection script for seeing details about schema, tables, and indices.
"""
import os
import sys
import logging
from sqlalchemy import inspect, text

# Add the backend directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../")))

from flask import Flask
from src.config.config import get_config
from src.db.models import db

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def inspect_database():
    """Inspect database schema in detail"""
    try:
        app = Flask(__name__)
        app.config.from_object(get_config())
        db.init_app(app)
        
        with app.app_context():
            inspector = inspect(db.engine)
            dialect = db.engine.dialect.name

            with db.engine.connect() as conn:
                tables = inspector.get_table_names()

                print(f"== Database Dialect: {dialect} ==")
                print(f"== Tables ({len(tables)}) ==")
                for table in sorted(tables):
                    print(f"  - {table}")
                print()

                print(f"== Indices by Table ==")
                for table in sorted(tables):
                    index_names = []

                    for index in inspector.get_indexes(table):
                        index_name = index.get("name")
                        if index_name:
                            index_names.append(index_name)

                    for constraint in inspector.get_unique_constraints(table):
                        constraint_name = constraint.get("name")
                        if constraint_name:
                            index_names.append(constraint_name)

                    # SQLite fallback where unique constraints can appear only in PRAGMA output.
                    if not index_names and dialect == "sqlite":
                        pragma_result = conn.execute(text(f"PRAGMA index_list('{table}')"))
                        for row in pragma_result:
                            if len(row) > 1 and row[1]:
                                index_names.append(row[1])

                    unique_index_names = sorted(set(index_names))
                    print(f"  Table: {table}")
                    if unique_index_names:
                        for index_name in unique_index_names:
                            print(f"    - {index_name}")
                    else:
                        print("    - (no indices found)")
                    print()
                
        return True
    except Exception as e:
        logger.error(f"Error inspecting database: {e}")
        return False

if __name__ == "__main__":
    inspect_database()
