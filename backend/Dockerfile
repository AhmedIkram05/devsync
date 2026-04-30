FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system deps required for some packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
 && rm -rf /var/lib/apt/lists/*

# Copy and install backend Python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --upgrade pip && pip install --no-cache-dir -r backend/requirements.txt

# Copy the backend source
COPY backend ./backend

WORKDIR /app/backend

# Ensure Python path includes backend package
ENV PYTHONPATH=/app/backend
ENV FLASK_ENV=production

EXPOSE 8000

# Run Gunicorn using the wsgi module which exposes `app`
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--worker-class", "geventwebsocket.gunicorn.workers.GeventWebSocketWorker", "src.wsgi:app"]
# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV FLASK_APP=src/app.py
ENV FLASK_ENV=production

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Setup non-root user and entrypoint permissions
RUN useradd -m devsync && \
    chmod +x /app/entrypoint.sh && \
    chown -R devsync:devsync /app

USER devsync

# Expose the port the app runs on
EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
