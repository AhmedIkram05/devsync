# DevSync

[![CI](https://github.com/AhmedIkram05/devsync/actions/workflows/ci.yml/badge.svg)](https://github.com/AhmedIkram05/devsync/actions/workflows/ci.yml)

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
source .venv/bin/activate
cd backend/src
python app.py
```

The API server will start running on <http://localhost:8000>

### Frontend Server

```bash
cd frontend
npm run dev

#or

cd frontend
serve -s build
npm run build
```

The app should automatically open in your browser at <http://localhost:5173>

## Configuration

### Environment Variables

Create a `.env` file at the repository root (or copy from `.env.example`) and add the following variables:

```bash
cp .env.example .env
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

## Dockerized Backend (Recommended for Production-like testing)

You can run the backend in a containerized environment using Gunicorn and an async Socket.IO worker.

### Setup

1. Ensure your `.env` file has the correct `DATABASE_URL` (see `.env.example`).
2. Build the backend image:
   ```bash
   make backend-build
   ```

### Running

Start the full stack (DB + Backend):
```bash
make backend-up
```

View logs:
```bash
make backend-logs
```

Stop the stack:
```bash
make backend-down
```

## AWS Deployment (S3 + ECR + App Runner + RDS)

This project is configured for a lean, low-cost deployment to AWS using GitHub Actions.

### 1. RDS (PostgreSQL)
- Create a Free Tier RDS instance.
- **Connectivity**: Public access = Yes (protected by password + Security Group).
- **Security Group**: Allow PostgreSQL (5432) from `0.0.0.0/0`.
- **Full DATABASE_URL**: `postgresql://admin:password@endpoint:5432/db_name`

### 2. ECR (Container Registry)
- Create a private repository named `devsync-backend`.

### 3. IAM User for GitHub Actions
Create a user named `github-actions-devsync` and attach this inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ECRAuth", "Effect": "Allow", "Action": "ecr:GetAuthorizationToken", "Resource": "*" },
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": ["ecr:BatchCheckLayerAvailability", "ecr:CompleteLayerUpload", "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart", "ecr:DescribeRepositories", "ecr:BatchGetImage"],
      "Resource": "arn:aws:ecr:us-east-1:ACCOUNT_ID:repository/devsync-backend"
    },
    {
      "Sid": "S3Deploy",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": ["arn:aws:s3:::devsync-frontend-prod", "arn:aws:s3:::devsync-frontend-prod/*"]
    },
    { "Sid": "CloudFrontInvalidate", "Effect": "Allow", "Action": "cloudfront:CreateInvalidation", "Resource": "*" },
    { "Sid": "AppRunnerDeploy", "Effect": "Allow", "Action": ["apprunner:UpdateService", "apprunner:DescribeService", "apprunner:StartDeployment"], "Resource": "*" }
  ]
}
```

### 4. App Runner (Backend)
- Connect to your ECR repository.
- **Port**: Set to **`8000`** (Match `Dockerfile` EXPOSE).
- **Environment variables**: `DATABASE_URL`, `JWT_SECRET_KEY`, `FLASK_ENV=production`.

### 5. S3 + CloudFront (Frontend)
- **S3**: Enable static website hosting.
- **CloudFront**: Origin Access Control (OAC) to your S3 bucket.

### 6. GitHub Secrets
Add these to your repo:
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- `ECR_REPOSITORY`: `ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/devsync-backend`
- `S3_BUCKET_NAME`: `devsync-frontend-prod`
- `CLOUDFRONT_DIST_ID`
- `APPRUNNER_SERVICE_ARN`
- `PRODUCTION_API_URL`: Your App Runner HTTPS URL

### API Documentation

The API documentation is available at `/api/docs` endpoint.
