# DevSync

[![Python Tests](https://github.com/AhmedIkram05/devsync/actions/workflows/pytest-ci.yml/badge.svg)](https://github.com/AhmedIkram05/devsync/actions/workflows/pytest-ci.yml)

DevSync is a development synchronisation platform that integrates database management, GitHub integration, and task tracking into one unified system.

## Overview

DevSync streamlines collaboration by connecting your database, GitHub repositories, and local development environment. It is designed to make it easy for teams to manage tasks, track issues, and synchronise changes.

## Features

- **Database Integration**: Connect to PostgreSQL databases with ease.
- **GitHub Integration**: Seamless OAuth configuration and repository tracking.
- **Task Management**: Create, update, and monitor tasks and projects.
- **Scalable Architecture**: Indexed database schema for optimal performance.

## Installation

### Prerequisites

- Python 3.8 or higher
- Node.js 14.x or higher
- npm 6.x or higher
- Docker Engine (or Docker Desktop)
- Docker Compose plugin (`docker compose`)

### Step 1: Clone the Repository

```bash
git clone https://github.com/AhmedIkram05/DevSync
cd DevSync
```

### Step 2: Setup Python Virtual Environment

#### macOS/Linux

```bash
python -m venv .venv
source .venv/bin/activate
```

#### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
```

### Step 3: Install Backend Dependencies

```bash
pip install -r requirements.txt
```

### Step 4: Setup Frontend

```bash
cd frontend
npm install
```

## Running The Application

### Backend Server

```bash
source .venv/bin/activate  # If not already activated
cd backend/src
python app.py
```

The API server will start running on <http://localhost:8000>

### Frontend Server

```bash
cd frontend
npm run build
serve -s build
```

The React app should automatically open in your browser at <http://localhost:3000>

## Configuration

### Environment Variables

Create a `.env` file at the repository root (or copy from `.env.example`) and add the following variables:

```bash
cp .env.example .env
```

```env
# Flask Application Settings
FLASK_APP=backend/src/app.py
FLASK_ENV=development

# Local PostgreSQL (Docker)
POSTGRES_PASSWORD=your_local_postgres_password
DATABASE_URL=postgresql://devsync:your_local_postgres_password@localhost:5432/devsync?sslmode=disable

# Authentication
JWT_SECRET_KEY=your_secure_secret_key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_REDIRECT_URI=http://localhost:8000/api/v1/github/callback
FRONTEND_URL=http://localhost:3000
```

### Database Setup

Start local PostgreSQL with Docker:

```bash
docker compose -f docker-compose.local-postgres.yml up -d
```

Bootstrap tables and indexes:

```bash
source .venv/bin/activate
python backend/src/db/scripts/setup_database.py
```

(Optional) Inspect schema details:

```bash
source .venv/bin/activate
python backend/src/db/scripts/inspect_database.py
```

### Database Shortcuts (Makefile)

Use these commands from the repository root:

```bash
make db-up
make db-setup
make db-inspect
make db-reset
make db-down
```

### API Documentation

The API documentation is available at `/api/docs` endpoint.
