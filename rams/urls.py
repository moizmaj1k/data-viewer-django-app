# from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # path("admin/", admin.site.urls),
    path("", include("core.urls")),  # delegate all app routes to core.urls
    path("__reload__/", include("django_browser_reload.urls")),
]

# Dev static (optional; handy if you serve extra files in DEBUG)
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)