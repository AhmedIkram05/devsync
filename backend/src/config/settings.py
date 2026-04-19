"""Legacy compatibility module.

Use `src.config.config` as the single source of truth for app settings.
This module is kept only to avoid import breakages from older code paths.
"""

from .config import Config, DevelopmentConfig, ProductionConfig, TestingConfig, get_config

# Backward-compatible alias used by older imports.
TestConfig = TestingConfig

__all__ = [
    "Config",
    "DevelopmentConfig",
    "ProductionConfig",
    "TestingConfig",
    "TestConfig",
    "get_config",
]
