"""GitHub integration API routes"""

from urllib.parse import urlencode

from flask import current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ..controllers.github_controller import (
    add_github_repository,
    check_github_config,
    disconnect_github_account,
    get_github_repositories,
    get_repository_issues,
    get_repository_pulls,
    get_task_github_links,
    github_callback,
    initiate_github_auth,
    link_task_with_github,
    oauth_states,
    delete_task_github_link,
)
from ..middlewares.validation_middleware import validate_json
from ..middlewares import role_required
from ...auth.rbac import Role, require_permission
from ...db.models import db, User, GitHubToken
from ...services.github_client import GitHubClient

def register_routes(bp):
    """Register all GitHub integration routes with the provided Blueprint"""

    def _extract_user_id():
        identity = get_jwt_identity()
        return identity['user_id'] if isinstance(identity, dict) else identity
    
    @bp.route('/github/config-check', methods=['GET'])
    def github_config_check():
        """Route to check GitHub OAuth configuration"""
        return check_github_config()
    
    @bp.route('/github/auth', methods=['GET'])
    @jwt_required()
    def github_auth():
        """Route to initiate GitHub OAuth process"""
        return initiate_github_auth()
    
    @bp.route('/github/callback', methods=['GET', 'POST'])
    def github_oauth_callback():
        """Route to handle GitHub OAuth callback"""
        if request.method == 'GET':
            return github_callback()

        data = request.get_json() or {}
        code = data.get('code')
        state = data.get('state')
        
        if not code or not state:
            return jsonify({'error': 'Missing required parameters'}), 400
            
        try:
            user_id = GitHubClient.parse_state_param(state)
            if not user_id and state in oauth_states:
                user_id = oauth_states[state]['user_id']
                del oauth_states[state]

            try:
                user_id = int(user_id)
            except (TypeError, ValueError):
                user_id = None
            
            if not user_id:
                return jsonify({'error': 'Invalid state parameter - missing user ID'}), 400
            
            # Exchange the code for an access token
            token_data = GitHubClient.exchange_code_for_token(code)
            
            if not token_data or 'access_token' not in token_data:
                return jsonify({'error': 'Failed to obtain access token'}), 400
            
            # Create GitHub client with new token
            github_client = GitHubClient(token_data['access_token'])
            
            # Fetch user profile to get GitHub username
            github_profile = github_client.get_user_profile()
            
            if not github_profile:
                return jsonify({'error': 'Failed to fetch GitHub profile'}), 400
            
            # Find the user
            user = User.query.get(user_id)
            if not user:
                return jsonify({'error': 'User not found'}), 404
            
            # Check if user already has a GitHub token
            existing_token = GitHubToken.query.filter_by(user_id=user_id).first()
            
            if existing_token:
                existing_token.access_token = token_data['access_token']
                existing_token.refresh_token = token_data.get('refresh_token')
                existing_token.token_expires_at = token_data.get('token_expires_at')
            else:
                # Create a new token record
                github_token = GitHubToken(
                    user_id=user_id,
                    access_token=token_data['access_token'],
                    refresh_token=token_data.get('refresh_token'),
                    token_expires_at=token_data.get('token_expires_at'),
                )
                db.session.add(github_token)
            
            # Update user's GitHub username if available
            if github_profile and 'login' in github_profile:
                user.github_username = github_profile['login']
            
            db.session.commit()
            return jsonify({
                'success': True,
                'github_username': github_profile.get('login'),
                'message': 'GitHub account connected successfully'
            })
        
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error processing GitHub callback: {str(e)}")

            return jsonify({
                'success': False,
                'message': f'Error processing GitHub callback: {str(e)}'
            }), 500
    
    @bp.route('/github/repositories', methods=['GET'])
    @jwt_required()
    def repositories_list():
        """Route to get GitHub repositories for the user"""
        return get_github_repositories()
    
    @bp.route('/github/repositories', methods=['POST'])
    @jwt_required()
    @role_required([Role.ADMIN])
    @require_permission('can_link_github_repos')
    @validate_json()
    def add_repository():
        """Route to add a GitHub repository for tracking"""
        return add_github_repository()
    
    @bp.route('/github/repositories/<int:repo_id>/issues', methods=['GET'])
    @jwt_required()
    def repository_issues(repo_id):
        """Route to get issues for a repository"""
        return get_repository_issues(repo_id)
    
    @bp.route('/github/repositories/<int:repo_id>/pulls', methods=['GET'])
    @jwt_required()
    def repository_pulls(repo_id):
        """Route to get pull requests for a repository"""
        return get_repository_pulls(repo_id)
    
    @bp.route('/tasks/<int:task_id>/github', methods=['POST'])
    @jwt_required()
    @validate_json()
    def link_github(task_id):
        """Route to link a task with GitHub issue or PR"""
        return link_task_with_github(task_id)
    
    @bp.route('/tasks/<int:task_id>/github', methods=['GET'])
    @jwt_required()
    def get_github_links(task_id):
        """Route to get GitHub links for a task"""
        return get_task_github_links(task_id)
    
    @bp.route('/tasks/<int:task_id>/github/<int:link_id>', methods=['DELETE'])
    @jwt_required()
    def delete_github_link(task_id, link_id):
        """Route to delete a GitHub link from a task"""
        return delete_task_github_link(task_id, link_id)
    
    @bp.route('/github/exchange', methods=['GET'])
    def exchange_github_code():
        """Route to exchange GitHub OAuth code for token without authentication"""
        code = request.args.get('code')
        state = request.args.get('state')
        
        if not code:
            return jsonify({'success': False, 'message': 'No code provided'}), 400
            
        try:
            # Parse state to get user_id
            user_id = GitHubClient.parse_state_param(state)
            if not user_id and state in oauth_states:
                user_id = oauth_states[state]['user_id']
                del oauth_states[state]

            try:
                user_id = int(user_id)
            except (TypeError, ValueError):
                user_id = None
            
            if not user_id:
                return jsonify({'success': False, 'message': 'Invalid state parameter'}), 400
                
            # Exchange the code for an access token
            token_data = GitHubClient.exchange_code_for_token(code)
            
            if not token_data or 'access_token' not in token_data:
                return jsonify({'success': False, 'message': 'Failed to obtain access token'}), 400
                
            # Create GitHub client with new token
            github_client = GitHubClient(token_data['access_token'])
            
            # Fetch user profile to get GitHub username
            github_profile = github_client.get_user_profile()
            
            if not github_profile:
                return jsonify({'success': False, 'message': 'Failed to fetch GitHub profile'}), 400
                
            # Find the user
            user = User.query.get(user_id)
            if not user:
                return jsonify({'success': False, 'message': 'User not found'}), 404
                
            # Check if user already has a GitHub token
            existing_token = GitHubToken.query.filter_by(user_id=user_id).first()
            
            if existing_token:
                existing_token.access_token = token_data['access_token']
                existing_token.refresh_token = token_data.get('refresh_token')
                existing_token.token_expires_at = token_data.get('token_expires_at')
            else:
                # Create a new token record
                github_token = GitHubToken(
                    user_id=user_id,
                    access_token=token_data['access_token'],
                    refresh_token=token_data.get('refresh_token'),
                    token_expires_at=token_data.get('token_expires_at'),
                )
                db.session.add(github_token)
                
            # Update user's GitHub username if available
            if github_profile and 'login' in github_profile:
                user.github_username = github_profile['login']
                
            db.session.commit()
            
            return jsonify({
                'success': True, 
                'github_username': github_profile.get('login'),
                'message': 'GitHub account connected successfully'
            })
                
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error processing GitHub exchange: {str(e)}")
            return jsonify({'success': False, 'message': str(e)}), 500

    @bp.route('/github/connect', methods=['GET', 'POST'])
    def github_connect():
        """Public route to initiate GitHub OAuth flow without requiring authentication"""
        # Handle both GET and POST requests
        if request.method == 'GET':
            user_id = request.args.get('userId')
            state = request.args.get('state')
        else:  # POST
            data = request.get_json() or {}
            user_id = data.get('userId')
            state = data.get('state')
        
        if not user_id:
            return jsonify({'error': 'User ID is required'}), 400

        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'User ID is invalid'}), 400

        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        if not state:
            state = GitHubClient.create_state_param(user_id)
        
        # Directly redirect to GitHub OAuth
        client_id = current_app.config.get('GITHUB_CLIENT_ID')
        
        # CRITICAL: Use EXACTLY the same redirect URI as in GitHub OAuth App settings
        redirect_uri = current_app.config.get('GITHUB_REDIRECT_URI', 'http://localhost:8000/api/v1/github/callback')
        
        if not client_id:
            return jsonify({'error': 'GitHub OAuth configuration is incomplete'}), 500
        
        oauth_query = urlencode(
            {
                'client_id': client_id,
                'redirect_uri': redirect_uri,
                'scope': 'repo,user:email',
                'state': state,
            }
        )
        oauth_url = f"https://github.com/login/oauth/authorize?{oauth_query}"
        
        # Return the URL instead of redirecting
        return {'authorization_url': oauth_url, 'state': state}, 200

    @bp.route('/github/status', methods=['GET'])
    @jwt_required()
    def github_status():
        """Return the GitHub connection status for the authenticated user"""
        user_id = _extract_user_id()
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid user identity'}), 401

        user = User.query.get(user_id)
        if user:
            token = GitHubToken.query.filter_by(user_id=user_id).first()
            connected = token is not None
            return jsonify({
                'connected': connected,
                'username': user.github_username if connected else ''
            })
        return jsonify({'error': 'User not found'}), 404

    @bp.route('/github/disconnect', methods=['POST'])
    @jwt_required()
    def disconnect_github():
        """Disconnect the authenticated user's GitHub account"""
        return disconnect_github_account()
