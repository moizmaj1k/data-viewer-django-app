import os
from django.http import JsonResponse, Http404
from django.views.decorators.http import require_http_methods
import json
from django.shortcuts import render
from django.db.models import CharField
from django.db.models.functions import Cast
from .models import (
    BackEndRoad,
    BackEndBridge, BackEndCulvert, BackEndSignboard, BackEndToll, BackEndLightpole,
    BackEndInterchange, BackEndRoadcrossing,
    BackEndDrainage, BackEndRetainingwall, BackEndGuardrail, BackEndDykecurbstone,
    BackEndTunnel, BackEndPatchcondition,
)
from datetime import date, datetime

# -----------------------
# Existing constants
# -----------------------
DISTRICT_CHOICES = [
    ('100ABT','Abbottabad'), ('200BAJ','Bajaur'), ('300BAN','Bannu'),
    ('400BAT','Batagram'), ('500BUN','Buner'), ('600CHA','Charsadda'),
    ('700CHL','Chitral Lower'), ('800CHU','Chitral Upper'), ('900DIK','D. I. Khan'),
    ('010HAN','Hangu'), ('020HAR','Haripur'), ('030KAR','Karak'),
    ('040KHY','Khyber'), ('050KOH','Kohat'), ('060KOL','Kohistan Lower'),
    ('070KOU','Kohistan Upper'), ('080KPK','Kolai Palas Kohistan'), ('090KUR','Kurram'),
    ('001LAK','Lakki Marwat'), ('002LOD','Lower Dir'), ('003MAL','Malakand'),
    ('004MAN','Mansehra'), ('005MAR','Mardan'), ('006MOH','Mohmand'),
    ('007NWA','North Waziristan'), ('008NOW','Nowshera'), ('009ORA','Orakzai'),
    ('110PES','Peshawar'), ('210SHA','Shangla'), ('310SWA','South Waziristan'),
    ('410SWI','Swabi'), ('510SWT','Swat'), ('610TAN','Tank'),
    ('710TOG','Tor Ghar'), ('810UPD','Upper Dir'),
]

# Registry of asset types (kept from your code; we’ll re-use it)
POINT_ASSETS = {
    'bridge':        {'model': BackEndBridge,       'label': 'bridge',        'lat': 'lat',       'lon': 'lon'},
    'culvert':       {'model': BackEndCulvert,      'label': 'culvert',       'lat': 'lat',       'lon': 'lon'},
    'signboard':     {'model': BackEndSignboard,    'label': 'signboard',     'lat': 'lat',       'lon': 'lon'},
    'toll':          {'model': BackEndToll,         'label': 'toll',          'lat': 'lat',       'lon': 'lon'},
    'lightpole':     {'model': BackEndLightpole,    'label': 'lightpole',     'lat': 'lat',       'lon': 'lon'},
    'interchange':   {'model': BackEndInterchange,  'label': 'interchange',   'lat': 'lat',       'lon': 'lon'},
    'roadcrossing':  {'model': BackEndRoadcrossing, 'label': 'roadcrossing',  'lat': 'lat',       'lon': 'lon'},
    'patchcondition':{'model': BackEndPatchcondition,'label': 'patchcondition','lat': 'end_lat',  'lon': 'end_lon'},
}
LINE_ASSETS = {
    'drainage':      {'model': BackEndDrainage,     'label': 'drainage',
                      'start_lat': 'start_lat', 'start_lon': 'start_lon',
                      'end_lat': 'end_lat',     'end_lon': 'end_lon'},
    'retainingwall': {'model': BackEndRetainingwall,'label': 'retainingwall',
                      'start_lat': 'start_lat', 'start_lon': 'start_lon',
                      'end_lat': 'end_lat',     'end_lon': 'end_lon'},
    'guardrail':     {'model': BackEndGuardrail,    'label': 'guardrail',
                      'start_lat': 'start_lat', 'start_lon': 'start_lon',
                      'end_lat': 'end_lat',     'end_lon': 'end_lon'},
    'dykecurbstone': {'model': BackEndDykecurbstone,'label': 'dykecurbstone',
                      'start_lat': 'start_lat', 'start_lon': 'start_lon',
                      'end_lat': 'end_lat',     'end_lon': 'end_lon'},
    'tunnel':        {'model': BackEndTunnel,       'label': 'tunnel',
                      'start_lat': 'start_lat', 'start_lon': 'start_lon',
                      'end_lat': 'end_lat',     'end_lon': 'end_lon'},
}

