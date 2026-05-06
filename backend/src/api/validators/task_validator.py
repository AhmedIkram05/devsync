# Task data validation

from flask import jsonify

def validate_task_data(data):
    """Validate task data from requests"""
    # Guard: ensure data is present
    if not data:
        return jsonify({'message': 'Invalid or missing JSON body'}), 400
    # Check for required fields
    if not all(k in data for k in ['title', 'description', 'status']):
        return jsonify({'message': 'Missing required fields'}), 400
    
    # Validate title length
    if len(data['title']) < 3 or len(data['title']) > 100:
        return jsonify({'message': 'Title must be between 3 and 100 characters'}), 400
    
    # Validate status enum
    valid_statuses = ['backlog', 'todo', 'in_progress', 'review', 'done']
    if data['status'] not in valid_statuses:
        return jsonify({'message': f'Status must be one of: {", ".join(valid_statuses)}'}), 400
    
    # Validate progress percentage
    if 'progress' in data and (data['progress'] < 0 or data['progress'] > 100):
        return jsonify({'message': 'Progress must be between 0 and 100'}), 400
    
    # Validate priority if provided
    if 'priority' in data:
        valid_priorities = ['low', 'medium', 'high', 'urgent']
        if data['priority'] not in valid_priorities:
            return jsonify({'message': f'Priority must be one of: {", ".join(valid_priorities)}'}), 400
    
    # Validate assignee/assigned_to if provided (support both names)
    assignee = data.get('assignee_id') if 'assignee_id' in data else data.get('assigned_to')
    if assignee not in (None, '') and not (
        isinstance(assignee, int) or (isinstance(assignee, str) and assignee.isdigit())
    ):
        return jsonify({'message': 'Assignee ID must be an integer'}), 400
    
    # If validation passes, return None
    return None
