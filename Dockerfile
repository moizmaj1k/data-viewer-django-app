# Dockerfile
FROM python:3.12-slim

# OS deps
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Environment
ENV DJANGO_SETTINGS_MODULE=rams_ssr.settings_prod \
    PYTHONUNBUFFERED=1

# Collect static at build time
RUN python manage.py collectstatic --noinput

# Gunicorn entrypoint
CMD ["gunicorn", "project.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
