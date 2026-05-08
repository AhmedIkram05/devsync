from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch


def _issue_payload(number=1):
    return {
        'id': number,
        'number': number,
        'title': f'Issue {number}',
        'state': 'open',
        'created_at': '2026-01-01T00:00:00Z',
        'updated_at': '2026-01-02T00:00:00Z',
        'html_url': f'https://github.com/org/repo/issues/{number}',
        'body': 'Issue body',
        'user': {'login': 'octocat', 'avatar_url': 'https://example.com/a.png'},
        'labels': [{'name': 'bug', 'color': 'ff0000'}],
    }


def _pr_payload(number=1):
    payload = _issue_payload(number)
    payload['html_url'] = f'https://github.com/org/repo/pull/{number}'
    payload['merged'] = False
    payload['mergeable'] = True
    payload['draft'] = False
    return payload


def test_check_github_config(app):
    app.config.update({
        'GITHUB_CLIENT_ID': 'abcd1234',
        'GITHUB_CLIENT_SECRET': 'secret',
        'GITHUB_REDIRECT_URI': 'http://localhost/callback',
        'FRONTEND_URL': 'http://localhost:3000',
    })

    with app.app_context():
        from backend.src.api.controllers.github_controller import check_github_config

        response = check_github_config()

    data = response.get_json()
    assert data['config_status']['client_id_set'] is True
    assert data['client_id'] == 'abcd****'


@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value={'user_id': 1})
def test_initiate_github_auth_requires_credentials(mock_identity, app):
    app.config.update({'GITHUB_CLIENT_ID': '', 'GITHUB_CLIENT_SECRET': ''})

    with app.app_context():
        from backend.src.api.controllers.github_controller import initiate_github_auth

        response, status = initiate_github_auth()

    assert status == 503
    assert 'not configured' in response.get_json()['error']


@patch('backend.src.api.controllers.github_controller.GitHubClient')
@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value={'user_id': 1})
def test_initiate_github_auth_success(mock_identity, mock_client, app):
    app.config.update({'GITHUB_CLIENT_ID': 'id', 'GITHUB_CLIENT_SECRET': 'secret'})
    mock_client.get_auth_url.return_value = 'https://github.com/oauth'

    with app.app_context():
        from backend.src.api.controllers.github_controller import initiate_github_auth

        response = initiate_github_auth()

    assert response.get_json()['authorization_url'] == 'https://github.com/oauth'


def test_github_callback_missing_params(app):
    with app.test_request_context('/github/callback?state=abc'):
        from backend.src.api.controllers.github_controller import github_callback

        response, status = github_callback()

    assert status == 400


def test_github_callback_invalid_base64_state(app):
    with app.test_request_context('/github/callback?code=abc&state=not-base64'):
        from backend.src.api.controllers.github_controller import github_callback

        response, status = github_callback()

    assert status == 400
    assert 'Invalid state parameter format' in response.get_json()['error']


def test_github_callback_missing_user_id_in_decoded_state(app):
    with patch('base64.b64decode', return_value=b'{"foo": 1}'):
        with app.test_request_context('/github/callback?code=abc&state=Zm9v'):
            from backend.src.api.controllers.github_controller import github_callback

            response, status = github_callback()

    assert status == 400


@patch('backend.src.api.controllers.github_controller.GitHubClient')
def test_github_callback_exchange_token_failure(mock_client, app):
    with patch('base64.b64decode', return_value=b'{"userId": 7}'):
        mock_client.exchange_code_for_token.return_value = None
        with app.test_request_context('/github/callback?code=abc&state=Zm9v'):
            from backend.src.api.controllers.github_controller import github_callback

            response, status = github_callback()

    assert status == 400
    assert response.get_json()['message'] == 'Failed to obtain access token'


@patch('backend.src.api.controllers.github_controller.redirect', side_effect=lambda url: url)
@patch('backend.src.api.controllers.github_controller.db')
@patch('backend.src.api.controllers.github_controller.User')
@patch('backend.src.api.controllers.github_controller.GitHubToken')
@patch('backend.src.api.controllers.github_controller.GitHubClient')
def test_github_callback_success_existing_token(
    mock_client,
    mock_token,
    mock_user,
    mock_db,
    mock_redirect,
    app,
):
    app.config.update({'FRONTEND_URL': 'http://localhost:3000'})
    existing_token = SimpleNamespace(access_token='old', refresh_token=None, token_expires_at=None)
    mock_token.query.filter_by.return_value.first.return_value = existing_token
    mock_user.query.get.return_value = SimpleNamespace(github_username=None, github_connected=False)

    mock_client.exchange_code_for_token.return_value = {'access_token': 'new-token'}
    client_instance = mock_client.return_value
    client_instance.get_user_profile.return_value = {'login': 'octocat'}

    with patch('base64.b64decode', return_value=b'{"userId": 7}'):
        with app.test_request_context('/github/callback?code=abc&state=Zm9v'):
            from backend.src.api.controllers.github_controller import github_callback

            result = github_callback()

    assert 'success=true' in result
    mock_db.session.commit.assert_called_once()


