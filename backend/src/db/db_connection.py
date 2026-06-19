"""
Database connection module that provides the SQLAlchemy database instance
"""

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import declarative_base  # Updated import path

# Create a single SQLAlchemy instance to be used across the application
db = SQLAlchemy()

# Create a base class for declarative class definitions
Base = declarative_base()
