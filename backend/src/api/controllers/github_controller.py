"""Controller for GitHub integration with DevSync."""

import logging
import uuid
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

from flask import current_app, jsonify, redirect, request
from flask_jwt_extended import get_jwt_identity

from ...db.models import (
    GitHubRepository,
    GitHubToken,
    Task,
    TaskGitHubLink,
    User,
    db,
)
from ...services.github_client import GitHubClient
from ..validators.github_validator import validate_github_repo_data, validate_task_github_link

logger = logging.getLogger(__name__)

# In-memory store for OAuth state parameters (in a production app, use Redis or similar)
oauth_states = {}

def check_github_config():
    """Check GitHub OAuth configuration"""
    config_status = {
        'client_id_set': bool(current_app.config.get('GITHUB_CLIENT_ID')),
        'client_secret_set': bool(current_app.config.get('GITHUB_CLIENT_SECRET')),
        'redirect_uri_set': bool(current_app.config.get('GITHUB_REDIRECT_URI')),
    }
    
    return jsonify({
        'config_status': config_status,
        'client_id': current_app.config.get('GITHUB_CLIENT_ID', '')[:4] + '****' if current_app.config.get('GITHUB_CLIENT_ID') else None,
        'redirect_uri': current_app.config.get('GITHUB_REDIRECT_URI'),
        'frontend_url': current_app.config.get('FRONTEND_URL', 'http://localhost:3000')
    })

def initiate_github_auth():
    """Initiate GitHub OAuth flow"""
    # Generate a random state parameter to prevent CSRF
    state = str(uuid.uuid4())
    user_id = get_jwt_identity()['user_id']
    
    # Store state with user_id (with 10 minute expiry in a real app)
    oauth_states[state] = {
        'user_id': user_id,
        'created_at': datetime.now()
    }
    
    # Check if GitHub OAuth credentials are configured
    if not current_app.config.get('GITHUB_CLIENT_ID') or not current_app.config.get('GITHUB_CLIENT_SECRET'):
        return jsonify({
            'error': 'GitHub OAuth credentials not configured',
            'message': 'GitHub integration is not available at this time.'
        }), 503
    
    # Get authorization URL
    auth_url = GitHubClient.get_auth_url(state)
    
    return jsonify({
        'authorization_url': auth_url
    })

