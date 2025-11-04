# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType


class BackEndAuditlog(models.Model):
    uuid = models.UUIDField(primary_key=True)
    table_name = models.CharField(max_length=100)
    operation_type = models.CharField(max_length=100)
    record_id = models.CharField(max_length=36)
    date = models.DateTimeField()
    operation_by = models.ForeignKey('BackEndEnumerator', models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'BACK_END_auditlog'


class BackEndBridge(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    year_of_construction = models.DateField(blank=True, null=True)
    name = models.CharField(max_length=100)
    no_of_spans = models.IntegerField()
    span_length = models.FloatField(blank=True, null=True)
    vertical_clearance = models.FloatField(blank=True, null=True)
    total_deck_width = models.FloatField(blank=True, null=True)
    clear_width = models.FloatField(blank=True, null=True)
    is_crossdrainage = models.BooleanField(db_column='is_crossDrainage')  # Field name made lowercase.
    construction_type = models.CharField(max_length=100, blank=True, null=True)
    parapet = models.CharField(max_length=100, blank=True, null=True)
    abutment_pier_material = models.CharField(max_length=100, blank=True, null=True)
    passage = models.CharField(max_length=100, blank=True, null=True)
    foundation_type = models.CharField(max_length=100, blank=True, null=True)
    type_of_joints = models.CharField(max_length=100, blank=True, null=True)
    is_problem = models.BooleanField()
    severity = models.CharField(max_length=100, blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    lat = models.FloatField(blank=True, null=True)
    lon = models.FloatField(blank=True, null=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey('BackEndEnumerator', models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey('BackEndEnumerator', models.DO_NOTHING, related_name='backendbridge_updated_by_set', blank=True, null=True)
    road = models.ForeignKey('BackEndRoad', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_bridge'


class BackEndCulvert(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    year_of_construction = models.DateField(blank=True, null=True)
    construction_type = models.CharField(max_length=100, blank=True, null=True)
    no_of_cells = models.IntegerField(blank=True, null=True)
    length = models.FloatField(blank=True, null=True)
    width = models.FloatField(blank=True, null=True)
    height = models.FloatField(blank=True, null=True)
    diameter = models.FloatField(blank=True, null=True)
    is_skew = models.BooleanField()
    type_of_apron = models.CharField(max_length=100, blank=True, null=True)
    type_of_wingwalls = models.CharField(max_length=100, blank=True, null=True)
    type_of_headwalls = models.CharField(max_length=100, blank=True, null=True)
    waterway_clearance = models.CharField(max_length=100, blank=True, null=True)
    is_problem = models.BooleanField()
    severity = models.CharField(max_length=100, blank=True, null=True)
    condition = models.CharField(max_length=100, blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    lat = models.FloatField(blank=True, null=True)
    lon = models.FloatField(blank=True, null=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey('BackEndEnumerator', models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey('BackEndEnumerator', models.DO_NOTHING, related_name='backendculvert_updated_by_set', blank=True, null=True)
    road = models.ForeignKey('BackEndRoad', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_culvert'


class BackEndDownloadedrecord(models.Model):
    id = models.BigAutoField(primary_key=True)
    object_id = models.UUIDField()
    downloaded_at = models.DateTimeField()
    content_type = models.ForeignKey(ContentType, models.DO_NOTHING)
    user = models.ForeignKey('BackEndUser', models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'BACK_END_downloadedrecord'
        unique_together = (('user', 'content_type', 'object_id'),)


class BackEndDrainage(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    drain_type = models.CharField(max_length=100, blank=True, null=True)
    brest_wall_type = models.CharField(max_length=100, blank=True, null=True)
    side = models.CharField(max_length=100, blank=True, null=True)
    length_r_s = models.FloatField(blank=True, null=True)
    length_l_s = models.FloatField(blank=True, null=True)
    length_median = models.FloatField(blank=True, null=True)
    width_r_s = models.FloatField(blank=True, null=True)
    width_l_s = models.FloatField(blank=True, null=True)
    does_have_foothpath = models.BooleanField()
    is_drain_choked = models.BooleanField()
    condition = models.CharField(max_length=100, blank=True, null=True)
    start_lat = models.FloatField(blank=True, null=True)
    start_lon = models.FloatField(blank=True, null=True)
    end_lat = models.FloatField(blank=True, null=True)
    end_lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey('BackEndEnumerator', models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey('BackEndEnumerator', models.DO_NOTHING, related_name='backenddrainage_updated_by_set', blank=True, null=True)
    road = models.ForeignKey('BackEndRoad', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_drainage'


class BackEndDykecurbstone(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    type_of_dyke_curb_stone = models.CharField(max_length=100, blank=True, null=True)
    side = models.CharField(max_length=100, blank=True, null=True)
    length_r_s = models.FloatField(blank=True, null=True)
    length_l_s = models.FloatField(blank=True, null=True)
    length_median = models.FloatField(blank=True, null=True)
    height_r_s = models.FloatField(blank=True, null=True)
    height_l_s = models.FloatField(blank=True, null=True)
    height_median = models.FloatField(blank=True, null=True)
    condition = models.CharField(max_length=100, blank=True, null=True)
    start_lat = models.FloatField(blank=True, null=True)
    start_lon = models.FloatField(blank=True, null=True)
    end_lat = models.FloatField(blank=True, null=True)
    end_lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey('BackEndEnumerator', models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey('BackEndEnumerator', models.DO_NOTHING, related_name='backenddykecurbstone_updated_by_set', blank=True, null=True)
    road = models.ForeignKey('BackEndRoad', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_dykecurbstone'


class BackEndEnumerator(models.Model):
    id = models.UUIDField(primary_key=True)
    name = models.CharField(max_length=100)
    phone = models.CharField(unique=True, max_length=100)
    date = models.DateTimeField()
    district = models.CharField(max_length=100)
    user = models.ForeignKey('BackEndUser', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_enumerator'


class BackEndGuardrail(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    type_of_guard_rail = models.CharField(max_length=100, blank=True, null=True)
    side = models.CharField(max_length=100, blank=True, null=True)
    length_r_s = models.FloatField(blank=True, null=True)
    length_l_s = models.FloatField(blank=True, null=True)
    length_median = models.FloatField(blank=True, null=True)
    condition = models.CharField(max_length=100, blank=True, null=True)
    start_lat = models.FloatField(blank=True, null=True)
    start_lon = models.FloatField(blank=True, null=True)
    end_lat = models.FloatField(blank=True, null=True)
    end_lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, related_name='backendguardrail_updated_by_set', blank=True, null=True)
    road = models.ForeignKey('BackEndRoad', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_guardrail'


class BackEndInterchange(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    name = models.CharField(max_length=100, blank=True, null=True)
    type_of_interchange = models.CharField(max_length=100)
    condition = models.CharField(max_length=100, blank=True, null=True)
    lat = models.FloatField(blank=True, null=True)
    lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, related_name='backendinterchange_updated_by_set', blank=True, null=True)
    road = models.ForeignKey('BackEndRoad', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_interchange'


class BackEndLightpole(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    type_of_light_pole = models.CharField(max_length=100, blank=True, null=True)
    side = models.CharField(max_length=100, blank=True, null=True)
    is_power_source_solar = models.BooleanField()
    is_solar_panel_inplace = models.BooleanField()
    is_battery_box_inplace = models.BooleanField()
    condition = models.CharField(max_length=100, blank=True, null=True)
    lat = models.FloatField(blank=True, null=True)
    lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, related_name='backendlightpole_updated_by_set', blank=True, null=True)
    road = models.ForeignKey('BackEndRoad', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_lightpole'


class BackEndPatchcondition(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    condition = models.CharField(max_length=100, blank=True, null=True)
    end_lat = models.FloatField(blank=True, null=True)
    end_lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, related_name='backendpatchcondition_updated_by_set', blank=True, null=True)
    road = models.ForeignKey('BackEndRoad', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_patchcondition'


class BackEndRetainingwall(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    type_of_retaining_wall = models.CharField(max_length=100, blank=True, null=True)
    has_paraphet_wall = models.BooleanField()
    paraphet_wall_type = models.CharField(max_length=100, blank=True, null=True)
    side = models.CharField(max_length=100, blank=True, null=True)
    length_r_s = models.FloatField(blank=True, null=True)
    length_l_s = models.FloatField(blank=True, null=True)
    top_width_r_s = models.FloatField(blank=True, null=True)
    top_width_l_s = models.FloatField(blank=True, null=True)
    height_r_s = models.FloatField(blank=True, null=True)
    height_l_s = models.FloatField(blank=True, null=True)
    condition = models.CharField(max_length=100, blank=True, null=True)
    start_lat = models.FloatField(blank=True, null=True)
    start_lon = models.FloatField(blank=True, null=True)
    end_lat = models.FloatField(blank=True, null=True)
    end_lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, related_name='backendretainingwall_updated_by_set', blank=True, null=True)
    road = models.ForeignKey('BackEndRoad', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_retainingwall'


class BackEndRoad(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    name = models.CharField(max_length=100, blank=True, null=True)
    start_rd = models.CharField(max_length=10, blank=True, null=True)
    end_rd = models.CharField(max_length=10, blank=True, null=True)
    road_length = models.FloatField(blank=True, null=True)
    carriageway_type = models.CharField(max_length=100, blank=True, null=True)
    no_of_lanes = models.CharField(max_length=100, blank=True, null=True)
    traffic_flow_direction = models.CharField(max_length=100, blank=True, null=True)
    carriageway_width = models.FloatField(blank=True, null=True)
    shoulder_width_r = models.FloatField(db_column='shoulder_width_R', blank=True, null=True)  # Field name made lowercase.
    shoulder_width_l = models.FloatField(db_column='shoulder_width_L', blank=True, null=True)  # Field name made lowercase.
    has_cateye = models.BooleanField()
    has_lane_marking = models.BooleanField()
    right_of_way = models.FloatField(blank=True, null=True)
    year_of_construction = models.DateField(blank=True, null=True)
    executing_agency = models.CharField(max_length=100, blank=True, null=True)
    road_class = models.CharField(max_length=100, blank=True, null=True)
    pavement_type = models.CharField(max_length=100, blank=True, null=True)
    shoulder_type = models.CharField(max_length=100, blank=True, null=True)
    annual_daily_traffic = models.IntegerField(blank=True, null=True)
    design_speed = models.FloatField(blank=True, null=True)
    median_type = models.CharField(max_length=100, blank=True, null=True)
    administrative_jurisdiction = models.CharField(max_length=100, blank=True, null=True)
    feeding_population = models.IntegerField(blank=True, null=True)
    year_last_repaired = models.DateField(blank=True, null=True)
    type_last_repair = models.CharField(max_length=100)
    usability = models.CharField(max_length=100, blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    start_lat = models.FloatField(blank=True, null=True)
    start_lon = models.FloatField(blank=True, null=True)
    end_lat = models.FloatField(blank=True, null=True)
    end_lon = models.FloatField(blank=True, null=True)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, related_name='backendroad_updated_by_set', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_road'


class BackEndRoadcrossing(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    year_of_construction = models.DateField(blank=True, null=True)
    type_of_road_crossing = models.CharField(max_length=100, blank=True, null=True)
    name_of_road_crossing_through = models.CharField(max_length=100, blank=True, null=True)
    length = models.FloatField(blank=True, null=True)
    width = models.FloatField(blank=True, null=True)
    height = models.FloatField(blank=True, null=True)
    width_carriageway = models.FloatField(blank=True, null=True)
    is_skew = models.BooleanField()
    type_of_headwalls = models.CharField(max_length=100, blank=True, null=True)
    has_drainage_inside_crossing = models.BooleanField()
    has_lighting_system = models.BooleanField()
    is_lighting_system_working = models.BooleanField()
    is_problem = models.BooleanField()
    severity = models.CharField(max_length=100, blank=True, null=True)
    condition = models.CharField(max_length=100, blank=True, null=True)
    lat = models.FloatField(blank=True, null=True)
    lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, blank=True, null=True)
    road = models.ForeignKey(BackEndRoad, models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, related_name='backendroadcrossing_updated_by_set', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_roadcrossing'


class BackEndSignboard(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    type_of_sign_board = models.CharField(max_length=100, blank=True, null=True)
    side = models.CharField(max_length=100, blank=True, null=True)
    condition = models.CharField(max_length=100, blank=True, null=True)
    lat = models.FloatField(blank=True, null=True)
    lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, blank=True, null=True)
    road = models.ForeignKey(BackEndRoad, models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, related_name='backendsignboard_updated_by_set', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_signboard'


class BackEndToll(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    type_of_toll = models.CharField(max_length=100, blank=True, null=True)
    no_of_booths = models.IntegerField()
    condition = models.CharField(max_length=100, blank=True, null=True)
    lat = models.FloatField(blank=True, null=True)
    lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, blank=True, null=True)
    road = models.ForeignKey(BackEndRoad, models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, related_name='backendtoll_updated_by_set', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_toll'


class BackEndTunnel(models.Model):
    id = models.UUIDField(primary_key=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    year_of_construction = models.DateField(blank=True, null=True)
    type_of_tunnel = models.CharField(max_length=100, blank=True, null=True)
    type_of_lining = models.CharField(max_length=100, blank=True, null=True)
    shape_of_tunnel = models.CharField(max_length=100, blank=True, null=True)
    no_of_tubes = models.IntegerField(blank=True, null=True)
    has_seperate_approach_road = models.BooleanField()
    approach_road_length_entry_portal = models.FloatField(blank=True, null=True)
    approach_road_length_exit_portal = models.FloatField(blank=True, null=True)
    has_lighting_system = models.BooleanField()
    is_lighting_system_working = models.BooleanField()
    has_scada = models.BooleanField()
    is_scada_working = models.BooleanField()
    has_control_room = models.BooleanField()
    is_control_room_working = models.BooleanField()
    has_drainage_inside_tunnel = models.BooleanField()
    length = models.FloatField(blank=True, null=True)
    width = models.FloatField(blank=True, null=True)
    height = models.FloatField(blank=True, null=True)
    width_carriageway = models.FloatField(blank=True, null=True)
    type_of_portal = models.CharField(max_length=100, blank=True, null=True)
    is_problem = models.BooleanField()
    severity = models.CharField(max_length=100, blank=True, null=True)
    condition = models.CharField(max_length=100, blank=True, null=True)
    start_lat = models.FloatField(blank=True, null=True)
    start_lon = models.FloatField(blank=True, null=True)
    end_lat = models.FloatField(blank=True, null=True)
    end_lon = models.FloatField(blank=True, null=True)
    remarks = models.TextField(blank=True, null=True)
    pics = models.JSONField()
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    created_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, blank=True, null=True)
    road = models.ForeignKey(BackEndRoad, models.DO_NOTHING, blank=True, null=True)
    updated_by = models.ForeignKey(BackEndEnumerator, models.DO_NOTHING, related_name='backendtunnel_updated_by_set', blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'BACK_END_tunnel'


class BackEndUser(models.Model):
    password = models.CharField(max_length=128)
    last_login = models.DateTimeField(blank=True, null=True)
    is_superuser = models.BooleanField()
    username = models.CharField(unique=True, max_length=150)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    is_staff = models.BooleanField()
    is_active = models.BooleanField()
    date_joined = models.DateTimeField()
    id = models.UUIDField(primary_key=True)
    designation = models.CharField(max_length=100, blank=True, null=True)
    email = models.CharField(unique=True, max_length=254)

    class Meta:
        managed = False
        db_table = 'BACK_END_user'


class BackEndUserGroups(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(BackEndUser, models.DO_NOTHING)
    group = models.ForeignKey(Group, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'BACK_END_user_groups'
        unique_together = (('user', 'group'),)


class BackEndUserUserPermissions(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(BackEndUser, models.DO_NOTHING)
    permission = models.ForeignKey(Permission, models.DO_NOTHING)

    class Meta:
        managed = False
        db_table = 'BACK_END_user_user_permissions'
        unique_together = (('user', 'permission'),)
