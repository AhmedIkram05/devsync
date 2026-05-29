# ===== Build Stage =====
FROM python:3.11-slim AS build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install build dependencies for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt

# ===== Runtime Stage =====
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=src.app:create_app \
    FLASK_ENV=production \
    PYTHONPATH=/app

WORKDIR /app

# Install only runtime system deps (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
 && rm -rf /var/lib/apt/lists/*

# Copy pre-built packages from build stage
COPY --from=build /install /usr/local

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m devsync && \
    chmod +x /app/entrypoint.sh && \
    chown -R devsync:devsync /app

USER devsync

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