def github_callback():
    """Handle GitHub OAuth callback"""
    # Get code and state from query parameters
    code = request.args.get('code')
    state = request.args.get('state')
    
    # Validate the request
    if not code or not state:
        return jsonify({'message': 'Missing code or state parameter'}), 400
    
    try:
        # First try to find the state in our oauth_states dictionary
        if state in oauth_states:
            # This is our internally generated state
            user_id = oauth_states[state]['user_id']
            # Clean up used state
            del oauth_states[state]
        else:
            # This might be a URL-safe base64-encoded state from frontend
            import base64
            import json
            
            # Add padding back if needed for base64 decoding
            padding = len(state) % 4
            if padding:
                state += '=' * (4 - padding)
                
            # Replace URL-safe characters back to standard base64
            state = state.replace('-', '+').replace('_', '/')
            
            # Decode the base64 string
            try:
                decoded_bytes = base64.b64decode(state)
                decoded_state = json.loads(decoded_bytes.decode('utf-8'))
                
                # Extract the user_id from the decoded state
                user_id = decoded_state.get('userId')
                
                if not user_id:
                    logger.error("No userId found in decoded state")
                    return jsonify({'error': 'Invalid state parameter format - missing userId'}), 400
                    
                logger.info(f"Successfully decoded state with userId: {user_id}")
            except Exception as e:
                logger.error(f"Error decoding state: {str(e)}")
                return jsonify({'error': 'Invalid state parameter format - decoding error'}), 400
    except Exception as e:
        logger.error(f"Error processing state parameter: {str(e)}")
        return jsonify({'error': 'Invalid state parameter format - processing error'}), 400

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid state parameter format - userId must be an integer'}), 400
    
    # Exchange code for access token
    token_data = GitHubClient.exchange_code_for_token(code)
    
    if not token_data or 'access_token' not in token_data:
        return jsonify({'message': 'Failed to obtain access token'}), 400
    
    # Create GitHub client with new token
    github_client = GitHubClient(token_data['access_token'])
    
    # Fetch user profile to get GitHub username
    github_profile = github_client.get_user_profile()
    if not github_profile:
        return jsonify({'message': 'Failed to fetch GitHub profile'}), 400
    
    # Check if user already has a GitHub token
    existing_token = GitHubToken.query.filter_by(user_id=user_id).first()
    
    if existing_token:
        # Update existing token
        existing_token.access_token = token_data['access_token']
        existing_token.refresh_token = token_data.get('refresh_token')
        existing_token.token_expires_at = token_data.get('token_expires_at')
    else:
        # Create new token record
        github_token = GitHubToken(
            user_id=user_id,
            access_token=token_data['access_token'],
            refresh_token=token_data.get('refresh_token'),
            token_expires_at=token_data.get('token_expires_at')
        )
        db.session.add(github_token)
    
    # Update user's GitHub username if available
    user = User.query.get(user_id)
    if user and github_profile and 'login' in github_profile:
        user.github_username = github_profile['login']
        user.github_connected = True
        
        logger.info(f"Updated user {user_id} with GitHub username: {user.github_username}")
    
    db.session.commit()
    
    # Redirect to frontend with success message
    frontend_url = current_app.config.get('FRONTEND_URL', 'http://localhost:3000')
    redirect_url = f"{frontend_url}/github/connected?success=true&github_username={github_profile.get('login', '')}&user_id={user_id}"
    logger.info(f"Redirecting to: {redirect_url}")
    return redirect(redirect_url)

