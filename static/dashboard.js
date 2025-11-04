(function () {
  let SELECTED_ROAD_ID = null;
  
  // ---------- Constants ----------
  const GOOGLE_KEY = "{{ GOOGLE_TILES_KEY }}"; // Google *tiles* key
  const DRAWER_W = 420; // keep in sync with CSS --drawer-w

  // District code -> name (value=value code, label=readable)
  const DISTRICT_CHOICES = [
    ['100ABT','Abbottabad'], ['200BAJ','Bajaur'], ['300BAN','Bannu'],
    ['400BAT','Batagram'], ['500BUN','Buner'], ['600CHA','Charsadda'],
    ['700CHL','Chitral Lower'], ['800CHU','Chitral Upper'], ['900DIK','D. I. Khan'],
    ['010HAN','Hangu'], ['020HAR','Haripur'], ['030KAR','Karak'],
    ['040KHY','Khyber'], ['050KOH','Kohat'], ['060KOL','Kohistan Lower'],
    ['070KOU','Kohistan Upper'], ['080KPK','Kolai Palas Kohistan'], ['090KUR','Kurram'],
    ['001LAK','Lakki Marwat'], ['002LOD','Lower Dir'], ['003MAL','Malakand'],
    ['004MAN','Mansehra'], ['005MAR','Mardan'], ['006MOH','Mohmand'],
    ['007NWA','North Waziristan'], ['008NOW','Nowshera'], ['009ORA','Orakzai'],
    ['110PES','Peshawar'], ['210SHA','Shangla'], ['310SWA','South Waziristan'],
    ['410SWI','Swabi'], ['510SWT','Swat'], ['610TAN','Tank'],
    ['710TOG','Tor Ghar'], ['810UPD','Upper Dir'],
  ];

  // Asset keys that exist in DB (tables)
  const ASSET_KEYS = [
    // point-like
    {key:'bridge',        label:'Bridges',          type:'point'},
    {key:'culvert',       label:'Culverts',         type:'point'},
    {key:'signboard',     label:'Sign Boards',      type:'point'},
    {key:'toll',          label:'Tolls',            type:'point'},
    {key:'lightpole',     label:'Light Poles',      type:'point'},
    {key:'interchange',   label:'Interchanges',     type:'point'},
    {key:'roadcrossing',  label:'Road Crossings',   type:'point'},

    // line-like (have start+end variants)
    {key:'drainage',      label:'Drainage',         type:'line'},
    {key:'retainingwall', label:'Retaining Walls',  type:'line'},
    {key:'guardrail',     label:'Guard Rails',      type:'line'},
    {key:'dykecurbstone', label:'Dyke/Curb Stone',  type:'line'},
    {key:'tunnel',        label:'Tunnels',          type:'line'},

    // PatchCondition has end only -> treat as point
    {key:'patchcondition',label:'Patch Condition',  type:'point'},
  ];

  // ---------- DOM ----------
  const form          = document.getElementById("filters-form");
  const districtSel   = document.getElementById("filter-district");

  // Roads multi-select
  const roadsSelect   = document.getElementById("roads-select");
  const roadsTrigger  = roadsSelect.querySelector(".ms-trigger");
  const roadsPanel    = roadsSelect.querySelector(".ms-panel");
  const roadsSearch   = document.getElementById("roads-search");
  const roadsList     = document.getElementById("roads-list");
  const roadsSelectAllBtn = document.getElementById("roads-select-all");
  const roadsClearAllBtn  = document.getElementById("roads-clear-all");

  // Assets multi-select
  const assetsSelect  = document.getElementById("assets-select");
  const assetsTrigger = assetsSelect.querySelector(".ms-trigger");
  const assetsPanel   = assetsSelect.querySelector(".ms-panel");
  const assetsList    = document.getElementById("assets-list");
  const assetsSelectAllBtn = document.getElementById("assets-select-all");
  const assetsClearAllBtn  = document.getElementById("assets-clear-all");

  const btnApply      = document.getElementById("btn-apply");
  const btnReset      = document.getElementById("btn-reset");

  const btnFilters    = document.getElementById("btn-filters");
  const filtersPanel  = document.getElementById("filters-panel");

  const basemapButtons = document.querySelectorAll('[data-basemap]');

  // ---------- Map (OpenLayers) ----------
  const baseLayers = {
    google_sat: new ol.layer.Tile({
      visible: true,
      source: new ol.source.XYZ({
        attributions: '© Google',
        url: `https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
        crossOrigin: "anonymous",
        maxZoom: 20
      })
    }),
    google_hybrid: new ol.layer.Tile({
      visible: false,
      source: new ol.source.XYZ({
        attributions: '© Google',
        url: `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
        crossOrigin: "anonymous",
        maxZoom: 20
      })
    }),
    google_standard: new ol.layer.Tile({
      visible: false,
      source: new ol.source.XYZ({
        attributions: '© Google',
        url: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
        crossOrigin: "anonymous",
        maxZoom: 20
      })
    }),
    google_terrain: new ol.layer.Tile({
      visible: false,
      source: new ol.source.XYZ({
        attributions: '© Google',
        url: `https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&key=${GOOGLE_KEY}`,
        crossOrigin: "anonymous",
        maxZoom: 20
      })
    }),
    esri_world: new ol.layer.Tile({
      visible: false,
      source: new ol.source.XYZ({
        attributions: "Esri World Imagery",
        url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        crossOrigin: "anonymous",
        maxZoom: 19
      })
    }),
    osm: new ol.layer.Tile({ visible: false, source: new ol.source.OSM() })
  };

  // Points and lines kept separate for styling/fit
  const pointsSource = new ol.source.Vector();
  const pointsLayer  = new ol.layer.Vector({ source: pointsSource, declutter: true, zIndex: 20 });
  const linesSource  = new ol.source.Vector();
  const linesLayer   = new ol.layer.Vector({ source: linesSource,  declutter: true, zIndex: 10 });

  const map = new ol.Map({
    target: "map",
    layers: [
      baseLayers.google_sat, baseLayers.google_hybrid, baseLayers.google_standard,
      baseLayers.google_terrain, baseLayers.esri_world, baseLayers.osm,
      linesLayer, pointsLayer
    ],
    view: new ol.View({ center: ol.proj.fromLonLat([71.5, 34.0]), zoom: 7 })
  });
  map.addControl(new ol.control.ScaleLine());
  map.addControl(new ol.control.ZoomSlider());
  map.addControl(new ol.control.Rotate());

  // ---------- Drawer helpers (map resize only) ----------
  function updateMapSizeSoon(delay = 270) { setTimeout(() => map.updateSize(), delay); }
 

  // cursor feedback on hover
  map.on('pointermove', (e) => map.getTargetElement().style.cursor =
    map.hasFeatureAtPixel(e.pixel, {hitTolerance: 5}) ? 'pointer' : '');

  // ---- Styling helpers for consistent, readable labels
  function makeText(text, { offsetY = -14, fontSize = 12, color = '#111' } = {}) {
    return new ol.style.Text({
      text: text ?? '',
      font: `600 ${fontSize}px system-ui, Segoe UI, Roboto, Arial, sans-serif`,
      offsetY,
      fill: new ol.style.Fill({ color }),
      stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.95)', width: 3 }),
    });
  }
  function dot(color, radius = 6) {
    return new ol.style.Circle({
      radius,
      fill: new ol.style.Fill({ color }),
      stroke: new ol.style.Stroke({ color: '#111', width: 1 }),
    });
  }

  // ----- Neon helpers (teal ring + soft glow behind), keep base style intact
  const NEON = {
    ring:   '#22d3ee',                // teal ring
    glowA:  'rgba(34,211,238,0.35)',  // for thick soft line glow
    glowB:  'rgba(34,211,238,0.18)',  // for softer outer glow
    dimPt:  'rgba(124,58,237,0.18)',  // purple (point) dim
    dimLn:  'rgba(251,146,60,0.20)',  // orange (line) dim
    dimTxt: 'rgba(0,0,0,0.35)',       // label dim
  };

  // A soft, bigger “glow disk” behind points/badges
  function glowDisk(radius) {
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius,
        fill: new ol.style.Fill({ color: NEON.glowB }),
        stroke: new ol.style.Stroke({ color: NEON.ring, width: 2 }),
      }),
      zIndex: 1,
    });
  }

  // A thin neon ring overlay (no fill)
  function neonRing(radius) {
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius,
        fill: new ol.style.Fill({ color: 'rgba(0,0,0,0)' }),
        stroke: new ol.style.Stroke({ color: NEON.ring, width: 2 }),
      }),
      zIndex: 3,
    });
  }

  // 2-layer glow for lines (fat translucent underlay + crisp neon ring)
  // We'll place the base orange stroke on top (from your reset style)
  function lineGlow(widthBase = 3) {
    return [
      new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: NEON.glowA,
          width: widthBase + 6,
          lineCap: 'round',
        }),
        zIndex: 0,
      }),
      new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: NEON.ring,
          width: widthBase + 2,
          lineCap: 'round',
        }),
        zIndex: 1,
      }),
    ];
  }

  // Make a dimmed version of a point style (keep label)
  function dimPointStyle(name) {
    return new ol.style.Style({
      image: dot(NEON.dimPt, 6),
      text: name ? new ol.style.Text({
        text: String(name),
        font: '600 12px system-ui, Segoe UI, Roboto, Arial, sans-serif',
        fill: new ol.style.Fill({ color: NEON.dimTxt }),
        stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.6)', width: 3 }),
        offsetY: -14
      }) : undefined
    });
  }

  // Dim line
  function dimLineStyle() {
    return new ol.style.Style({
      stroke: new ol.style.Stroke({ color: NEON.dimLn, width: 3 }),
    });
  }

  // Dim road endpoints (keep green/red identity but translucent)
  function dimRoadEndpointStyle(lbl) {
    const color = (String(lbl).toUpperCase() === 'S') ? 'rgba(34,197,94,0.35)'  // green
                                                      : 'rgba(239,68,68,0.35)'; // red
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 6,
        fill: new ol.style.Fill({ color }),
        stroke: new ol.style.Stroke({ color: 'rgba(17,17,17,0.35)', width: 1 })
      }),
      text: new ol.style.Text({
        text: String(lbl || '').toUpperCase(),
        font: '600 12px system-ui, Segoe UI, Roboto, Arial, sans-serif',
        fill: new ol.style.Fill({ color: NEON.dimTxt }),
        stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.6)', width: 3 }),
        offsetY: -14
      })
    });
  }

  // Glow overlays for points/badges; we DON’T replace base style (so labels remain).
  function glowOverlaysForPoint(kindOrFeature, baseRadius = 6) {
    // For badges/endpoints we draw a little larger disk
    const r = baseRadius + (kindOrFeature === 'line-endpoint' ? 5 : 4);
    return [ glowDisk(r), neonRing(baseRadius + 2) ];
  }


  // function updateMapSizeSoon() { setTimeout(() => map.updateSize(), 270); }

  function setBasemap(key) {
    Object.entries(baseLayers).forEach(([k, lyr]) => lyr.setVisible(k === key));
    basemapButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.basemap === key));
    map.updateSize();
  }
  basemapButtons.forEach(btn => btn.addEventListener('click', () => setBasemap(btn.dataset.basemap)));

  function setFiltersOpen(open) {
    if (open) {
      filtersPanel.classList.add('open');
      filtersPanel.setAttribute('aria-hidden','false');
      btnFilters.setAttribute('aria-expanded','true');
    } else {
      filtersPanel.classList.remove('open');
      filtersPanel.setAttribute('aria-hidden','true');
      btnFilters.setAttribute('aria-expanded','false');
    }
    updateMapSizeSoon();
  }
  btnFilters.addEventListener('click', () => setFiltersOpen(!filtersPanel.classList.contains('open')));

  // ---------- Styling helpers ----------
  // POINT assets / endpoints with metadata and re-style support
  function stylePoint(feature, {highlight = false} = {}) {
    const color  = feature.get('color')  || '#7c3aed';
    const radius = (feature.get('radius') || 6) + (highlight ? 2 : 0);
    const text   = feature.get('badgeText') || feature.get('name') || '';
    const showText = Boolean(text) && (feature.get('showText') !== false);
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius,
        fill: new ol.style.Fill({ color }),
        stroke: new ol.style.Stroke({ color: highlight ? '#000' : '#111', width: highlight ? 2 : 1 })
      }),
      text: showText ? makeText(String(text).slice(0, 12), { offsetY: -14 }) : undefined,
      zIndex: 2
    });
  }

  function makeBadgeStyle(text) {
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 6,
        fill: new ol.style.Fill({ color: '#2563eb' }),
        stroke: new ol.style.Stroke({ color: '#0b3a8e', width: 1 })
      }),
      text: new ol.style.Text({
        text: String(text || ''),
        font: '700 11px system-ui, Segoe UI, Roboto, Arial, sans-serif',
        fill: new ol.style.Fill({ color: '#000' }),              // black text
        stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),// white halo
        offsetY: -14
      }),
      zIndex: 3
    });
  }

  function styleBadge(feature, {highlight = false} = {}) {
    const color = feature.get('color') || '#2563eb';
    const badgeText = feature.get('badgeText') || '';
    return new ol.style.Style({
      image: new ol.style.Circle({
        radius: 5 + (highlight ? 2 : 0),
        fill: new ol.style.Fill({ color }),
        stroke: new ol.style.Stroke({ color: '#0b3a8e', width: 1 })
      }),
      text: new ol.style.Text({
        text: badgeText,
        font: '700 11px system-ui, Segoe UI, Roboto, Arial, sans-serif',
        fill: new ol.style.Fill({ color: '#fff' }),
        stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.35)', width: 3 }),
        offsetY: -14,
      }),
      zIndex: 3
    });
  }

  function styleLine(feature, {highlight = false} = {}) {
    return new ol.style.Style({
      stroke: new ol.style.Stroke({
        color: highlight ? '#f97316' : '#fb923c',
        width: highlight ? 4 : 3
      }),
      zIndex: 1
    });
  }

  function applyFeatureStyle(feature, highlight) {
    const kind = feature.get('kind');
    if (kind === 'line') {
      feature.setStyle(styleLine(feature, {highlight}));
    } else if (kind === 'line-endpoint') {
      feature.setStyle(styleBadge(feature, {highlight}));
    } else {
      feature.setStyle(stylePoint(feature, {highlight}));
    }
  }

  // POINT assets: purple dot + small label (asset code) — now carries road_id too
  function addPoint(lon, lat, {
    label = '',
    id = null,
    color = '#7c3aed',
    radius = 6,
    feature_type = 'asset',     // 'asset' | 'road_endpoint' | 'asset_endpoint'
    road_id = null,
    asset_kind = 'point',       // 'point' | 'line'
    asset_type = null           // 'bridge' | 'culvert' | ...
  } = {}) {
    if (lon == null || lat == null) return null;
    const f = new ol.Feature({
      geometry: new ol.geom.Point(ol.proj.fromLonLat([+lon, +lat])),
      kind: 'point',
      id,
      name: label,
      feature_type,
      road_id,
      asset_kind,
      asset_type
    });
    const short = String(label || '').slice(0, 12);
    f.setStyle(new ol.style.Style({
      image: dot(color, radius),
      text: short ? makeText(short) : undefined,
      zIndex: 2,
    }));
    pointsSource.addFeature(f);
    return f;
  }

