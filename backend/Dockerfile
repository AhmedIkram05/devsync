# ===== Build Stage =====
FROM python:3.11-slim-bookworm AS build

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uv/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# Install build dependencies for psycopg2
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies into an isolated venv (bind mount keeps this layer
# cached until requirements.txt changes; uv cache mount speeds resolves)
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=requirements.txt,target=requirements.txt \
    /uv/bin/uv venv /opt/venv && \
    VIRTUAL_ENV=/opt/venv /uv/bin/uv pip install -r requirements.txt

# ===== Runtime Stage =====
FROM python:3.11-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uv/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=src.app:create_app \
    FLASK_ENV=production \
    PYTHONPATH=/app \
    PATH="/opt/venv/bin:$PATH" \
    UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# Install only runtime system deps (no build tools)
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    libpq5 \
 && rm -rf /var/lib/apt/lists/*

# Copy the venv fresh (no stale dist-info, unlike a /usr/local overlay)
COPY --from=build /opt/venv /opt/venv

# Replace base-image setuptools/wheel in place: the base ships setuptools
# 79.0.1 (vendored jaraco.context 5.3.0, Trivy HIGH).
RUN /uv/bin/uv pip install --system --break-system-packages --no-cache --upgrade "setuptools>=80" "wheel>=0.46.2"

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m devsync && \
    chmod +x /app/entrypoint.sh && \
    chown -R devsync:devsync /app

USER devsync

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
