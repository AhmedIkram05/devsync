import sys
import os
import pytest
from unittest.mock import patch, Mock
from flask import Flask, jsonify, request

# Set up proper import paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

# Import after path setup
from backend.src.api.middlewares.validation_middleware import (
    validate_json, validate_schema, validate_params
)

# Create a test Flask app
app = Flask(__name__)

# Helper schema used by middleware tests
class SchemaForValidation:
    def __init__(self):
        pass
        
    def validate(self, data):
        errors = {}
        
        # Simple validation for email
        if 'email' in data:
            if '@' not in data['email']:
                errors['email'] = ["Not a valid email address."]
                
        # Simple validation for name
        if 'name' not in data:
            errors['name'] = ["Missing data for required field."]
            
        return errors

def test_validate_json_success():
    """Test validation of JSON data (success case)"""
    with app.test_request_context(json={"test": "data"}):
        # Create test route with validation
        @validate_json()
        def test_route():
            return jsonify({"success": True})
        
        # Call the route and check result
        response = test_route()
        assert response.status_code == 200
        assert response.get_json() == {"success": True}

def test_validate_json_missing():
    """Test validation when JSON is missing"""
    with app.test_request_context():
        # Create test route with validation
        @validate_json()
        def test_route():
            return jsonify({"success": True})
        
        # Call the route and check result
        response = test_route()
        # Unpack if tuple
        if isinstance(response, tuple):
            resp, status = response
        else:
            resp, status = response, response.status_code
        assert status == 400
        assert "Missing JSON in request body" in resp.get_json()["message"]

def test_validate_json_invalid():
    """Test validation with invalid JSON"""
    import json
    with app.test_request_context(data="invalid{json", content_type="application/json"):
        # Create test route with validation
        @validate_json()
        def test_route():
            return jsonify({"success": True})
        
        # Patch request.get_json via full import path to raise JSONDecodeError
        with patch('backend.src.api.middlewares.validation_middleware.request.get_json', side_effect=json.JSONDecodeError("msg", "doc", 0)):
            # Call the route and check result
            response = test_route()
            if isinstance(response, tuple):
                resp, status = response
            else:
                resp, status = response, response.status_code
            assert status == 400
            assert "Invalid JSON format" in resp.get_json()["message"]

def test_validate_schema_success():
    """Test schema validation (success case)"""
    with app.test_request_context(json={"name": "Test User", "email": "test@example.com", "age": 30}):
        # Create test route with schema validation
        @validate_schema(SchemaForValidation)
        def test_route():
            return jsonify({"success": True})
        
        # Call the route and check result
        response = test_route()
        assert response.status_code == 200
        assert response.get_json() == {"success": True}

def test_validate_schema_missing_json():
    """Test schema validation with missing JSON"""
    with app.test_request_context():
        # Create test route with schema validation
        @validate_schema(SchemaForValidation)
        def test_route():
            return jsonify({"success": True})
        
        # Call the route and check result
        response = test_route()
        if isinstance(response, tuple):
            resp, status = response
        else:
            resp, status = response, response.status_code
        assert status == 400
        assert "Missing JSON in request body" in resp.get_json()["message"]

def test_validate_schema_validation_error():
    """Test schema validation with invalid data"""
    with app.test_request_context(json={"name": "Test User", "email": "invalid-email"}):
        # Create test route with schema validation
        @validate_schema(SchemaForValidation)
        def test_route():
            return jsonify({"success": True})
        
        # No need to mock schema validation as we're using our custom TestSchema
        response = test_route()
        if isinstance(response, tuple):
            resp, status = response
        else:
            resp, status = response, response.status_code
        assert status == 400
        assert resp.get_json()["message"] == "Validation error"
        assert "email" in resp.get_json()["errors"]

def test_validate_params_success():
    """Test URL parameter validation (success case)"""
    with app.test_request_context('/?id=1&name=test'):
        # Create test route with param validation
        @validate_params("id", "name")
        def test_route():
            return jsonify({"success": True})
        
        # Call the route and check result
        response = test_route()
        assert response.status_code == 200
        assert response.get_json() == {"success": True}

def test_validate_params_missing():
    """Test URL parameter validation with missing params"""
    with app.test_request_context('/?id=1'):
        # Create test route with param validation
        @validate_params("id", "name")
        def test_route():
            return jsonify({"success": True})
        
        # Call the route and check result
        response = test_route()
        if isinstance(response, tuple):
            resp, status = response
        else:
            resp, status = response, response.status_code
        assert status == 400
        assert "Missing required URL parameters" in resp.get_json()["message"]
        assert "name" in resp.get_json()["missing_params"]