// add a small blue badge point with single letter (S/E)
  function addBadgePoint(lon, lat, badgeText, {
    color = '#2563eb',
    feature_type = 'asset_endpoint', // 'asset_endpoint' | 'road_endpoint'
    id = null,                       // asset id for line endpoints
    road_id = null,
    asset_kind = 'line',
    asset_type = null
  } = {}) {
    if (lon == null || lat == null) return null;
    const f = new ol.Feature({
      geometry: new ol.geom.Point(ol.proj.fromLonLat([+lon, +lat])),
      kind: 'line-endpoint',
      id,
      feature_type,
      road_id,
      asset_kind,
      asset_type,
      badgeText: String(badgeText || ''),   // used by styleByFeatureReset()
      name: String(badgeText || '')         // safe fallback
    });
    f.setStyle(makeBadgeStyle(badgeText));
    pointsSource.addFeature(f);
    return f;
  }

  // draw an orange line + its blue S/E endpoints with labels
  function addLine(lon1, lat1, lon2, lat2, {
    id = null,
    label = '',
    road_id = null,
    asset_type = null
  } = {}) {
    if ([lon1, lat1, lon2, lat2].some(v => v == null)) return null;

    const line = new ol.Feature({
      geometry: new ol.geom.LineString([
        ol.proj.fromLonLat([+lon1, +lat1]),
        ol.proj.fromLonLat([+lon2, +lat2]),
      ]),
      kind: 'line',
      id,
      name: label,
      road_id,
      asset_kind: 'line',
      asset_type,
      feature_type: 'asset'
    });
    applyFeatureStyle(line, false);
    linesSource.addFeature(line);

    // endpoints carry the same identity so clicks work correctly
    addBadgePoint(lon1, lat1, 'S', { feature_type: 'asset_endpoint', id, road_id, asset_type });
    addBadgePoint(lon2, lat2, 'E', { feature_type: 'asset_endpoint', id, road_id, asset_type });
 
 

    return line;
  }