ASSET_REG = {}

# A flat list for dynamic scanning:
ALL_ASSET_MODELS = (
    [(k, 'point', v['model']) for k, v in POINT_ASSETS.items()] +
    [(k, 'line',  v['model']) for k, v in LINE_ASSETS.items()]
)

ASSET_REG.update({k: ("point", v["model"]) for k, v in POINT_ASSETS.items()})
ASSET_REG.update({k: ("line",  v["model"]) for k, v in LINE_ASSETS.items()})

# -----------------------
# Helpers
# -----------------------
def _iso(val):
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    return val

def safe_serialize(obj):
    """
    Dump *all* concrete fields (including FK IDs) so the FE has the entire row.
    Skips reverse and M2M relations; ISO-formats dates.
    """
    data = {}
    for f in obj._meta.get_fields():
        # Skip reverse relations / M2M
        if f.many_to_many or f.one_to_many or getattr(f, 'auto_created', False):
            continue
        # Only actual DB columns
        if not hasattr(f, 'attname'):
            continue

        # For ForeignKey, 'attname' is '<field>_id'
        attname = f.attname
        try:
            val = getattr(obj, attname)
        except Exception:
            # If direct attname failed, fallback to field name
            val = getattr(obj, f.name, None)

        data[f.name] = _iso(val)
    # Always include a stringified 'id' if present
    if hasattr(obj, 'id'):
        data['id'] = str(getattr(obj, 'id'))
    return data

def find_asset_record(asset_id):
    """
    Try each asset model until one returns the row.
    Returns (asset_type_key, kind, instance) or (None, None, None).
    """
    for type_key, kind, Model in ALL_ASSET_MODELS:
        try:
            inst = Model.objects.get(id=asset_id)
            return type_key, kind, inst
        except Model.DoesNotExist:
            continue
    return None, None, None

def model_from_type_or_table(type_key: str | None, table: str | None):
    """
    Resolve (kind, type_key, Model) from either an asset type key or a DB table name.
    Returns (kind, type_key, Model) or (None, None, None).
    """
    if type_key and type_key in ASSET_REG:
        kind, Model = ASSET_REG[type_key]
        return kind, type_key, Model

    if table:
        for k, (kind, Model) in ASSET_REG.items():
            if Model._meta.db_table == table:
                return kind, k, Model

    return None, None, None

# -----------------------
# Views
# -----------------------

def dashboard(request):
    # If you need asset type list in the template:
    asset_types = [(v.get('label', k.title()) if isinstance(v, dict) else k.title(), k) for k, v in {**POINT_ASSETS, **LINE_ASSETS}.items()]
    return render(request, "core/dashboard.html", {"asset_types": asset_types, "GOOGLE_TILES_KEY": os.getenv("GOOGLE_TILES_KEY", "")})

def api_districts(request):
    return JsonResponse({"districts": [{'code': c, 'name': n} for c, n in DISTRICT_CHOICES]})

def api_roads(request):
    district = request.GET.get("district", "").strip()
    qs = BackEndRoad.objects.all()
    if district:
        qs = qs.filter(district=district)

    qs = qs.annotate(id_str=Cast("id", output_field=CharField()))
    roads = list(qs.values("id_str", "name", "start_lat", "start_lon", "end_lat", "end_lon", "road_length"))

    payload = [
        {
            "id": r["id_str"],
            "name": r.get("name"),
            "start_lat": r.get("start_lat"),
            "start_lon": r.get("start_lon"),
            "end_lat": r.get("end_lat"),
            "end_lon": r.get("end_lon"),
            "road_length": r.get("road_length"),
        }
        for r in roads
    ]
    return JsonResponse({"roads": payload})

