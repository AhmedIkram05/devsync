# Notification data validation

from flask import jsonify

def validate_notification_data(data):
    """Validate notification data from requests"""
    # Check for required fields
    if not data or 'user_id' not in data or not (data.get('content') or data.get('message')):
        return jsonify({'message': 'Missing required fields'}), 400
    
    # Validate message/content
    message = data.get('message') or data.get('content')
    if not isinstance(message, str) or len(message) < 1 or len(message) > 500:
        return jsonify({'message': 'Notification message must be between 1 and 500 characters'}), 400

    if 'title' in data and (not isinstance(data['title'], str) or len(data['title']) > 255):
        return jsonify({'message': 'Notification title must be a string up to 255 characters'}), 400

    notification_type = data.get('notification_type') or data.get('type')
    if notification_type is not None and (not isinstance(notification_type, str) or len(notification_type) > 50):
        return jsonify({'message': 'Notification type must be a string up to 50 characters'}), 400
    
    # Validate user_id
    if not isinstance(data['user_id'], int):
        return jsonify({'message': 'User ID must be an integer'}), 400
    
    # Validate task_id if provided
    if 'task_id' in data and data['task_id'] and not isinstance(data['task_id'], int):
        return jsonify({'message': 'Task ID must be an integer'}), 400
    
    # Validate is_read if provided
    if 'is_read' in data and not isinstance(data['is_read'], bool):
        return jsonify({'message': 'is_read must be a boolean value'}), 400
    
    # If validation passes, return None
    return None
