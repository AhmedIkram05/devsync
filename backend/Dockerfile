# ===== Build Stage =====
# Base images are digest-pinned (patch tag + digest) so a re-push of a tag
# cannot change what we build. python:3.14-slim-bookworm resolved to 3.14.8.
FROM python:3.14.8-slim-bookworm@sha256:48b13b003dda20b16f9442b8475aa05fe21bf6579a8c881db92ffb4d8fd20f83 AS build

# uv is digest-only pinned: no numbered release tag matches the digest that
# ":latest" points at (checked 0.5.10-0.9.0), so the digest is the exact ref.
COPY --from=ghcr.io/astral-sh/uv@sha256:4a1f3666816dafadd20ceb71eac9a7d56d7ef30279f7d64048519ab901ada336 /uv /uv/bin/uv

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
FROM python:3.14.8-slim-bookworm@sha256:48b13b003dda20b16f9442b8475aa05fe21bf6579a8c881db92ffb4d8fd20f83

COPY --from=ghcr.io/astral-sh/uv@sha256:4a1f3666816dafadd20ceb71eac9a7d56d7ef30279f7d64048519ab901ada336 /uv /uv/bin/uv

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
# 79.0.1 (vendored jaraco.context 5.3.0, Trivy HIGH). Then drop the base pip:
# it is unused at runtime (installs go through uv, the app runs from /opt/venv)
# and pip vendors stale msgpack 1.1.2 / urllib3 2.7.0 / setuptools 70.3.0 whose
# CycloneDX manifest (pip/_vendor/bom.cdx.json) the Trivy gate reports as HIGH.
# No pip release ships fixed vendored copies (26.2.1 is current), so the only
# fix is to not ship pip. Target /usr/local explicitly: /opt/venv is on PATH.
RUN /uv/bin/uv pip install --system --break-system-packages --no-cache --upgrade "setuptools>=80" "wheel>=0.46.2" \
 && rm -rf /usr/local/lib/python*/site-packages/pip \
           /usr/local/lib/python*/site-packages/pip-*.dist-info \
           /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.*

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m devsync && \
    chmod +x /app/entrypoint.sh && \
    chown -R devsync:devsync /app

USER devsync

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