def api_assets(request):
    """
    GET /api/assets/?road_ids=a,b,c&types=all|none|key1,key2
    Returns: { assets: [ ... ] }
    Each asset now includes: id, road_id, kind, geometry, label (type key).
    """
    road_ids = (request.GET.get('road_ids') or '').split(',')
    road_ids = [r.strip() for r in road_ids if r.strip()]
    types_param = (request.GET.get('types') or 'none').strip().lower()

    if not road_ids or types_param == 'none':
        return JsonResponse({'assets': []})

    if types_param == 'all':
        selected_point_types = list(POINT_ASSETS.keys())
        selected_line_types = list(LINE_ASSETS.keys())
    else:
        keys = [k.strip() for k in types_param.split(',') if k.strip()]
        selected_point_types = [k for k in keys if k in POINT_ASSETS]
        selected_line_types = [k for k in keys if k in LINE_ASSETS]

    assets_out = []

    # Points
    for k in selected_point_types:
        meta = POINT_ASSETS[k]
        Model = meta['model']
        latf, lonf = meta['lat'], meta['lon']
        qs = Model.objects.filter(road_id__in=road_ids).values('id', 'road_id', latf, lonf)
        for row in qs:
            lat = row.get(latf)
            lon = row.get(lonf)
            if lat is None or lon is None:
                continue
            assets_out.append({
                'id': str(row['id']),
                'road_id': str(row['road_id']) if row.get('road_id') else None,
                'kind': 'point',
                'lat': float(lat),
                'lon': float(lon),
                'label': k,
            })

    # Lines
    for k in selected_line_types:
        meta = LINE_ASSETS[k]
        Model = meta['model']
        sLa, sLo = meta['start_lat'], meta['start_lon']
        eLa, eLo = meta['end_lat'], meta['end_lon']
        qs = Model.objects.filter(road_id__in=road_ids).values('id', 'road_id', sLa, sLo, eLa, eLo)
        for row in qs:
            s_lat, s_lon = row.get(sLa), row.get(sLo)
            e_lat, e_lon = row.get(eLa), row.get(eLo)
            if None in (s_lat, s_lon, e_lat, e_lon):
                continue
            assets_out.append({
                'id': str(row['id']),
                'road_id': str(row['road_id']) if row.get('road_id') else None,
                'kind': 'line',
                'start_lat': float(s_lat),
                'start_lon': float(s_lon),
                'end_lat': float(e_lat),
                'end_lon': float(e_lon),
                'label': k,
            })

    return JsonResponse({'assets': assets_out})

@require_http_methods(["GET", "POST"])
def api_road_detail(request, road_id):
    """
    GET /api/road/<uuid>/
      -> { road, counts }                      (default: counts only)
    GET /api/road/<uuid>/?include=counts
      -> { road, counts }                      (explicit counts-only)
    GET /api/road/<uuid>/?include=assets
      -> { road, counts, assets:[.] }        (heavy)

    POST /api/road/<uuid>/
      JSON body with partial fields to update, e.g.:
      { "remarks": "...", "start_lat": 33.123, "start_lon": 72.456 }
    """
    try:
        road = BackEndRoad.objects.get(id=road_id)
    except BackEndRoad.DoesNotExist:
        raise Http404("Road not found")

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        allowed = {f.name for f in BackEndRoad._meta.fields if f.editable}
        updated_fields = []

        for key, val in payload.items():
            if key not in allowed:
                continue
            setattr(road, key, val)
            updated_fields.append(key)

        if updated_fields:
            road.save(update_fields=updated_fields)

        return JsonResponse({"ok": True, "updated": updated_fields})

    road_data = safe_serialize(road)

    include = (request.GET.get('include') or '').lower().split(',')
    include = [x.strip() for x in include if x.strip()]
    include_assets = 'assets' in include
    include_counts = ('counts' in include) or (not include)  # default: counts

    out = {"road": road_data}

    # counts (fast). Keep as-is; this is already light.
    if include_counts:
      counts = {}
      for type_key, meta in POINT_ASSETS.items():
          counts[type_key] = meta['model'].objects.filter(road_id=road_id).count()
      for type_key, meta in LINE_ASSETS.items():
          counts[type_key] = meta['model'].objects.filter(road_id=road_id).count()
      out["counts"] = counts

    # heavy assets only when explicitly asked
    if include_assets:
        assets_full = []
        for type_key, meta in POINT_ASSETS.items():
            Model = meta['model']
            for a in Model.objects.filter(road_id=road_id):
                rec = safe_serialize(a)
                rec.update({"kind": "point", "type": type_key})
                assets_full.append(rec)
        for type_key, meta in LINE_ASSETS.items():
            Model = meta['model']
            for a in Model.objects.filter(road_id=road_id):
                rec = safe_serialize(a)
                rec.update({"kind": "line", "type": type_key})
                assets_full.append(rec)
        out["assets"] = assets_full

    return JsonResponse(out)