def get_github_repositories():
    """Get repositories for the authenticated user. Lazy-loads activity metrics when requested."""
    start_time = time.time()
    
    user_id = get_jwt_identity()['user_id']
    logger.info(f"[PERF] get_github_repositories START - user_id: {user_id}")
    
    # Check if user has a GitHub token
    token = GitHubToken.query.filter_by(user_id=user_id).first()
    if not token:
        return jsonify({'message': 'GitHub account not connected'}), 401
    
    # Create GitHub client
    github_client = GitHubClient(token.access_token)
    
    # Fetch repositories (with pagination support)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 30, type=int)
    all_pages_arg = request.args.get('all_pages')
    fetch_all_pages = all_pages_arg is not None and all_pages_arg.lower() == 'true'
    activity_window_days = max(request.args.get('activity_window_days', 7, type=int) or 7, 1)
    include_activity_arg = request.args.get('include_activity')
    # Default to including activity metrics when the parameter is not provided.
    # Reports and dashboards rely on enriched metrics; make explicit calls opt-out
    # by setting include_activity=false when needed.
    include_activity = True if include_activity_arg is None else include_activity_arg.lower() == 'true'
    
    api_start = time.time()
    if fetch_all_pages:
        repositories = []
        effective_per_page = min(max(per_page, 1), 100)
        current_page = max(page, 1)
        max_pages = 10

        while current_page < page + max_pages:
            current_batch = github_client.get_user_repositories(page=current_page, per_page=effective_per_page)
            if not current_batch:
                break

            repositories.extend(current_batch)
            if len(current_batch) < effective_per_page:
                break

            current_page += 1
    else:
        repositories = github_client.get_user_repositories(page=page, per_page=per_page)
    api_time = time.time() - api_start
    logger.info(f"[PERF] GitHub API call took {api_time:.2f}s - got {len(repositories)} repos")

    # Keep a local mapping so downstream endpoints can reference stable local repository IDs.
    github_ids = [repo['id'] for repo in repositories]
    existing_repos = {}
    if github_ids:
        db_query_start = time.time()
        stored_repos = GitHubRepository.query.filter(GitHubRepository.github_id.in_(github_ids)).all()
        db_query_time = time.time() - db_query_start
        logger.info(f"[PERF] Database query for existing repos took {db_query_time:.2f}s - found {len(stored_repos)} existing")
        existing_repos = {stored_repo.github_id: stored_repo for stored_repo in stored_repos}

    formatted_repos = []
    should_commit = False
    new_repos = []
    loop_start = time.time()
    
    # Collect repos that need activity fetching
    repos_needing_activity = []
    repo_data_map = {}  # Map to store local_repo and repo data
    
    for repo in repositories:
        local_repo = existing_repos.get(repo['id'])
        if not local_repo:
            local_repo = GitHubRepository(
                repo_name=repo['full_name'],
                repo_url=repo['html_url'],
                github_id=repo['id'],
            )
            new_repos.append(local_repo)
            db.session.add(local_repo)
            should_commit = True
        else:
            # Keep local metadata up to date when repository names/URLs change.
            if local_repo.repo_name != repo['full_name'] or local_repo.repo_url != repo['html_url']:
                local_repo.repo_name = repo['full_name']
                local_repo.repo_url = repo['html_url']
                should_commit = True

        owner = repo['owner']['login']
        repo_name = repo['name']
        
        # Store metadata for later use
        repo_data_map[f"{owner}/{repo_name}"] = {
            'local_repo': local_repo,
            'repo': repo,
        }
        
        # Queue for concurrent fetching if activity is requested
        if include_activity:
            repos_needing_activity.append({
                'owner': owner,
                'repo_name': repo_name,
                'fallback_open_issues': repo.get('open_issues_count', 0),
                'since_days': activity_window_days,
            })

    # Fetch activity metrics concurrently
    activity_results = {}
    if repos_needing_activity:
        activity_fetch_start = time.time()
        max_workers = min(5, max(2, len(repos_needing_activity)))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {}
            for repo_info in repos_needing_activity:
                key = f"{repo_info['owner']}/{repo_info['repo_name']}"
                future = executor.submit(
                    github_client.get_repository_activity_summary,
                    repo_info['owner'],
                    repo_info['repo_name'],
                    fallback_open_issues=repo_info['fallback_open_issues'],
                    since_days=repo_info['since_days'],
                )
                futures[future] = key
            
            # Collect results as they complete
            for future in as_completed(futures):
                key = futures[future]
                try:
                    activity_results[key] = future.result()
                except Exception as e:
                    logger.warning(f"Failed to fetch activity for {key}: {str(e)}")
                    # Use fallback metrics on error
                    repo_info = next((r for r in repos_needing_activity if f"{r['owner']}/{r['repo_name']}" == key), {})
                    activity_results[key] = {
                        'open_issues': repo_info.get('fallback_open_issues', 0),
                        'open_prs': 0,
                        'recent_commits': 0,
                    }
        
        activity_fetch_time = time.time() - activity_fetch_start
        logger.info(f"[PERF] Concurrent activity fetch took {activity_fetch_time:.2f}s for {len(repos_needing_activity)} repos")

    # Now build formatted repos with activity metrics
    for repo in repositories:
        owner = repo['owner']['login']
        repo_name = repo['name']
        key = f"{owner}/{repo_name}"
        
        repo_data = repo_data_map.get(key, {})
        local_repo = repo_data.get('local_repo')
        
        if include_activity:
            activity_metrics = activity_results.get(key, {
                'open_issues': repo.get('open_issues_count', 0),
                'open_prs': 0,
                'recent_commits': 0,
            })
        else:
            # Return lightweight metrics without making additional GitHub API calls
            activity_metrics = {
                'open_issues': repo.get('open_issues_count', 0),
                'open_prs': 0,
                'recent_commits': 0,
            }
        
        # Store repo data for later formatting after flush
        formatted_repos.append({
            'local_repo': local_repo,
            'repo': repo,
            'activity_metrics': activity_metrics,
        })


    loop_time = time.time() - loop_start
    logger.info(f"[PERF] Loop processing took {loop_time:.2f}s - processed {len(repositories)} repos, include_activity={include_activity}")

    # Flush once after adding all new repos to assign IDs
    if should_commit:
        flush_start = time.time()
        db.session.flush()
        flush_time = time.time() - flush_start
        logger.info(f"[PERF] Database flush took {flush_time:.2f}s - added {len(new_repos)} new repos")
    
    # Now build the final formatted response with IDs
    formatted_response = []
    for repo_data in formatted_repos:
        local_repo = repo_data['local_repo']
        repo = repo_data['repo']
        activity_metrics = repo_data['activity_metrics']
        
        formatted_response.append({
            'id': local_repo.id,
            'github_id': repo['id'],
            'name': repo['name'],
            'full_name': repo['full_name'],
            'owner': repo['owner']['login'],
            'html_url': repo['html_url'],
            'description': repo['description'],
            'private': repo['private'],
            'fork': repo['fork'],
            'created_at': repo['created_at'],
            'updated_at': repo['updated_at'],
            'pushed_at': repo['pushed_at'],
            'language': repo['language'],
            'default_branch': repo['default_branch'],
            'open_issues_count': repo['open_issues_count'],
            'open_issues': activity_metrics['open_issues'],
            'open_prs': activity_metrics['open_prs'],
            'recent_commits': activity_metrics['recent_commits'],
            'last_updated': repo.get('pushed_at') or repo.get('updated_at'),
            'stargazers_count': repo.get('stargazers_count', 0),
            'forks_count': repo.get('forks_count', 0),
        })

    if should_commit:
        db.session.commit()
    
    total_time = time.time() - start_time
    logger.info(f"[PERF] get_github_repositories COMPLETE - total time: {total_time:.2f}s")
    
    return jsonify({
        'repositories': formatted_response
    })

