# project/settings_prod.py
from .settings import *

DEBUG = False

ALLOWED_HOSTS = ["your-domain.com", "www.your-domain.com", "server-ip"]

CSRF_TRUSTED_ORIGINS = [
    "https://your-domain.com",
    "https://www.your-domain.com",
]

# Use env vars for secrets & DB
import os

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "change-me")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME"),
        "USER": os.environ.get("DB_USER"),
        "PASSWORD": os.environ.get("DB_PASSWORD"),
        "HOST": os.environ.get("DB_HOST"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
