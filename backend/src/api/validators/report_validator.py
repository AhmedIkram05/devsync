# Report data validation

from flask import jsonify

VALID_REPORT_TYPES = ['tasks', 'developers', 'github']
VALID_DATE_RANGES = ['week', 'month', 'quarter', 'year']

def validate_report_data(data):
    """Validate report save request data"""
    # Check for required fields
    required_fields = ['report_type', 'date_range', 'summary', 'details']
    for field in required_fields:
        if field not in data:
            return jsonify({'message': f'Missing required {field} field'}), 400
    
    # Validate report_type
    if data['report_type'] not in VALID_REPORT_TYPES:
        return jsonify({'message': f'Invalid report_type. Must be one of: {", ".join(VALID_REPORT_TYPES)}'}), 400
    
    # Validate date_range
    if data['date_range'] not in VALID_DATE_RANGES:
        return jsonify({'message': f'Invalid date_range. Must be one of: {", ".join(VALID_DATE_RANGES)}'}), 400
    
    # Validate summary is a dictionary
    if not isinstance(data['summary'], dict):
        return jsonify({'message': 'Summary must be a JSON object'}), 400
    
    # Validate details is a list
    if not isinstance(data['details'], list):
        return jsonify({'message': 'Details must be a JSON array'}), 400
    
    # If validation passes, return None
    return None