def add_github_repository():
    """Add a GitHub repository to track"""
    data = request.get_json()
    user_id = get_jwt_identity()['user_id']
    
    # Validate repository data
    validation_result = validate_github_repo_data(data)
    if validation_result:
        return validation_result
    
    # Check if user has a GitHub token
    token = GitHubToken.query.filter_by(user_id=user_id).first()
    if not token:
        return jsonify({'message': 'GitHub account not connected'}), 401
    
    # Create GitHub client
    github_client = GitHubClient(token.access_token)
    
    # Parse repository name (owner/repo)
    repo_parts = data['repository_name'].split('/')
    if len(repo_parts) != 2:
        return jsonify({'message': 'Invalid repository name format'}), 400
    
    owner, repo_name = repo_parts
    
    # Fetch repository details from GitHub
    repo_data = github_client.get_repository(owner, repo_name)
    if not repo_data:
        return jsonify({'message': 'Repository not found on GitHub'}), 404
    
    # Check if repository is already tracked
    existing_repo = GitHubRepository.query.filter_by(repo_url=data['repository_url']).first()
    if existing_repo:
        return jsonify({
            'message': 'Repository is already being tracked',
            'repository': {
                'id': existing_repo.id,
                'name': existing_repo.repo_name,
                'url': existing_repo.repo_url
            }
        }), 409
    
    # Create new repository record
    new_repo = GitHubRepository(
        repo_name=data['repository_name'],
        repo_url=data['repository_url'],
        github_id=repo_data['id']
    )
    
    db.session.add(new_repo)
    db.session.commit()
    
    return jsonify({
        'message': 'Repository added successfully',
        'repository': {
            'id': new_repo.id,
            'name': new_repo.repo_name,
            'url': new_repo.repo_url,
        }
    }), 201

