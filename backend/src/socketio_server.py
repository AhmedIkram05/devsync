import functools
from flask import request
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
from flask_jwt_extended import decode_token, verify_jwt_in_request
from jwt.exceptions import InvalidTokenError

# Initialize SocketIO
socketio = SocketIO(cors_allowed_origins="*")

# Store for connected users and project rooms
connected_users = {}  # user_id -> session_id
project_rooms = {}    # project_id -> [user_ids]

def authenticated_only(f):
    """Decorator that verifies JWT token for socket connections"""
    @functools.wraps(f)
    def wrapped(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            disconnect()
            return False
        
        try:
            token = auth_header.split(' ')[1]
            decoded_token = decode_token(token)
            identity = decoded_token.get('identity', decoded_token.get('sub'))
            user_id = identity.get('user_id') if isinstance(identity, dict) else identity
            if not user_id:
                disconnect()
                return False
            
            # Add user_id to the kwargs so event handlers can use it
            kwargs['user_id'] = user_id
            return f(*args, **kwargs)
        except InvalidTokenError:
            disconnect()
            return False
    return wrapped

# Connection event handlers
@socketio.on('connect')
def handle_connect():
    """Handle new connections"""
    # Authentication is handled separately via @authenticated_only decorator
    print("Client connected:", request.sid)
    return True

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnections"""
    # Remove user from connected_users
    user_id = next((uid for uid, sid in connected_users.items() if sid == request.sid), None)
    if user_id:
        del connected_users[user_id]
        
        # Remove user from all project rooms
        for project_id, members in project_rooms.items():
            if user_id in members:
                members.remove(user_id)
        
    print("Client disconnected:", request.sid)

@socketio.on('register')
@authenticated_only
def handle_register(data, user_id):
    """Register a user's socket connection"""
    connected_users[user_id] = request.sid
    print(f"User {user_id} registered with socket ID {request.sid}")
    return {"status": "success", "message": "Registered successfully"}

# Room management handlers
@socketio.on('join_project')
@authenticated_only
def handle_join_project(data, user_id):
    """Join a project room"""
    project_id = data.get('project_id')
    if not project_id:
        return {"status": "error", "message": "Project ID required"}
    
    # Add user to project room
    join_room(f"project_{project_id}")
    
    # Track user in project_rooms
    if project_id not in project_rooms:
        project_rooms[project_id] = []
    
    if user_id not in project_rooms[project_id]:
        project_rooms[project_id].append(user_id)
    
    print(f"User {user_id} joined project {project_id}")
    return {"status": "success", "message": "Joined project room"}

@socketio.on('leave_project')
@authenticated_only
def handle_leave_project(data, user_id):
    """Leave a project room"""
    project_id = data.get('project_id')
    if not project_id:
        return {"status": "error", "message": "Project ID required"}
    
    # Remove user from project room
    leave_room(f"project_{project_id}")
    
    # Update project_rooms tracking
    if project_id in project_rooms and user_id in project_rooms[project_id]:
        project_rooms[project_id].remove(user_id)
    
    print(f"User {user_id} left project {project_id}")
    return {"status": "success", "message": "Left project room"}

# Event handlers for various notifications
@socketio.on('task_update')
@authenticated_only
def handle_task_update(data, user_id):
    """Broadcast task updates to project members"""
    project_id = data.get('project_id')
    task_id = data.get('task_id')
    update_type = data.get('update_type', 'updated')  # created, updated, completed
    
    if not project_id or not task_id:
        return {"status": "error", "message": "Project ID and Task ID required"}
    
    # Broadcast to project room
    emit('task_updated', {
        'task_id': task_id,
        'update_type': update_type,
        'updated_by': user_id,
        'timestamp': data.get('timestamp')
    }, to=f"project_{project_id}")
    
    return {"status": "success", "message": f"Task {update_type} notification sent"}

@socketio.on('comment_added')
@authenticated_only
def handle_comment_added(data, user_id):
    """Notify about new comments"""
    project_id = data.get('project_id')
    task_id = data.get('task_id')
    comment_id = data.get('comment_id')
    mentioned_users = data.get('mentioned_users', [])
    
    if not all([project_id, task_id, comment_id]):
        return {"status": "error", "message": "Missing required data"}
    
    # Broadcast to project room
    emit('new_comment', {
        'task_id': task_id,
        'comment_id': comment_id,
        'author_id': user_id,
        'timestamp': data.get('timestamp')
    }, to=f"project_{project_id}")
    
    # Additionally notify specifically mentioned users
    for mentioned_user in mentioned_users:
        if mentioned_user in connected_users:
            emit('user_mentioned', {
                'task_id': task_id,
                'comment_id': comment_id,
                'mentioned_by': user_id,
                'timestamp': data.get('timestamp')
            }, to=connected_users[mentioned_user])
    
    return {"status": "success", "message": "Comment notification sent"}

@socketio.on('project_updated')
@authenticated_only
def handle_project_updated(data, user_id):
    """Notify about project updates"""
    project_id = data.get('project_id')
    update_type = data.get('update_type', 'updated')  # updated, member_added, etc.
    
    if not project_id:
        return {"status": "error", "message": "Project ID required"}
    
    # Broadcast to project room
    emit('project_update', {
        'project_id': project_id,
        'update_type': update_type,
        'updated_by': user_id,
        'data': data.get('data', {}),
        'timestamp': data.get('timestamp')
    }, to=f"project_{project_id}")
    
    return {"status": "success", "message": f"Project {update_type} notification sent"}

def init_socketio(app):
    """Initialize SocketIO with the Flask app"""
    socketio.init_app(app, cors_allowed_origins="*")
    return socketio
