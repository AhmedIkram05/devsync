FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=src.app:create_app
ENV FLASK_ENV=production
ENV PYTHONPATH=/app

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd -m devsync && \
    chmod +x /app/entrypoint.sh && \
    chown -R devsync:devsync /app

USER devsync

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