@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value={'user_id': 1})
@patch('backend.src.api.controllers.github_controller.validate_github_repo_data', return_value=({'message': 'bad'}, 400))
def test_add_github_repository_validation_error(mock_validate, mock_identity, app):
    with app.test_request_context('/github/repositories', method='POST', json={}):
        from backend.src.api.controllers.github_controller import add_github_repository

        result = add_github_repository()

    assert result == ({'message': 'bad'}, 400)


@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value={'user_id': 1})
@patch('backend.src.api.controllers.github_controller.validate_github_repo_data', return_value=None)
@patch('backend.src.api.controllers.github_controller.GitHubToken')
def test_add_github_repository_requires_token(mock_token, mock_validate, mock_identity, app):
    mock_token.query.filter_by.return_value.first.return_value = None

    payload = {'repository_name': 'org/repo', 'repository_url': 'https://github.com/org/repo'}
    with app.test_request_context('/github/repositories', method='POST', json=payload):
        from backend.src.api.controllers.github_controller import add_github_repository

        response, status = add_github_repository()

    assert status == 401


@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value={'user_id': 1})
@patch('backend.src.api.controllers.github_controller.validate_github_repo_data', return_value=None)
@patch('backend.src.api.controllers.github_controller.GitHubToken')
@patch('backend.src.api.controllers.github_controller.GitHubClient')
def test_add_github_repository_invalid_name_format(mock_client, mock_token, mock_validate, mock_identity, app):
    mock_token.query.filter_by.return_value.first.return_value = SimpleNamespace(access_token='token')

    payload = {'repository_name': 'bad-name', 'repository_url': 'https://github.com/org/repo'}
    with app.test_request_context('/github/repositories', method='POST', json=payload):
        from backend.src.api.controllers.github_controller import add_github_repository

        response, status = add_github_repository()

    assert status == 400


@patch('backend.src.api.controllers.github_controller.db')
@patch('backend.src.api.controllers.github_controller.GitHubRepository')
@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value={'user_id': 1})
@patch('backend.src.api.controllers.github_controller.validate_github_repo_data', return_value=None)
@patch('backend.src.api.controllers.github_controller.GitHubToken')
@patch('backend.src.api.controllers.github_controller.GitHubClient')
def test_add_github_repository_success(mock_client, mock_token, mock_validate, mock_identity, mock_repo, mock_db, app):
    mock_token.query.filter_by.return_value.first.return_value = SimpleNamespace(access_token='token')
    mock_client.return_value.get_repository.return_value = {'id': 77}
    mock_repo.query.filter_by.return_value.first.return_value = None

    repo_instance = SimpleNamespace(id=3, repo_name='org/repo', repo_url='https://github.com/org/repo')
    mock_repo.return_value = repo_instance

    payload = {'repository_name': 'org/repo', 'repository_url': 'https://github.com/org/repo'}
    with app.test_request_context('/github/repositories', method='POST', json=payload):
        from backend.src.api.controllers.github_controller import add_github_repository

        response, status = add_github_repository()

    assert status == 201
    assert response.get_json()['repository']['id'] == 3


@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value={'user_id': 1})
@patch('backend.src.api.controllers.github_controller.GitHubRepository')
@patch('backend.src.api.controllers.github_controller.GitHubToken')
def test_get_repository_issues_requires_token(mock_token, mock_repo, mock_identity, app):
    mock_repo.query.get_or_404.return_value = SimpleNamespace(repo_name='org/repo')
    mock_token.query.filter_by.return_value.first.return_value = None

    with app.test_request_context('/github/repos/1/issues'):
        from backend.src.api.controllers.github_controller import get_repository_issues

        response, status = get_repository_issues(1)

    assert status == 401


