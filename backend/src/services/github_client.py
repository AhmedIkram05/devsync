"""
GitHub API client utilities for DevSync with rate limit handling
"""
import os
import requests
import logging
import time
import json
import base64
import uuid
from datetime import datetime, timedelta
from flask import current_app, g, request, redirect

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GitHubClient:
    """Client for the GitHub API with rate limit handling"""
    
    BASE_API_URL = "https://api.github.com"
    AUTH_URL = "https://github.com/login/oauth/authorize"
    TOKEN_URL = "https://github.com/login/oauth/access_token"
    
    def __init__(self, access_token=None):
        self.access_token = access_token
        self.remaining_rate_limit = None
        self.rate_limit_reset = None
        # Keep cache scoped to a client instance so tests/requests do not cross-contaminate.
        self._cache = {}
        self._cache_expiry = {}
    
    @staticmethod
    def create_state_param(user_id):
        """Create a secure state parameter with encoded user ID"""
        # Create a dictionary with user ID and a random component
        state_data = {
            'userId': user_id,
            'nonce': str(uuid.uuid4())
        }
        
        # Convert to JSON and encode as base64
        state_json = json.dumps(state_data)
        state = base64.b64encode(state_json.encode('utf-8')).decode('utf-8')
        
        # Replace characters that might cause issues in URLs
        state = state.replace('+', '-').replace('/', '_').replace('=', '')
        
        return state
    
    @staticmethod
    def parse_state_param(state):
        """Parse a state parameter to extract the user ID"""
        try:
            # Add padding if necessary
            padding = len(state) % 4
            if padding:
                state += '=' * (4 - padding)
            
            # Replace URL-safe characters with base64 standard
            state = state.replace('-', '+').replace('_', '/')
            
            # Decode the base64 string
            decoded_bytes = base64.b64decode(state)
            decoded_state = json.loads(decoded_bytes.decode('utf-8'))
            
            # Extract the user ID
            return decoded_state.get('userId')
        except Exception as e:
            logger.error(f"Error parsing state parameter: {str(e)}")
            return None
    
    @staticmethod
    def get_auth_url(state):
        """
        Get the GitHub OAuth authorization URL
        """
        client_id = current_app.config.get('GITHUB_CLIENT_ID')
        redirect_uri = current_app.config.get('GITHUB_REDIRECT_URI')
        
        logger.info(f"Creating GitHub auth URL with client_id: {client_id}, redirect_uri: {redirect_uri}")
        
        # Include required scopes for your app
        scopes = "repo user"
        
        return (
            f"{GitHubClient.AUTH_URL}?"
            f"client_id={client_id}&"
            f"redirect_uri={redirect_uri}&"
            f"state={state}&"
            f"scope={scopes}"
        )
    
    @staticmethod
    def exchange_code_for_token(code):
        """
        Exchange authorization code for access token
        """
        client_id = current_app.config.get('GITHUB_CLIENT_ID')
        client_secret = current_app.config.get('GITHUB_CLIENT_SECRET')
        redirect_uri = current_app.config.get('GITHUB_REDIRECT_URI')
        
        logger.info(f"Exchanging code for token with GitHub...")
        logger.info(f"Using client_id: {client_id}")
        logger.info(f"Using redirect_uri: {redirect_uri}")
        logger.info(f"Code (first 10 chars): {code[:10]}...")
        
        # Create payload for token request
        data = {
            'client_id': client_id,
            'client_secret': client_secret,
            'code': code,
            'redirect_uri': redirect_uri
        }
        
        headers = {'Accept': 'application/json'}
        
        logger.info("Making POST request to GitHub for token exchange...")
        try:
            response = requests.post(
                GitHubClient.TOKEN_URL,
                data=data,
                headers=headers
            )
            
            status_code = response.status_code
            logger.info(f"GitHub token exchange response status: {status_code}")
            
            if status_code == 200:
                try:
                    response_json = response.json()
                    if 'error' in response_json:
                        logger.error(f"GitHub error response: {response_json['error']}")
                        if 'error_description' in response_json:
                            logger.error(f"Error description: {response_json['error_description']}")
                        return None
                    
                    logger.info("Successfully obtained access token from GitHub")
                    if 'access_token' in response_json:
                        token_preview = response_json['access_token'][:10] + '...' if response_json['access_token'] else 'None'
                        logger.info(f"Access token (first 10 chars): {token_preview}")
                        return response_json
                    else:
                        logger.error("No access_token in response even though status was 200")
                        logger.error(f"Response keys: {response_json.keys()}")
                        return None
                except Exception as e:
                    logger.error(f"Error parsing JSON response: {str(e)}")
                    logger.error(f"Raw response content: {response.text}")
                    return None
            else:
                logger.error(f"Non-200 status code. Raw response: {response.text}")
                return None
        except Exception as e:
            logger.error(f"Exception during token exchange request: {str(e)}")
            return None
    
    def get_headers(self):
        """Get headers with authorization for API requests"""
        headers = {
            'Accept': 'application/vnd.github.v3+json'
        }
        
        if self.access_token:
            headers['Authorization'] = f'token {self.access_token}'
            
        return headers
    
    def _handle_rate_limit(self, response):
        """Extract and handle rate limit information from response"""
        # Extract rate limit headers
        remaining = response.headers.get('X-RateLimit-Remaining')
        reset = response.headers.get('X-RateLimit-Reset')
        
        if remaining is not None:
            self.remaining_rate_limit = int(remaining)
            
        if reset is not None:
            self.rate_limit_reset = int(reset)
            
        # Check if we're close to hitting the rate limit
        if self.remaining_rate_limit is not None and self.remaining_rate_limit < 10:
            logger.warning(f"GitHub API rate limit running low: {self.remaining_rate_limit} requests remaining")
            
        # Handle rate limit exceeded
        if response.status_code == 403 and 'rate limit exceeded' in response.text.lower():
            if self.rate_limit_reset:
                now = int(time.time())
                sleep_time = max(0, self.rate_limit_reset - now)
                
                if sleep_time > 0 and sleep_time < 300:  # Only sleep for reasonable times (<5 min)
                    logger.warning(f"Rate limit exceeded. Sleeping for {sleep_time} seconds")
                    time.sleep(sleep_time)
                    return True  # Retry
            
            # If we can't sleep or sleep time is too long, raise exception
            raise Exception("GitHub API rate limit exceeded. Please try again later.")
            
        return False
        
    def _make_request(self, method, url, **kwargs):
        """Make a request with rate limit handling and caching"""
        # Generate cache key if caching is enabled
        cache_enabled = kwargs.pop('use_cache', True)
        cache_ttl = kwargs.pop('cache_ttl', 300)  # Default 5 minutes cache
        
        if cache_enabled:
            # Create a cache key based on method, URL and params
            params = kwargs.get('params', {})
            cache_key = f"{method}:{url}:{json.dumps(params, sort_keys=True)}"
            
            # Check if we have a cached response
            if cache_key in self._cache and datetime.now() < self._cache_expiry.get(cache_key, datetime.min):
                logger.debug(f"Using cached response for {cache_key}")
                return self._cache[cache_key]
        
        # Make the actual request
        retry = True
        retry_count = 0
        max_retries = 2
        
        while retry and retry_count <= max_retries:
            retry = False
            retry_count += 1
            
            try:
                method_upper = method.upper()
                request_kwargs = {
                    'headers': self.get_headers(),
                    **kwargs,
                }

                if method_upper == 'GET':
                    response = requests.get(url, **request_kwargs)
                elif method_upper == 'POST':
                    response = requests.post(url, **request_kwargs)
                else:
                    response = requests.request(method_upper, url, **request_kwargs)
                
                # Handle rate limits
                if self._handle_rate_limit(response):
                    retry = True
                    continue
                
                # For successful responses, cache the result if caching is enabled
                if cache_enabled and response.status_code == 200:
                    try:
                        result = response.json()
                        self._cache[cache_key] = result
                        self._cache_expiry[cache_key] = datetime.now() + timedelta(seconds=cache_ttl)
                        return result
                    except:
                        pass  # If parsing fails, just return the response normally
                
                # Return appropriate data based on status code
                if 200 <= response.status_code < 300:
                    if response.status_code == 204:  # No content
                        return True
                    try:
                        return response.json()
                    except Exception:
                        return True
                else:
                    logger.error(f"GitHub API error: {response.status_code} - {response.text}")
                    return None
                    
            except Exception as e:
                logger.error(f"Request error: {str(e)}")
                if retry_count <= max_retries:
                    logger.info(f"Retrying... (attempt {retry_count}/{max_retries})")
                    retry = True
                    time.sleep(1)  # Wait before retrying
                else:
                    raise
        
        return None  # Fallback return
    
    def get_user_profile(self):
        """Get authenticated user's GitHub profile"""
        return self._make_request('GET', f"{self.BASE_API_URL}/user", use_cache=True, cache_ttl=300)
    
    def get_user_repositories(self, page=1, per_page=30):
        """Get repositories for the authenticated user"""
        return self._make_request(
            'GET', 
            f"{self.BASE_API_URL}/user/repos",
            params={
                'page': page,
                'per_page': per_page,
                'sort': 'updated',
                'affiliation': 'owner,collaborator,organization_member'
            },
            use_cache=True,
            cache_ttl=300
        ) or []
    
    def get_repository(self, owner, repo):
        """Get a specific repository by owner and name"""
        return self._make_request(
            'GET',
            f"{self.BASE_API_URL}/repos/{owner}/{repo}",
            use_cache=True,
            cache_ttl=600  # Cache for 10 minutes
        )
    
    def get_repository_issues(self, owner, repo, state='open', page=1, per_page=30):
        """Get issues for a repository"""
        return self._make_request(
            'GET',
            f"{self.BASE_API_URL}/repos/{owner}/{repo}/issues",
            params={
                'state': state,
                'page': page,
                'per_page': per_page
            },
            use_cache=True,
            cache_ttl=300
        ) or []
    
    def get_repository_pulls(self, owner, repo, state='open', page=1, per_page=30):
        """Get pull requests for a repository"""
        return self._make_request(
            'GET',
            f"{self.BASE_API_URL}/repos/{owner}/{repo}/pulls",
            params={
                'state': state,
                'page': page,
                'per_page': per_page
            },
            use_cache=True, 
            cache_ttl=300
        ) or []
    
    def create_issue_comment(self, owner, repo, issue_number, body):
        """Add a comment to an issue or pull request"""
        return self._make_request(
            'POST',
            f"{self.BASE_API_URL}/repos/{owner}/{repo}/issues/{issue_number}/comments",
            json={'body': body},
            use_cache=False  # Don't cache POST requests
        )