function addColoredPoint(lon, lat, color, labelText) {
  if (lon == null || lat == null) return;
  const feat = new ol.Feature({
    geometry: new ol.geom.Point(ol.proj.fromLonLat([+lon, +lat])),
    name: labelText || ''
  });
  feat.setStyle(new ol.style.Style({
    image: dot(color),
    text: labelText ? makeText(labelText) : undefined,
    zIndex: 2
  }));
  pointsSource.addFeature(feat);
}

  // ---------- Highlighting & Sidebar ----------
  // function setSelectedRoadId(roadId) {
  //   SELECTED_ROAD_ID = roadId || null;
  //   const all = [...pointsSource.getFeatures(), ...linesSource.getFeatures()];
  //   all.forEach(f => {
  //     const same = SELECTED_ROAD_ID && (f.get('road_id') === SELECTED_ROAD_ID);
  //     applyFeatureStyle(f, Boolean(same));
  //     // Light de-emphasis for non-selected
  //     if (SELECTED_ROAD_ID && !same) {
  //       const s = f.getStyle();
  //       if (s && s.getFill) {
  //         // points: reduce opacity a bit
  //         const fill = s.getImage?.().getFill?.();
  //         if (fill) fill.setColor('rgba(17,17,17,0.15)');
  //       }
  //     }
  //   });
  // }

  // function ensureDetailPanel() {
  //   let panel = document.getElementById('detail-panel');
  //   if (panel) return panel;
  //   panel = document.createElement('aside');
  //   panel.id = 'detail-panel';
  //   panel.setAttribute('aria-hidden', 'true');
  //   panel.innerHTML = `
  //     <div class="dp-wrap">
  //       <button class="dp-close" aria-label="Close">&times;</button>
  //       <div class="dp-body"><div class="dp-loading">Loading…</div></div>
  //     </div>`;
  //   // minimal styles (so you don't need to touch CSS)
  //   const css = document.createElement('style');
  //   css.textContent = `
  //     #detail-panel{position:absolute;top:0;right:0;width:420px;max-width:85vw;height:100%;background:#fff;
  //       box-shadow:-8px 0 16px rgba(0,0,0,.15);transform:translateX(100%);transition:transform .25s ease;z-index:50;}
  //     #detail-panel.open{transform:translateX(0)}
  //     #detail-panel .dp-wrap{display:flex;flex-direction:column;height:100%}
  //     #detail-panel .dp-close{align-self:flex-end;background:none;border:0;font-size:28px;line-height:1;padding:12px;cursor:pointer}
  //     #detail-panel .dp-body{padding:12px 16px;overflow:auto}
  //     #detail-panel pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px}
  //     #detail-panel .dp-loading{opacity:.7}
  //   `;
  //   document.body.appendChild(css);
  //   document.body.appendChild(panel);
  //   panel.querySelector('.dp-close').addEventListener('click', closeDetailPanel);
  //   return panel;
  // }

  // function openDetailPanel(html) {
  //   const panel = ensureDetailPanel();
  //   const body = panel.querySelector('.dp-body');
  //   body.innerHTML = html || '';
  //   panel.classList.add('open');
  //   panel.setAttribute('aria-hidden','false');
  //   updateMapSizeSoon();
  // }
  // function closeDetailPanel() {
  //   const panel = ensureDetailPanel();
  //   panel.classList.remove('open');
  //   panel.setAttribute('aria-hidden','true');
  //   updateMapSizeSoon();
  //   setSelectedRoadId(null);
  // }

  // async function showAssetDetail(assetId, roadId) {
  //   openDetailPanel(`<div class="dp-loading">Loading asset…</div>`);
  //   const res = await fetch(`/api/asset/${assetId}/`);
  //   const data = await res.json();
  //   const pretty = JSON.stringify(data.asset || data, null, 2);
  //   openDetailPanel(`<h3>Asset</h3><pre>${pretty}</pre>`);
  //   if (roadId) setSelectedRoadId(roadId);
  // }

  // async function showRoadDetail(roadId) {
  //   openDetailPanel(`<div class="dp-loading">Loading road…</div>`);
  //   const res = await fetch(`/api/road/${roadId}/?include=assets`);
  //   const data = await res.json();
  //   const pretty = JSON.stringify(data, null, 2);
  //   openDetailPanel(`<h3>Road</h3><pre>${pretty}</pre>`);
  //   setSelectedRoadId(roadId);
  // }

  // // click handler: select + detail
  // map.on('singleclick', (evt) => {
  //   let clicked = null;
  //   map.forEachFeatureAtPixel(evt.pixel, (feature) => { clicked = feature; return true; }, {hitTolerance: 6});
  //   if (!clicked) { closeDetailPanel(); return; }
  //   const kind = clicked.get('kind');
  //   const roadId = clicked.get('road_id') || null;
  //   const assetId = clicked.get('id') || null;
  //   // Road endpoints or explicit road click → road detail
  //   if (kind === 'line-endpoint' || kind === 'road-start' || kind === 'road-end') {
  //     if (roadId) showRoadDetail(roadId);
  //     else closeDetailPanel();
  //     return;
  //   }
  //   // Asset points/lines
  //   if (assetId) {
  //     showAssetDetail(assetId, roadId);
  //     return;
  //   }
  //   // Fallback: highlight if we have road_id
  //   if (roadId) setSelectedRoadId(roadId);
  // });

  function clearMap() { pointsSource.clear(); linesSource.clear(); }

  function fitAll() {
    const ex1 = pointsSource.getExtent();
    const ex2 = linesSource.getExtent();
    let extent = ex1;
    if (extent && ex2) ol.extent.extend(extent, ex2);
    if (!extent || !isFinite(extent[0])) return;
    map.getView().fit(extent, { padding: [40,40,40,40], maxZoom: 15, duration: 300 });
  }

  // ---------- UI: multi-select panels ----------
  function togglePanel(triggerBtn, panelEl) {
    const open = panelEl.getAttribute("aria-hidden") === "false";
    panelEl.setAttribute("aria-hidden", open ? "true" : "false");
    triggerBtn.setAttribute("aria-expanded", open ? "false" : "true");
  }
  roadsTrigger.addEventListener('click', () => togglePanel(roadsTrigger, roadsPanel));
  assetsTrigger.addEventListener('click', () => togglePanel(assetsTrigger, assetsPanel));

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!roadsSelect.contains(e.target)) {
      roadsPanel.setAttribute("aria-hidden","true");
      roadsTrigger.setAttribute("aria-expanded","false");
    }
    if (!assetsSelect.contains(e.target)) {
      assetsPanel.setAttribute("aria-hidden","true");
      assetsTrigger.setAttribute("aria-expanded","false");
    }
  });

  // ---------- Districts ----------
  function populateDistricts() {
    districtSel.innerHTML = `<option value="">All</option>`;
    DISTRICT_CHOICES.forEach(([code,name]) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = name;
      districtSel.appendChild(opt);
    });
  }

  // ---------- Roads ----------
  function renderRoadsList(roads) {
  // roads: [{id, name, start_lat, start_lon, end_lat, end_lon}]
    roadsList.innerHTML = roads.map(r => {
      // Be tolerant to field naming differences
      const id        = r.id ?? r.pk ?? r.uuid ?? r.ID ?? "";
      const name      = r.name ?? r.road_name ?? r.title ?? "(Unnamed road)";
      const start_lat = r.start_lat ?? r.startLat ?? r.start_latitude ?? r.start_latitude_deg ?? null;
      const start_lon = r.start_lon ?? r.startLon ?? r.start_longitude ?? r.start_longitude_deg ?? null;
      const end_lat   = r.end_lat ?? r.endLat ?? r.end_latitude ?? r.end_latitude_deg ?? null;
      const end_lon   = r.end_lon ?? r.endLon ?? r.end_longitude ?? r.end_longitude_deg ?? null;
      return `
       <label class="check" data-name="${(r.name||'').toLowerCase()}">
        <input type="checkbox" value="${id}"
               data-start-lat="${start_lat ?? ''}"
               data-start-lon="${start_lon ?? ''}"
               data-end-lat="${end_lat ?? ''}"
               data-end-lon="${end_lon ?? ''}">
        <span>${name}</span>
       </label>
      `;
    }).join('');
     updateRoadsTriggerLabel();
   }

  function filterRoadsList(query) {
    const q = (query || '').toLowerCase().trim();
    [...roadsList.querySelectorAll('.check')].forEach(el => {
      const name = el.getAttribute('data-name') || '';
      el.style.display = name.includes(q) ? '' : 'none';
    });
  }
  roadsSearch.addEventListener('input', () => filterRoadsList(roadsSearch.value));

  roadsSelectAllBtn.addEventListener('click', () => {
    roadsList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    updateRoadsTriggerLabel();
  });
  roadsClearAllBtn.addEventListener('click', () => {
    roadsList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    updateRoadsTriggerLabel();
  });
  roadsList.addEventListener('change', updateRoadsTriggerLabel);

  function getSelectedRoadCheckboxes() {
    return [...roadsList.querySelectorAll('input[type="checkbox"]:checked')];
  }
  function updateRoadsTriggerLabel() {
    const count = getSelectedRoadCheckboxes().length;
    const label = roadsSelect.querySelector('.ms-label');
    const countSpan = roadsSelect.querySelector('.ms-count');
    if (count === 0) {
      label.textContent = 'Select roads';
      countSpan.hidden = true;
    } else {
      label.textContent = `${count} selected`;
      countSpan.textContent = `(${count})`;
      countSpan.hidden = false;
    }
  }

  async function loadRoadsByDistrict(districtCode) {
    if (!districtCode) {
      renderRoadsList([]);
      roadsSearch.value = '';
      return;
    }
    const url = new URL(location.origin + "/api/roads/");
    url.searchParams.set("district", districtCode);
    try {
      const res = await fetch(url);
      const data = await res.json();
      console.log("[roads] district:", districtCode, "| raw payload:", data);
      // Accept a few common shapes: {roads:[...]}, [...] or {results:[...]}
      const roads = Array.isArray(data) ? data
                   : Array.isArray(data?.roads) ? data.roads
                   : Array.isArray(data?.results) ? data.results
                   : [];
      console.log(`[roads] parsed count=${roads.length}`);
    renderRoadsList(roads);
    // auto-open when there are results
    if (roads.length > 0) {
      roadsPanel.setAttribute("aria-hidden","false");
      roadsTrigger.setAttribute("aria-expanded","true");
    }
    } catch (e) {
      console.error("Failed to load roads:", e);
      renderRoadsList([]);
    }
  }

  // ---------- Assets ----------
  function renderAssetsList() {
    assetsList.innerHTML = ASSET_KEYS.map(a => `
      <label class="check">
        <input type="checkbox" value="${a.key}" data-atype="${a.type}">
        <span>${a.label}</span>
      </label>
    `).join('');
  }
  function getAssetMode() {
    const sel = assetsPanel.querySelector('input[name="asset_mode"]:checked');
    return sel ? sel.value : 'none';
  }
  function getSelectedAssetKeys() {
    return [...assetsList.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
  }
  function setAssetsUIByMode(mode) {
    const custom = mode === 'custom';
    assetsList.setAttribute('aria-disabled', custom ? 'false' : 'true');
    assetsSelectAllBtn.disabled = !custom;
    assetsClearAllBtn.disabled  = !custom;

    const label = assetsTrigger.querySelector('.ms-label');
    if (mode === 'none') label.textContent = 'No assets';
    else if (mode === 'all') label.textContent = 'All assets';
    else label.textContent = 'Choose assets';
  }

  assetsPanel.addEventListener('change', (e) => {
    if (e.target.name === 'asset_mode') {
      setAssetsUIByMode(getAssetMode());
    }
  });
  assetsSelectAllBtn.addEventListener('click', () => {
    assetsList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  assetsClearAllBtn.addEventListener('click', () => {
    assetsList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  // ---------- Apply / Reset ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMap();

    const district = districtSel.value;
    const roadCbs  = getSelectedRoadCheckboxes();
    const roadIds  = roadCbs.map(cb => cb.value);

    // draw roads (start/end): green/red — attach road_id and visible labels 'S'/'E'
    roadCbs.forEach(cb => {
      const sLat = parseFloat(cb.dataset.startLat), sLon = parseFloat(cb.dataset.startLon);
      const eLat = parseFloat(cb.dataset.endLat),   eLon = parseFloat(cb.dataset.endLon);
      const rId  = cb.value;

      if (!Number.isNaN(sLat) && !Number.isNaN(sLon)) {
        // Road start
        addPoint(sLon, sLat, {
          color: '#22c55e',
          label: 'S',
          feature_type: 'road_endpoint',
          road_id: rId,
          asset_kind: 'point'
        });
      }
      if (!Number.isNaN(eLat) && !Number.isNaN(eLon)) {
        // Road end
        addPoint(eLon, eLat, {
          color: '#ef4444',
          label: 'E',
          feature_type: 'road_endpoint',
          road_id: rId,
          asset_kind: 'point'
        });
      }
    });

    // assets
    const mode = getAssetMode();
    let typesParam = 'none';
    if (mode === 'all') typesParam = 'all';
    if (mode === 'custom') {
      const keys = getSelectedAssetKeys();
      typesParam = keys.join(',');
    }

    if (roadIds.length && typesParam !== 'none') {
      const url = new URL(location.origin + "/api/assets/");
      url.searchParams.set("road_ids", roadIds.join(','));
      url.searchParams.set("types", typesParam);
      const res = await fetch(url);
      const data = await res.json();

      // Expect: assets: array of records:
      // { kind:'point', lon, lat, label }
      // { kind:'line', start_lon, start_lat, end_lon, end_lat, label }
      (data.assets || []).forEach(a => {
        if (a.kind === 'point') {
          const l = (a.label || '').toLowerCase();
          const short =
            l.includes('bridge')       ? 'Br' :
            l.includes('culvert')      ? 'Cu' :
            l.includes('sign')         ? 'Sb' :
            l.includes('toll')         ? 'Tl' :
            l.includes('light')        ? 'Lp' :
            l.includes('interchange')  ? 'Ic' :
            l.includes('roadcross')    ? 'Rc' :
            l.includes('patch')        ? 'Pc' : 'Pt';

          // Asset POINT feature, linked to its own asset id/type only
          addPoint(a.lon, a.lat, {
            color: '#7c3aed',
            label: short,
            id: a.id,
            feature_type: 'asset',
            road_id: a.road_id || null,
            asset_kind: 'point',
            asset_type: a.label || null
          });
        } else if (a.kind === 'line') {
          // Asset LINE feature and its endpoints, all linked to the same asset id/type
          addLine(a.start_lon, a.start_lat, a.end_lon, a.end_lat, {
            label: a.label || '',
            id: a.id,
            road_id: a.road_id || null,
            asset_type: a.label || null
          });
        }
      });

    }

    fitAll();
    // Close panels for a clean feel
    roadsPanel.setAttribute("aria-hidden","true");
    assetsPanel.setAttribute("aria-hidden","true");
    roadsTrigger.setAttribute("aria-expanded","false");
    assetsTrigger.setAttribute("aria-expanded","false");
  });

  btnReset.addEventListener('click', () => {
    districtSel.value = "";
    renderRoadsList([]);
    roadsSearch.value = "";

    // assets -> reset to none
    assetsPanel.querySelector('input[name="asset_mode"][value="none"]').checked = true;
    setAssetsUIByMode('none');
    assetsList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

    clearMap();
    closeDrawer();  
    map.getView().setCenter(ol.proj.fromLonLat([71.5, 34.0]));
    map.getView().setZoom(7);
    // drawer is managed inside boot(); if present, close it safely
    const drawer = document.getElementById('detail-drawer');
    if (drawer) {
      drawer.setAttribute('aria-hidden', 'true');
      drawer.classList.remove('open');
      document.body.classList.remove('drawer-open');
      updateMapSizeSoon();
    }
  });

  // ---------- Boot ----------
  (async function boot() {
    setBasemap('google_sat');
    setFiltersOpen(false);
    populateDistricts();
    renderAssetsList();
    setAssetsUIByMode('none');

    // Roads refresh when district changes
    districtSel.addEventListener('change', () => loadRoadsByDistrict(districtSel.value));

    // Drawer controls (no overlay; we squeeze map by toggling a body class)
    const drawer = document.getElementById('detail-drawer');
    const drawerTitle = document.getElementById('drawer-title');
    const drawerBody = document.getElementById('drawer-body');
    const drawerClose = document.getElementById('drawer-close');

    function openDrawer(title, nodeOrHTML) {
      if (!drawer || !drawerTitle || !drawerBody) {
        console.warn('Drawer elements not found; showing console-only data.');
        return; // don’t throw; still allow highlight to work
      }
      drawerTitle.textContent = title || 'Details';
      drawerBody.innerHTML = '';
      if (typeof nodeOrHTML === 'string') {
        drawerBody.innerHTML = nodeOrHTML;
      } else if (nodeOrHTML instanceof Node) {
        drawerBody.appendChild(nodeOrHTML);
      }
      drawer.setAttribute('aria-hidden', 'false');
      drawer.classList.add('open');
      document.body.classList.add('drawer-open');
      setTimeout(() => map.updateSize(), 280);
    }
    function closeDrawer() {
      drawer.setAttribute('aria-hidden', 'true');
      drawer.classList.remove('open');
      document.body.classList.remove('drawer-open');
      setTimeout(() => map.updateSize(), 280);
    }
    if (drawerClose) drawerClose.addEventListener('click', closeDrawer);

    // Helpers to render JSON table quickly
    function objToTable(obj) {
      const tbl = document.createElement('table');
      tbl.className = 'kv';
      Object.entries(obj || {}).forEach(([k,v]) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th'); th.textContent = k;
        const td = document.createElement('td'); td.textContent = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
        tr.appendChild(th); tr.appendChild(td);
        tbl.appendChild(tr);
      });
      return tbl;
    }

    async function fetchRoad(roadId) {
      const res = await fetch(`/api/road/${roadId}/`); // no assets by default (fast)
      if (!res.ok) throw new Error('road fetch failed');
      return res.json();
    }
    async function fetchRoadAssetsOnce(roadId) {
      // pull all asset types for a single road to ensure we can highlight
      const url = new URL(location.origin + "/api/assets/");
      url.searchParams.set("road_ids", roadId);
      url.searchParams.set("types", "all");
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      (data.assets || []).forEach(a => {
        if (a.kind === 'point') {
          addPoint(a.lon, a.lat, {
            color: '#7c3aed', label: (a.label||'').slice(0,2).toUpperCase(), id: a.id,
            feature_type: 'asset', road_id: a.road_id || null, asset_kind: 'point', asset_type: a.label || null
          });
        } else {
          addLine(a.start_lon, a.start_lat, a.end_lon, a.end_lat, {
            label: a.label || '', id: a.id, road_id: a.road_id || null, asset_type: a.label || null
          });
        }
      });
    }
    async function fetchAsset(assetId) {
      const res = await fetch(`/api/asset/${assetId}/`);
      if (!res.ok) throw new Error('asset fetch failed');
      return res.json();
    }

    // Highlight helpers
    const defaultPointStyle = new ol.style.Style({ image: dot('#7c3aed', 6) });
    const defaultLineStyle  = new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#fb923c', width: 3 }) });
    const hiPointStyle      = new ol.style.Style({ image: dot('#111827', 7) });
    const hiLineStyle       = new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#111827', width: 4.5 }) });
    const roadEndStartStyle = { start: new ol.style.Style({ image: dot('#22c55e', 6) }),
                                end:   new ol.style.Style({ image: dot('#ef4444', 6) }) };

    function styleByFeatureReset(f) {
      const kind = f.get('kind');
      const name = f.get('name') || '';

      if (f.get('feature_type') === 'road_endpoint') {
        const lbl = name.toUpperCase();
        const color = lbl === 'S' ? '#22c55e' : '#ef4444';
        f.setStyle(new ol.style.Style({
          image: dot(color, 6),
          text: new ol.style.Text({
            text: lbl,
            font: '600 12px system-ui, Segoe UI, Roboto, Arial, sans-serif',
            fill: new ol.style.Fill({ color: '#000' }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
            offsetY: -14
          })
        }));
        return;
      }

      if (kind === 'line-endpoint') {  // blue S/E badges for line assets
        const badge = f.get('badgeText') || f.get('name') || '';
        f.setStyle(makeBadgeStyle(badge));   // your existing badge style
        return;
      }

      if (kind === 'line') {
        f.setStyle(new ol.style.Style({
          stroke: new ol.style.Stroke({ color: '#fb923c', width: 3 })
        }));
      } else {
        // default purple point with label
        f.setStyle(new ol.style.Style({
          image: dot('#7c3aed', 6),
          text: name ? new ol.style.Text({
            text: String(name),
            font: '600 12px system-ui, Segoe UI, Roboto, Arial, sans-serif',
            fill: new ol.style.Fill({ color: '#000' }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 3 }),
            offsetY: -14
          }) : undefined
        }));
      }
    }

    // --- Glow helpers ---
    // shared filters via CSS variable; re-applied through ol style
    const glowFilter = 'drop-shadow(0 0 5px #00ffff) drop-shadow(0 0 10px #00ffff)';
    const blurStroke  = new ol.style.Stroke({ color: '#00ffff', width: 5, lineCap: 'round', lineJoin: 'round' });
    const glowStroke  = new ol.style.Stroke({ color: '#00ffff', width: 3 });
    const faintStroke = new ol.style.Stroke({ color: 'rgba(0,0,0,0.2)', width: 2 });

    // blurred halo circle
    function glowDot(color = '#00ffff', radius = 7) {
      return new ol.style.RegularShape({
        points: 30,
        radius: radius,
        fill: new ol.style.Fill({ color }),
        stroke: new ol.style.Stroke({ color, width: 1 }),
      });
    }

    // Apply NEON overlays *on top of* the base style; preserves labels & base colors
    function styleByFeatureHighlight(f) {
      // First, configure the base identity style
      styleByFeatureReset(f);
      const base = f.getStyle();
      const baseArr = Array.isArray(base) ? base : [base];

      // Add glow overlays in front of (or behind) the base
      if (f.get('kind') === 'line') {
        // Glow underlays go first, then base orange stroke on top
        f.setStyle([ ...lineGlow(3), ...baseArr ]);
        return;
      }

      if (f.get('feature_type') === 'road_endpoint') {
        // Keep green/red endpoint + add teal glow ring around it
        const name = f.get('name') || 'S';
        f.setStyle([ ...glowOverlaysForPoint('road-endpoint', 6), ...baseArr ]);
        return;
      }

      if (f.get('kind') === 'line-endpoint') {
        // Keep blue badge + glow around it
        f.setStyle([ ...glowOverlaysForPoint('line-endpoint', 6), ...baseArr ]);
        return;
      }

      // Regular asset point: keep purple dot & label; add teal ring + soft glow
      f.setStyle([ ...glowOverlaysForPoint('point', 6), ...baseArr ]);
    }

    function highlightRoadById(roadId) {
      // 1) First, restore everyone to their base (normal) look
      pointsSource.getFeatures().forEach(styleByFeatureReset);
      linesSource.getFeatures().forEach(styleByFeatureReset);

      // 2) Dim everything that is NOT on the selected road
      let any = false;

      // Points (asset points, line endpoints, road endpoints)
      pointsSource.getFeatures().forEach(f => {
        const same = String(f.get('road_id') || '') === String(roadId);

        if (same) { any = true; return; } // leave selected features as-is (full style)

        const kind = f.get('kind');
        const name = f.get('name') || '';

        if (f.get('feature_type') === 'road_endpoint') {
          // keep S/E identity but translucent
          f.setStyle(dimRoadEndpointStyle(name));
          return;
        }

        if (kind === 'line-endpoint') {
          // Dim the badge but keep its text readable
          const badge = f.get('badgeText') || f.get('name') || '';
          const s = makeBadgeStyle(badge);
          s.getImage().setFill(new ol.style.Fill({ color: 'rgba(37,99,235,0.25)' }));
          s.getImage().setStroke(new ol.style.Stroke({ color: 'rgba(11,58,142,0.35)', width: 1 }));
          s.getText().setFill(new ol.style.Fill({ color: 'rgba(0,0,0,0.35)' }));
          f.setStyle(s);
          return;
        }

        // Regular asset points
        f.setStyle(dimPointStyle(name));
      });

      // Lines
      linesSource.getFeatures().forEach(f => {
        const same = String(f.get('road_id') || '') === String(roadId);
        if (same) { any = true; return; } // keep normal
        f.setStyle(dimLineStyle());
      });

      return any;
    }




    if (map.__clickBound) return;
    map.__clickBound = true;

    // Clicking the map: feature picking & behavior
    map.on('singleclick', async (evt) => {
      const pixel = evt.pixel;
      const feat = map.forEachFeatureAtPixel(pixel, f => f, { layerFilter: l => (l === pointsLayer || l === linesLayer) });
      if (!feat) {
        // click on empty map -> close drawer and reset highlight
        if (drawer) closeDrawer();
        pointsSource.getFeatures().forEach(styleByFeatureReset);
        linesSource.getFeatures().forEach(styleByFeatureReset);
        return;
      }

      const ftype = feat.get('feature_type');
      const roadId = feat.get('road_id');
      const assetId = feat.get('id');
      const assetKind = feat.get('asset_kind'); // 'point'|'line'

      try {
        // 1) Road endpoints: show road details (with counts & pics)
        if (ftype === 'road_endpoint' && roadId) {
          const hasAny = highlightRoadById(roadId);
          if (!hasAny) {
            await fetchRoadAssetsOnce(roadId);
            highlightRoadById(roadId);
          }
          const res = await fetch(`/api/road/${roadId}/?include=counts`);
          const payload = await res.json();
          const panel = document.createElement('div');
          panel.appendChild(objToTable(payload.road));
          const h = document.createElement('h4');
          h.textContent = 'Asset Counts';
          panel.appendChild(h);
          panel.appendChild(objToTable(payload.counts || {}));
          openDrawer(payload.road.name || 'Road', panel);
          return;
        }

        // 2) Asset points or line endpoints: show ONLY asset details, not whole road
        if ((ftype === 'asset' || ftype === 'asset_endpoint') && assetId) {
          const payload = await fetchAsset(assetId);
          const asset = payload.asset || {};
          // Highlight full road (without changing road endpoints colors)
          if (asset.road_id) {
            const hasAny = highlightRoadById(asset.road_id);
            if (!hasAny) {
              await fetchRoadAssetsOnce(asset.road_id);
              highlightRoadById(asset.road_id);
            }
          }
          openDrawer(`${(asset.type || 'Asset').toString().toUpperCase()}`, objToTable(asset));
          return;
        }
      } catch (err) {
        console.error(err);
      }
    });
  })();
})();