@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value={'user_id': 1})
@patch('backend.src.api.controllers.github_controller.GitHubClient')
@patch('backend.src.api.controllers.github_controller.GitHubRepository')
@patch('backend.src.api.controllers.github_controller.GitHubToken')
def test_get_repository_issues_success(mock_token, mock_repo, mock_client, mock_identity, app):
    mock_repo.query.get_or_404.return_value = SimpleNamespace(repo_name='org/repo')
    mock_token.query.filter_by.return_value.first.return_value = SimpleNamespace(access_token='token')
    mock_client.return_value.get_repository_issues.return_value = [_issue_payload(5)]

    with app.test_request_context('/github/repos/1/issues?state=open&page=1&per_page=10'):
        from backend.src.api.controllers.github_controller import get_repository_issues

        response = get_repository_issues(1)

    assert response.get_json()['issues'][0]['number'] == 5


@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value={'user_id': 1})
@patch('backend.src.api.controllers.github_controller.GitHubClient')
@patch('backend.src.api.controllers.github_controller.GitHubRepository')
@patch('backend.src.api.controllers.github_controller.GitHubToken')
def test_get_repository_pulls_success(mock_token, mock_repo, mock_client, mock_identity, app):
    mock_repo.query.get_or_404.return_value = SimpleNamespace(repo_name='org/repo')
    mock_token.query.filter_by.return_value.first.return_value = SimpleNamespace(access_token='token')
    mock_client.return_value.get_repository_pulls.return_value = [_pr_payload(8)]

    with app.test_request_context('/github/repos/1/pulls?state=open&page=1&per_page=10'):
        from backend.src.api.controllers.github_controller import get_repository_pulls

        response = get_repository_pulls(1)

    assert response.get_json()['pull_requests'][0]['number'] == 8


@patch('backend.src.api.controllers.github_controller.GitHubRepository')
@patch('backend.src.api.controllers.github_controller.TaskGitHubLink')
@patch('backend.src.api.controllers.github_controller.Task')
def test_get_task_github_links_formats_response(mock_task, mock_link, mock_repo, app):
    mock_task.query.get_or_404.return_value = SimpleNamespace(id=1)
    now = datetime.now()
    mock_link.query.filter_by.return_value.all.return_value = [
        SimpleNamespace(id=1, task_id=1, repo_id=2, issue_number=9, pull_request_number=None, created_at=now)
    ]
    mock_repo.query.get.return_value = SimpleNamespace(repo_name='org/repo', repo_url='https://github.com/org/repo')

    with app.app_context():
        from backend.src.api.controllers.github_controller import get_task_github_links

        response = get_task_github_links(1)

    assert response.get_json()['links'][0]['repo_name'] == 'org/repo'


@patch('backend.src.api.controllers.github_controller.db')
@patch('backend.src.api.controllers.github_controller.TaskGitHubLink')
@patch('backend.src.api.controllers.github_controller.Task')
def test_delete_task_github_link_wrong_task(mock_task, mock_link, mock_db, app):
    mock_task.query.get_or_404.return_value = SimpleNamespace(id=1)
    mock_link.query.get_or_404.return_value = SimpleNamespace(task_id=99)

    with app.app_context():
        from backend.src.api.controllers.github_controller import delete_task_github_link

        response, status = delete_task_github_link(1, 2)

    assert status == 400


@patch('backend.src.api.controllers.github_controller.db')
@patch('backend.src.api.controllers.github_controller.User')
@patch('backend.src.api.controllers.github_controller.GitHubToken')
@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value='abc')
def test_disconnect_github_account_invalid_identity(mock_identity, mock_token, mock_user, mock_db, app):
    with app.app_context():
        from backend.src.api.controllers.github_controller import disconnect_github_account

        response, status = disconnect_github_account()

    assert status == 401


@patch('backend.src.api.controllers.github_controller.db')
@patch('backend.src.api.controllers.github_controller.User')
@patch('backend.src.api.controllers.github_controller.GitHubToken')
@patch('backend.src.api.controllers.github_controller.get_jwt_identity', return_value={'user_id': 5})
def test_disconnect_github_account_success(mock_identity, mock_token, mock_user, mock_db, app):
    user = SimpleNamespace(github_username='octocat', github_connected=True)
    mock_user.query.get.return_value = user

    with app.app_context():
        from backend.src.api.controllers.github_controller import disconnect_github_account

        response = disconnect_github_account()

    assert response.get_json()['message'] == 'GitHub account disconnected successfully'
    assert user.github_username is None
    assert user.github_connected is False
    mock_db.session.commit.assert_called_once()
