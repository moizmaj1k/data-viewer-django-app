from rams.settings import *  # import all base settings

import os

DEBUG = False

ALLOWED_HOSTS = [
    "142.93.219.70",  # your droplet IP
    "localhost",
]

CSRF_TRUSTED_ORIGINS = [
    "http://142.93.219.70",
    "http://localhost",
]

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "change-me-in-env")

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