def get_repository_issues(repo_id):
    """Get issues for a specific repository"""
    user_id = get_jwt_identity()['user_id']
    
    # Check if repo exists
    repo = GitHubRepository.query.get_or_404(repo_id)
    
    # Check if user has a GitHub token
    token = GitHubToken.query.filter_by(user_id=user_id).first()
    if not token:
        return jsonify({'message': 'GitHub account not connected'}), 401
    
    # Create GitHub client
    github_client = GitHubClient(token.access_token)
    
    # Parse repository name to get owner and repo
    repo_parts = repo.repo_name.split('/')
    if len(repo_parts) != 2:
        return jsonify({'message': 'Invalid repository name format'}), 400
    
    owner, repo_name = repo_parts
    
    # Fetch issues with query parameters
    state = request.args.get('state', 'open')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 30, type=int)
    
    issues = github_client.get_repository_issues(
        owner=owner,
        repo=repo_name,
        state=state,
        page=page,
        per_page=per_page
    )
    
    # Format issue data
    formatted_issues = []
    for issue in issues:
        formatted_issues.append({
            'id': issue['id'],
            'number': issue['number'],
            'title': issue['title'],
            'state': issue['state'],
            'created_at': issue['created_at'],
            'updated_at': issue['updated_at'],
            'html_url': issue['html_url'],
            'body': issue['body'],
            'user': {
                'login': issue['user']['login'],
                'avatar_url': issue['user']['avatar_url'],
            },
            'labels': [{'name': label['name'], 'color': label['color']} for label in issue['labels']]
        })
    
    return jsonify({'issues': formatted_issues})

def get_repository_pulls(repo_id):
    """Get pull requests for a specific repository"""
    user_id = get_jwt_identity()['user_id']
    
    # Check if repo exists
    repo = GitHubRepository.query.get_or_404(repo_id)
    
    # Check if user has a GitHub token
    token = GitHubToken.query.filter_by(user_id=user_id).first()
    if not token:
        return jsonify({'message': 'GitHub account not connected'}), 401
    
    # Create GitHub client
    github_client = GitHubClient(token.access_token)
    
    # Parse repository name to get owner and repo
    repo_parts = repo.repo_name.split('/')
    if len(repo_parts) != 2:
        return jsonify({'message': 'Invalid repository name format'}), 400
    
    owner, repo_name = repo_parts
    
    # Fetch PRs with query parameters
    state = request.args.get('state', 'open')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 30, type=int)
    
    pulls = github_client.get_repository_pulls(
        owner=owner,
        repo=repo_name,
        state=state,
        page=page,
        per_page=per_page
    )
    
    # Format PR data
    formatted_pulls = []
    for pr in pulls:
        formatted_pulls.append({
            'id': pr['id'],
            'number': pr['number'],
            'title': pr['title'],
            'state': pr['state'],
            'created_at': pr['created_at'],
            'updated_at': pr['updated_at'],
            'html_url': pr['html_url'],
            'body': pr['body'],
            'user': {
                'login': pr['user']['login'],
                'avatar_url': pr['user']['avatar_url'],
            },
            'labels': [{'name': label['name'], 'color': label['color']} for label in pr.get('labels', [])],
            'merged': pr.get('merged', False),
            'mergeable': pr.get('mergeable'),
            'draft': pr.get('draft', False)
        })
    
    return jsonify({'pull_requests': formatted_pulls})

