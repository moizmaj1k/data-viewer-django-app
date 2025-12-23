from django.urls import path
from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("api/districts/", views.api_districts, name="api_districts"),
    path("api/roads/", views.api_roads, name="api_roads"),           # ?district=CODE
    path("api/assets/", views.api_assets, name="api_assets"),        # ?road_ids=a,b,c&types=all|none|key1,key2
    path("api/selection/snapshot/", views.api_selection_snapshot, name="api_selection_snapshot"),
    path("api/road/<uuid:road_id>/", views.api_road_detail, name="api_road_detail"),
    path("api/asset/<uuid:asset_id>/", views.api_asset_detail, name="api_asset_detail"),
]
