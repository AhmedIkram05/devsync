# Comment data validation

from flask import jsonify


def validate_comment_data(data):
    """Validate comment data from requests"""
    # Check for required fields
    if "content" not in data:
        return jsonify({"message": "Missing required content field"}), 400

    # Validate content
    if len(data["content"]) < 1:
        return jsonify({"message": "Comment content cannot be empty"}), 400

    if len(data["content"]) > 1000:
        return jsonify({"message": "Comment content must be less than 1000 characters"}), 400

    # If validation passes, return None
    return None