def link_task_with_github(task_id):
    """Link a task with a GitHub issue or PR"""
    data = request.get_json() or {}
    user_id = get_jwt_identity()['user_id']
    
    # Normalize request payload for validator/controller compatibility.
    data['task_id'] = task_id
    for int_field in ('repo_id', 'issue_number', 'pull_request_number'):
        if int_field in data and isinstance(data[int_field], str) and data[int_field].isdigit():
            data[int_field] = int(data[int_field])

    # Validate link data
    validation_result = validate_task_github_link(data)
    if validation_result:
        return validation_result
    
    # Check if task exists
    task = Task.query.get_or_404(task_id)
    
    # Check if repo exists
    repo = GitHubRepository.query.get_or_404(data['repo_id'])
    
    # Check if link already exists
    existing_link = TaskGitHubLink.query.filter_by(
        task_id=task_id,
        repo_id=data['repo_id']
    ).first()
    
    if existing_link:
        # Update existing link
        if 'issue_number' in data:
            existing_link.issue_number = data['issue_number']
        if 'pull_request_number' in data:
            existing_link.pull_request_number = data['pull_request_number']
        persisted_link = existing_link
    else:
        # Create new link
        new_link = TaskGitHubLink(
            task_id=task_id,
            repo_id=data['repo_id'],
            issue_number=data.get('issue_number'),
            pull_request_number=data.get('pull_request_number')
        )
        db.session.add(new_link)
        persisted_link = new_link
    
    db.session.commit()
    
    # If we have a GitHub token, add a comment to the issue/PR referencing this task
    token = GitHubToken.query.filter_by(user_id=user_id).first()
    if token and (data.get('issue_number') or data.get('pull_request_number')):
        github_client = GitHubClient(token.access_token)
        
        # Parse repository name
        repo_parts = repo.repo_name.split('/')
        if len(repo_parts) == 2:
            owner, repo_name = repo_parts
            
            # Construct comment with link to DevSync task
            frontend_url = current_app.config.get('FRONTEND_URL', 'http://localhost:3000')
            comment = f"This issue is linked to DevSync task #{task.id}: {task.title}\n\n"
            comment += f"[View in DevSync]({frontend_url}/tasks/{task.id})"
            
            # Add comment to issue or PR
            if data.get('issue_number'):
                github_client.create_issue_comment(owner, repo_name, data['issue_number'], comment)
            elif data.get('pull_request_number'):
                github_client.create_issue_comment(owner, repo_name, data['pull_request_number'], comment)
    
    return jsonify({
        'message': 'Task linked with GitHub successfully',
        'link': {
            'id': persisted_link.id,
            'task_id': task_id,
            'repo_id': data['repo_id'],
            'repo_name': repo.repo_name,
            'repo_url': repo.repo_url,
            'issue_number': data.get('issue_number'),
            'pull_request_number': data.get('pull_request_number'),
            'created_at': persisted_link.created_at.isoformat() if persisted_link.created_at else None
        }
    })

def get_task_github_links(task_id):
    """Get all GitHub links for a task"""
    # Check if task exists
    task = Task.query.get_or_404(task_id)
    
    # Get all links for this task
    links = TaskGitHubLink.query.filter_by(task_id=task_id).all()
    
    # Format link data
    formatted_links = []
    for link in links:
        repo = GitHubRepository.query.get(link.repo_id)
        formatted_links.append({
            'id': link.id,
            'task_id': link.task_id,
            'repo_id': link.repo_id,
            'repo_name': repo.repo_name if repo else None,
            'repo_url': repo.repo_url if repo else None,
            'issue_number': link.issue_number,
            'pull_request_number': link.pull_request_number,
            'created_at': link.created_at.isoformat() if link.created_at else None
        })
    
    return jsonify({'links': formatted_links})

def delete_task_github_link(task_id, link_id):
    """Delete a GitHub link from a task"""
    # Check if task exists
    task = Task.query.get_or_404(task_id)
    
    # Find the link
    link = TaskGitHubLink.query.get_or_404(link_id)
    
    # Verify link belongs to the task
    if link.task_id != task_id:
        return jsonify({'message': 'Link does not belong to this task'}), 400
        
    # Delete the link
    db.session.delete(link)
    db.session.commit()
    
    return jsonify({'message': 'GitHub link removed from task'})


def disconnect_github_account():
    """Disconnect the authenticated user's GitHub account."""
    identity = get_jwt_identity()
    user_id = identity['user_id'] if isinstance(identity, dict) else identity

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return jsonify({'message': 'Invalid user identity'}), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    GitHubToken.query.filter_by(user_id=user_id).delete()
    user.github_username = None
    user.github_connected = False
    db.session.commit()

    return jsonify({'message': 'GitHub account disconnected successfully'})
