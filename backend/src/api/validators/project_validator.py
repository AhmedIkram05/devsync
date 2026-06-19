# Project data validation

from flask import jsonify


def validate_project_data(data, update=False):
    """Validate project data from requests"""
    # For create operations, check required fields
    if not update and not all(k in data for k in ['name', 'description']):
        return jsonify({'message': 'Missing required fields'}), 400

    # Validate name if provided
    if 'name' in data and (len(data['name']) < 3 or len(data['name']) > 100):
        return jsonify({'message': 'Project name must be between 3 and 100 characters'}), 400

    # Validate status if provided
    if 'status' in data:
        valid_statuses = ['active', 'completed', 'on_hold', 'cancelled']
        if data['status'] not in valid_statuses:
            return jsonify({'message': f'Status must be one of: {", ".join(valid_statuses)}'}), 400

    # Validate team members if provided
    if 'team_members' in data and not isinstance(data['team_members'], list):
        return jsonify({'message': 'Team members must be a list of user IDs'}), 400

    # If validation passes, return None
    return None
