# Report controller - business logic for report operations

from flask import request, jsonify
from flask_jwt_extended import get_jwt_identity, get_jwt
from ...db.models import db, Report, User
from ...auth.rbac import Role
from ..validators.report_validator import validate_report_data

def save_report():
    """Controller function to save a generated report"""
    user_id = get_jwt_identity()['user_id']
    data = request.get_json()
    
    # Validate report data
    validation_result = validate_report_data(data)
    if validation_result:
        return validation_result
    
    try:
        # Create new report record
        report = Report(
            user_id=user_id,
            report_type=data['report_type'],
            date_range=data['date_range'],
            summary=data['summary'],
            details=data['details']
        )
        
        db.session.add(report)
        db.session.commit()
        
        return jsonify({
            'message': 'Report saved successfully',
            'report': report.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to save report: {str(e)}'}), 500

def get_reports():
    """Controller function to get saved reports for the current user or team"""
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    # Parse query parameters for filtering
    report_type = request.args.get('type')
    date_range = request.args.get('dateRange')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    
    try:
        query = Report.query
        
        # Filter by user role
        if user_role in [Role.ADMIN.value, Role.TEAM_LEAD.value]:
            # Admins and team leads can see all reports
            pass
        else:
            # Developers can only see their own reports
            query = query.filter_by(user_id=user_id)
        
        # Apply optional filters
        if report_type:
            query = query.filter_by(report_type=report_type)
        if date_range:
            query = query.filter_by(date_range=date_range)
        
        # Sort by most recent first
        query = query.order_by(Report.generated_at.desc())
        
        # Paginate results
        paginated = query.paginate(page=page, per_page=per_page, error_out=False)
        
        reports = [report.to_dict() for report in paginated.items]
        
        return jsonify({
            'message': 'Reports retrieved successfully',
            'reports': reports,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': paginated.total,
                'pages': paginated.pages
            }
        }), 200
        
    except Exception as e:
        return jsonify({'message': f'Failed to retrieve reports: {str(e)}'}), 500

def get_report_by_id(report_id):
    """Controller function to get a specific report by ID"""
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    try:
        report = Report.query.get(report_id)
        if not report:
            return jsonify({'message': 'Report not found'}), 404
        
        # Check permissions
        if user_role not in [Role.ADMIN.value, Role.TEAM_LEAD.value]:
            if report.user_id != user_id:
                return jsonify({'message': 'Unauthorized access to this report'}), 403
        
        return jsonify({
            'message': 'Report retrieved successfully',
            'report': report.to_dict()
        }), 200
        
    except Exception as e:
        return jsonify({'message': f'Failed to retrieve report: {str(e)}'}), 500

def delete_report(report_id):
    """Controller function to delete a report"""
    user_id = get_jwt_identity()['user_id']
    claims = get_jwt()
    user_role = claims.get('role')
    
    try:
        report = Report.query.get(report_id)
        if not report:
            return jsonify({'message': 'Report not found'}), 404
        
        # Check permissions - can only delete own reports unless admin
        if user_role not in [Role.ADMIN.value]:
            if report.user_id != user_id:
                return jsonify({'message': 'Unauthorized to delete this report'}), 403
        
        db.session.delete(report)
        db.session.commit()
        
        return jsonify({
            'message': 'Report deleted successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Failed to delete report: {str(e)}'}), 500
