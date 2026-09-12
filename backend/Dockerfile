# ===== Build Stage =====
FROM python:3.11-slim-bookworm AS build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install build dependencies for psycopg2
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
 && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt

# ===== Runtime Stage =====
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=src.app:create_app \
    FLASK_ENV=production \
    PYTHONPATH=/app

WORKDIR /app

# Install only runtime system deps (no build tools)
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    libpq5 \
 && rm -rf /var/lib/apt/lists/*

# Copy pre-built packages from build stage
COPY --from=build /install /usr/local

# Replace base-image setuptools/wheel in place: the COPY overlay leaves the
# base's setuptools 79.0.1 (vendored jaraco.context 5.3.0, Trivy HIGH) behind.
RUN pip install --no-cache-dir --upgrade "setuptools>=80" "wheel>=0.46.2"

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m devsync && \
    chmod +x /app/entrypoint.sh && \
    chown -R devsync:devsync /app

USER devsync

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
