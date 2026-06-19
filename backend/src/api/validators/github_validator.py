# GitHub integration validation

import re

from flask import jsonify


def validate_github_auth(data):
    """Validate GitHub authentication data"""
    if "code" not in data:
        return jsonify({"message": "GitHub authorization code is required"}), 400

    # GitHub authorization code should be a non-empty string
    if not data["code"] or not isinstance(data["code"], str):
        return jsonify({"message": "Invalid GitHub authorization code"}), 400

    return None


def validate_github_repo_data(data):
    """Validate GitHub repository data for integration"""
    # Check for required fields
    if not all(k in data for k in ["repository_name", "repository_url"]):
        return jsonify({"message": "Missing required GitHub repository fields"}), 400

    # Validate repository name format
    if not re.match(r"^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$", data["repository_name"]):
        return jsonify({"message": "Invalid repository name format. Should be owner/repo"}), 400

    # Validate repository URL
    if not data["repository_url"].startswith("https://github.com/"):
        return jsonify({"message": "Invalid GitHub repository URL"}), 400

    # Validate webhook secret if provided
    if "webhook_secret" in data and data["webhook_secret"] and len(data["webhook_secret"]) < 16:
        return jsonify({"message": "Webhook secret should be at least 16 characters for security"}), 400

    return None


def validate_github_webhook_payload(data):
    """Validate GitHub webhook payload"""
    # Check for key webhook fields
    if not all(k in data for k in ["action", "repository"]):
        return jsonify({"message": "Invalid webhook payload format"}), 400

    # Validate repository data
    if not isinstance(data["repository"], dict) or "id" not in data["repository"]:
        return jsonify({"message": "Invalid repository data in webhook payload"}), 400

    return None


def validate_task_github_link(data):
    """Validate task GitHub link data"""
    # Check for required fields
    if not all(k in data for k in ["task_id", "repo_id"]):
        return jsonify({"message": "Missing required fields"}), 400

    # Validate task_id
    if not isinstance(data["task_id"], int):
        return jsonify({"message": "Task ID must be an integer"}), 400

    # Validate repo_id
    if not isinstance(data["repo_id"], int):
        return jsonify({"message": "Repository ID must be an integer"}), 400

    # Validate issue_number if provided
    if "issue_number" in data and data["issue_number"] and not isinstance(data["issue_number"], int):
        return jsonify({"message": "Issue number must be an integer"}), 400

    # Validate pull_request_number if provided
    if (
        "pull_request_number" in data
        and data["pull_request_number"]
        and not isinstance(data["pull_request_number"], int)
    ):
        return jsonify({"message": "Pull request number must be an integer"}), 400

    return None
