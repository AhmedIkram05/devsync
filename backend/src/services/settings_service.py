"""System Settings Service"""
from ..db.models import db, SystemSetting

def get_settings():
    """Retrieve all system settings as a dictionary."""
    settings = SystemSetting.query.all()
    if not settings:
        # Fallback if DB is empty
        return {
            'default_user_role': 'developer',
            'notification_settings': {
                'email_notifications': True,
                'task_assignments': True,
                'project_updates': True
            }
        }
    return {setting.key: setting.value for setting in settings}

def update_settings(data, actor_id):
    """Update multiple system settings."""
    disallowed_keys = {'app_name', 'allow_registration', 'github_integration_enabled'}
    for key, value in data.items():
        if key in disallowed_keys:
            continue
        setting = SystemSetting.query.get(key)
        if setting:
            setting.value = value
            setting.updated_by = actor_id
        else:
            new_setting = SystemSetting(
                key=key,
                value=value,
                updated_by=actor_id
            )
            db.session.add(new_setting)
    
    db.session.commit()

def get_default_role():
    """Get the default role for new users."""
    setting = SystemSetting.query.get('default_user_role')
    if setting and setting.value:
        return setting.value
    return 'developer'