@require_http_methods(["GET", "POST"])
def api_asset_detail(request, asset_id):
    """
    GET /api/asset/<uuid>/?type=<asset_type_key>&table=<db_table>
      - Provide either `type` OR `table` to avoid scanning all models.
      - If neither is provided, we fall back to the existing scan (find_asset_record).
    Response stays identical to your current shape.
    """

    if request.method == "POST":
        try:
            payload = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON"}, status=400)

        type_key = (request.GET.get("type") or "").strip().lower() or None
        table    = (request.GET.get("table") or "").strip() or None

        kind = None
        resolved_type_key = type_key
        Model = None
        obj = None

        if type_key:
            # model_from_type_or_table -> (kind, type_key, Model)
            kind, resolved_type_key, Model = model_from_type_or_table(type_key, None)
            if Model is None:
                return JsonResponse({"error": "Unknown type"}, status=400)
            try:
                obj = Model.objects.get(id=asset_id)
            except Model.DoesNotExist:
                raise Http404("Asset not found")
        elif table:
            kind, resolved_type_key, Model = model_from_type_or_table(None, table)
            if Model is None:
                return JsonResponse({"error": "Unknown table"}, status=400)
            try:
                obj = Model.objects.get(id=asset_id)
            except Model.DoesNotExist:
                raise Http404("Asset not found")
        else:
            # find_asset_record -> (type_key, kind, instance)
            resolved_type_key, kind, obj = find_asset_record(asset_id)
            if obj is None:
                raise Http404("Asset not found")
            Model = obj.__class__

        allowed = {f.name for f in Model._meta.fields if f.editable}
        updated_fields = []

        for key, val in payload.items():
            if key not in allowed:
                continue
            setattr(obj, key, val)
            updated_fields.append(key)

        if updated_fields:
            obj.save(update_fields=updated_fields)

        return JsonResponse({"ok": True, "updated": updated_fields})
        
    type_param  = (request.GET.get("type") or "").strip().lower()
    table_param = (request.GET.get("table") or "").strip()

    # Fast-path: resolve model from type/table if provided
    kind, type_key, Model = model_from_type_or_table(type_param or None, table_param or None)

    inst = None
    if Model:
        try:
            inst = Model.objects.get(id=asset_id)
        except Model.DoesNotExist:
            raise Http404("Asset not found")
    else:
        # Fallback to the existing cross-table scan
        type_key, kind, inst = find_asset_record(asset_id)
        if not inst:
            raise Http404("Asset not found")

    data = safe_serialize(inst)

    # Normalize road_id
    road_id_val = None
    try:
        road_id_val = str(getattr(inst, 'road_id', None) or getattr(inst, 'road_id_id', None) or getattr(inst.road, 'id', None))
    except Exception:
        pass

    out = {
        "asset": {
            **data,
            "kind": kind,
            "type": type_key,
            "model": inst._meta.db_table,
            "road_id": road_id_val,
        }
    }
    return JsonResponse(out)
