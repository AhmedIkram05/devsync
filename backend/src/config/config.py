# This file is the configuration file for the Flask application.

import os
from dotenv import load_dotenv

load_dotenv(override=True)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
DEFAULT_SQLITE_DB = os.path.join(BASE_DIR, 'devsync.db')

class Config:
    """Base configuration class for the application"""
    # Database configuration
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', f'sqlite:///{DEFAULT_SQLITE_DB}')

    if SQLALCHEMY_DATABASE_URI.startswith('postgres://'):
        SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace('postgres://', 'postgresql://', 1)

    # Cloud Postgres providers generally require SSL.
    if SQLALCHEMY_DATABASE_URI.startswith('postgresql://') and 'sslmode=' not in SQLALCHEMY_DATABASE_URI:
        sep = '&' if '?' in SQLALCHEMY_DATABASE_URI else '?'
        SQLALCHEMY_DATABASE_URI += f"{sep}sslmode=require"

    # Normalize sqlite paths so one DB file is used regardless of the working directory.
    if SQLALCHEMY_DATABASE_URI.startswith('sqlite:///') and not SQLALCHEMY_DATABASE_URI.startswith('sqlite:////'):
        sqlite_path = SQLALCHEMY_DATABASE_URI.replace('sqlite:///', '', 1)
        sqlite_query = ''

        if '?' in sqlite_path:
            sqlite_path, sqlite_query = sqlite_path.split('?', 1)
            sqlite_query = f'?{sqlite_query}'

        if not os.path.isabs(sqlite_path):
            sqlite_path = os.path.join(BASE_DIR, sqlite_path)

        SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.abspath(sqlite_path)}{sqlite_query}"
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'dev-secret-key')
    
    # JWT Configuration
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'dev-secret-key')
    JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', 30))
    
    # GitHub OAuth Configuration
    GITHUB_CLIENT_ID = os.getenv('GITHUB_CLIENT_ID', '')
    GITHUB_CLIENT_SECRET = os.getenv('GITHUB_CLIENT_SECRET', '')
    GITHUB_REDIRECT_URI = os.getenv('GITHUB_REDIRECT_URI', '')

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    JWT_COOKIE_SECURE = False

def get_config():
    """Returns the appropriate configuration class based on the environment"""
    env = os.environ.get('FLASK_ENV', 'development')
    
    if env == 'production':
        return ProductionConfig
    elif env == 'testing':
        return TestingConfig
    else:
        return DevelopmentConfig
