# Admin operations validation

from flask import jsonify

from ...auth.rbac import Role


def validate_system_settings(data):
    """Validate system settings data"""
    # Check for required fields
    if not data:
        return jsonify({"message": "No settings provided"}), 400

    # Backward-compatible legacy settings fields. The new UI no longer uses these,
    # but existing tests and older clients still send them.
    if "app_name" in data and (not isinstance(data["app_name"], str) or len(data["app_name"]) < 3):
        return jsonify({"message": "App name must be between 3 and 100 characters"}), 400

    for bool_field in ["allow_registration", "github_integration_enabled"]:
        if bool_field in data and not isinstance(data[bool_field], bool):
            return jsonify({"message": f"{bool_field} must be a boolean value"}), 400

    if "notification_settings" in data:
        if not isinstance(data["notification_settings"], dict):
            return jsonify({"message": "notification_settings must be an object"}), 400
        for key, value in data["notification_settings"].items():
            if not isinstance(value, bool):
                return jsonify({"message": f'Notification setting "{key}" must be a boolean value'}), 400

    # Validate default_user_role if provided
    if "default_user_role" in data:
        valid_roles = [role.value for role in Role]
        if data["default_user_role"] not in valid_roles:
            return jsonify({"message": f"Default user role must be one of: {', '.join(valid_roles)}"}), 400

    for bool_field in ["allow_self_registration", "auto_archive_completed_projects", "notify_on_overdue_tasks"]:
        if bool_field in data and not isinstance(data[bool_field], bool):
            return jsonify({"message": f"{bool_field} must be a boolean value"}), 400

    for int_field in ["audit_log_retention_days", "project_retention_days"]:
        if int_field in data:
            if not isinstance(data[int_field], int):
                return jsonify({"message": f"{int_field} must be an integer value"}), 400
            if data[int_field] < 0:
                return jsonify({"message": f"{int_field} must be a non-negative integer"}), 400

    # If validation passes, return None
    return None


def validate_user_role_update(data):
    """Validate user role update data"""
    # Check for required fields
    if "role" not in data:
        return jsonify({"message": "Role is required"}), 400

    # Validate role
    valid_roles = [role.value for role in Role]
    if data["role"] not in valid_roles:
        return jsonify({"message": f"Role must be one of: {', '.join(valid_roles)}"}), 400

    # If validation passes, return None
    return None
