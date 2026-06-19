"""
Database connection utilities for the application.
"""

import os

import psycopg2
from psycopg2.extras import RealDictCursor


def get_db_connection():
    """
    Creates a connection to the PostgreSQL database using the DATABASE_URL
    environment variable and returns the connection object.

    Returns:
        psycopg2.extensions.connection: A connection to the PostgreSQL database

    Raises:
        Exception: If connection fails for any reason
    """
    # Get the DATABASE_URL from environment variables
    database_url = os.environ.get('DATABASE_URL')

    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")

    # Connect to the PostgreSQL database
    conn = psycopg2.connect(
        database_url,
        cursor_factory=RealDictCursor
    )

    return conn
