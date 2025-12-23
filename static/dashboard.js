(function () {
  let SELECTED_ROAD_ID = null;
  // --- Global edit state ---
  let ACTIVE_EDITOR = null;   // { kind: 'road'|'asset', id, record, nodes, ... }
  let EDIT_MODE = 'view';     // 'view' | 'edit'
  
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

  function districtNameByCode(code) {
    if (!code) return '';
    const found = DISTRICT_CHOICES.find(([c]) => c === code);
    return found ? found[1] : '';
  }

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
  const roadsTotal    = document.getElementById("roads-total");
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

  // --- "Stick current selection" checkbox, shown beside Reset ---
  const filtersActions = document.querySelector('.filters-actions');
  let stickSelectionCheckbox = null;
  let selectionTableButton = null;

  if (filtersActions && btnReset) {
    const wrapper = document.createElement('div');
    wrapper.className = 'stick-selection-group';

    const label = document.createElement('label');
    label.className = 'stick-selection';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'stick-selection';

    const span = document.createElement('span');
    span.textContent = 'Stick current selection';

    label.appendChild(cb);
    label.appendChild(span);

    const openTableBtn = document.createElement('button');
    openTableBtn.type = 'button';
    openTableBtn.id = 'btn-open-selection-table';
    openTableBtn.className = 'btn btn-outline btn-selection-table';
    openTableBtn.textContent = 'Open selection table';
    openTableBtn.disabled = true;

    wrapper.appendChild(label);
    wrapper.appendChild(openTableBtn);

    // Insert immediately after the Reset button so it appears beside the checkbox group
    filtersActions.insertBefore(wrapper, btnReset.nextSibling);

    stickSelectionCheckbox = cb;
    selectionTableButton = openTableBtn;
  }

  function isStickSelectionOn() {
    return !!(stickSelectionCheckbox && stickSelectionCheckbox.checked);
  }

  const btnFilters     = document.getElementById("btn-filters");
  const filtersPanel   = document.getElementById("filters-panel");

  // Map overlay: layers button + panel
  const mapLayersToggle = document.getElementById("map-layers-toggle");
  const mapLayersPanel  = document.getElementById("map-layers-panel");
  const mapLayersClose  = document.getElementById("map-layers-close");

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

  // --- Overview Map control (bottom-right mini-map) ---
  const overviewMapControl = new ol.control.OverviewMap({
    className: 'ol-overviewmap ol-custom-overviewmap',
    collapsed: false,        // keep it open
    rotateWithView: false,   // always false as requested
    layers: [
      new ol.layer.Tile({
        source: new ol.source.OSM(), // simple basemap for overview
      }),
    ],
  });

  // --- Mouse Position control (EPSG:4326, 6 decimal places) ---
  const mousePositionControl = new ol.control.MousePosition({
    coordinateFormat: ol.coordinate.createStringXY(6),
    projection: 'EPSG:4326',
    // no target => render inside map container like other controls
  });

  const map = new ol.Map({
    target: "map",
    layers: [
      baseLayers.google_sat, baseLayers.google_hybrid, baseLayers.google_standard,
      baseLayers.google_terrain, baseLayers.esri_world, baseLayers.osm,
      linesLayer, pointsLayer
    ],
    view: new ol.View({ center: ol.proj.fromLonLat([71.5, 34.0]), zoom: 7 })
  });
  // ---- Make map globally visible for late-loaded modules (layers modal)
  window.__olMap = map;
  // Resolve (or create+resolve) a readiness promise exactly once
  if (!window.__MAP_READY__) {
    window.__MAP_READY__ = new Promise((res) => (window.__MAP_READY_RESOLVE__ = res));
  }
  if (window.__MAP_READY_RESOLVE__) {
    window.__MAP_READY_RESOLVE__(map);
    window.__MAP_READY_RESOLVE__ = null;
  }
  map.addControl(new ol.control.ScaleLine());
  map.addControl(new ol.control.ZoomSlider());
  map.addControl(new ol.control.Rotate());
  map.addControl(new ol.control.FullScreen());
  map.addControl(overviewMapControl);
  map.addControl(mousePositionControl);
  // --- Shared Modify interaction for editing points (road/asset endpoints) ---
  const editableFeatures = new ol.Collection();
  const modifyInteraction = new ol.interaction.Modify({
    features: editableFeatures,
  });
  // --- Drag-rotate-and-zoom (Ctrl + drag) ---
  const dragRotateAndZoom = new ol.interaction.DragRotateAndZoom({
    // Use Ctrl+drag instead of the default Shift+drag
    condition: function (mapBrowserEvent) {
      const evt = mapBrowserEvent.originalEvent;
      if (!evt) return false;
      // Ctrl only (no Shift / Alt) so it doesn't clash with your Shift+drag box zoom
      return evt.ctrlKey && !evt.shiftKey && !evt.altKey;
    },
  });
  // --- Reset-to-North button logic ---
  const view = map.getView();
  const resetNorthBtn = document.getElementById('map-reset-north');

  function updateResetNorthVisibility() {
    if (!resetNorthBtn) return;
    const rot = view.getRotation() || 0;
    if (Math.abs(rot) > 1e-3) {
      resetNorthBtn.classList.add('visible');
      resetNorthBtn.setAttribute('aria-hidden', 'false');
    } else {
      resetNorthBtn.classList.remove('visible');
      resetNorthBtn.setAttribute('aria-hidden', 'true');
    }
  }

  // Show/hide whenever rotation changes (e.g. via Ctrl+drag or touch gestures)
  view.on('change:rotation', updateResetNorthVisibility);

  // Click: animate back to north-up
  if (resetNorthBtn) {
    resetNorthBtn.addEventListener('click', () => {
      view.animate({
        rotation: 0,
        duration: 250,
        easing: ol.easing.easeOut,
      });
    });
  }

  // Ensure correct initial state
  updateResetNorthVisibility();


  map.addInteraction(dragRotateAndZoom);
  map.addInteraction(modifyInteraction);
  modifyInteraction.setActive(false);

  // >>> Expose a stable public surface for layers.js and anyone else
  window.AppMap = { map, ol };
  window.__APP_MAP_READY__ = true;

  // If any script registered "waiters" before we existed, flush them now.
  // (This guarantees resolution even if layers.js loaded first.)
  if (Array.isArray(window.__APP_MAP_WAITERS__) && window.__APP_MAP_WAITERS__.length) {
    try {
      window.__APP_MAP_WAITERS__.splice(0).forEach(fn => {
        try { fn(window.AppMap); } catch (e) { console.warn('[dashboard] waiter failed:', e); }
      });
    } catch (e) {
      console.warn('[dashboard] flushing waiters failed:', e);
    }
  }

  // Fire events too (helpful for tools/dev)
  try {
    const evt = new CustomEvent('appmap:ready');
    window.dispatchEvent(evt);
    document.dispatchEvent(evt);
  } catch (e) {
    console.warn('[dashboard] CustomEvent dispatch issue (non-fatal):', e);
  }

  // --- Always-on-top, NON-declutter layer for SELECTED points only ---
  const prioritySource = new ol.source.Vector();
  const priorityLayer  = new ol.layer.Vector({
    source: prioritySource,
    declutter: false,   // <-- crucial: never declutter selected points
    zIndex: 30          // above pointsLayer(20) & linesLayer(10)
  });
  map.addLayer(priorityLayer);

  // --- Pulsing edit ring layer (sits just under the red pointer arrow) ---
  const editHighlightSource = new ol.source.Vector();
  const editHighlightLayer  = new ol.layer.Vector({
    source: editHighlightSource,
    declutter: false,
    zIndex: 29             // below priorityLayer (arrow), above pointsLayer
  });
  map.addLayer(editHighlightLayer);

  let editHighlightFeature = null;
  let editHighlightTimer = null;

  // Keep track of temporary mirror features we add to priorityLayer
  let selectedCopies = [];
  function clearSelectedCopies() {
    selectedCopies.forEach(f => prioritySource.removeFeature(f));
    selectedCopies = [];
  }

  // Mirror only true points (road endpoints, asset points, line endpoints) to priority layer
  function addPriorityCopyFrom(f) {
    const geom = f.getGeometry?.();
    if (!(geom instanceof ol.geom.Point)) return; // only points bypass declutter
    const copy = new ol.Feature({ geometry: geom });
    // Reuse the base visual so it looks identical; if style is array, keep the last (base) entry
    const s = f.getStyle?.();
    copy.setStyle(Array.isArray(s) ? s[s.length - 1] : s);
    prioritySource.addFeature(copy);
    selectedCopies.push(copy);
  }

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
      image: new ol.style.Circle({
        radius: 6,
        // dimmed fill
        fill: new ol.style.Fill({ color: NEON.dimPt }),
        // dimmed border as well (so it doesn't look fully active)
        stroke: new ol.style.Stroke({
          color: 'rgba(17,17,17,0.25)', // soft, semi-transparent dark border
          width: 1
        })
      }),
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

  function setBasemap(key) {
    Object.entries(baseLayers).forEach(([k, lyr]) => lyr.setVisible(k === key));
    basemapButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.basemap === key));
    map.updateSize();
  }
  basemapButtons.forEach(btn => btn.addEventListener('click', () => setBasemap(btn.dataset.basemap)));

  // keep a CSS var in sync with the filters panel height so the drawer can sit below it
  function syncFiltersHeightVar(forceZero = false) {
    if (forceZero) {
      document.documentElement.style.setProperty('--filters-h', '0px');
      return;
    }

    // Only measure when actually open (or in the "opening" phase)
    const isOpenish = filtersPanel.classList.contains('open') || filtersPanel.classList.contains('opening');

    if (!isOpenish) {
      document.documentElement.style.setProperty('--filters-h', '0px'); // hard 0, no border bleed
      return;
    }

    // Measure full box + margins while open
    const rectH = filtersPanel.getBoundingClientRect().height; // padding+border included
    const cs = getComputedStyle(filtersPanel);
    const mt = parseFloat(cs.marginTop)    || 0;
    const mb = parseFloat(cs.marginBottom) || 0;
    document.documentElement.style.setProperty('--filters-h', `${rectH + mt + mb}px`);
  }

  // --- Map Layers panel (top-right overlay) ---
  function setMapLayersPanelOpen(open) {
    if (!mapLayersPanel || !mapLayersToggle) return;
    if (open) {
      mapLayersPanel.classList.add('open');
      mapLayersPanel.setAttribute('aria-hidden', 'false');
      mapLayersToggle.setAttribute('aria-expanded', 'true');
    } else {
      mapLayersPanel.classList.remove('open');
      mapLayersPanel.setAttribute('aria-hidden', 'true');
      mapLayersToggle.setAttribute('aria-expanded', 'false');
    }
  }

  if (mapLayersToggle && mapLayersPanel) {
    mapLayersToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mapLayersPanel.classList.contains('open');
      setMapLayersPanelOpen(!isOpen);
    });
  }

  if (mapLayersClose && mapLayersPanel) {
    mapLayersClose.addEventListener('click', (e) => {
      e.stopPropagation();
      setMapLayersPanelOpen(false);
    });
  }

  // Close the map-layers panel when clicking outside it
  document.addEventListener('click', (e) => {
    if (!mapLayersPanel || !mapLayersToggle) return;
    if (!mapLayersPanel.classList.contains('open')) return;
    const inPanel = mapLayersPanel.contains(e.target);
    const onButton = mapLayersToggle.contains(e.target);
    if (!inPanel && !onButton) {
      setMapLayersPanelOpen(false);
    }
  });

  function setFiltersOpen(open) {
    if (open) {
      // OPEN: set class, then measure on the next frame so layout is updated
      filtersPanel.classList.add('opening');
      filtersPanel.classList.add('open');
      filtersPanel.setAttribute('aria-hidden','false');
      btnFilters.setAttribute('aria-expanded','true');

      requestAnimationFrame(() => {
        syncFiltersHeightVar(false);           // measure real height + margins
        // after the transition, clean up the helper class and re-sync
        const onEnd = () => {
          filtersPanel.classList.remove('opening');
          syncFiltersHeightVar(false);
          map.updateSize();
          filtersPanel.removeEventListener('transitionend', onEnd);
        };
        filtersPanel.addEventListener('transitionend', onEnd);
      });
    } else {
      // CLOSE: snap height to 0 immediately so the drawer lines up with the map
      filtersPanel.classList.add('closing');
      filtersPanel.classList.remove('open');
      filtersPanel.setAttribute('aria-hidden','true');
      btnFilters.setAttribute('aria-expanded','false');

      syncFiltersHeightVar(true);              // <- force 0 so no residual gap
      // let the panel animate its own collapse; when done, clean up
      const onEnd = () => {
        filtersPanel.classList.remove('closing');
        // keep it at 0 to avoid border/padding residuals
        syncFiltersHeightVar(true);
        map.updateSize();
        filtersPanel.removeEventListener('transitionend', onEnd);
      };
      filtersPanel.addEventListener('transitionend', onEnd);
    }

    // drawer/map can ease toward the new top using your existing transitions
    setTimeout(() => map.updateSize(), 280);
  }

  btnFilters.addEventListener('click', () => setFiltersOpen(!filtersPanel.classList.contains('open')));


  // --- Abbreviations for compact bar labels (fallback: first 2 letters) ---
  const ASSET_ABBR = new Map([
    ['bridge','Br'], ['culvert','Cu'], ['signboard','Sb'], ['toll','Tl'],
    ['lightpole','Lp'], ['interchange','Ic'], ['roadcrossing','Rc'],
    ['drainage','Dr'], ['retainingwall','Rw'], ['guardrail','Gr'],
    ['dykecurbstone','Dc'], ['tunnel','Tu'], ['patchcondition','Pc']
  ]);

  // Map drawer section key → asset type
  const SECTION_ASSET_MAP = {
    road: 'road',
    roads: 'road',

    bridge: 'bridge',
    bridges: 'bridge',

    culvert: 'culvert',
    culverts: 'culvert',

    signboard: 'signboard',
    signboards: 'signboard',

    light_pole: 'light_pole',
    lightpole: 'light_pole',
    light_poles: 'light_pole',

    interchange: 'interchange',
    interchanges: 'interchange',

    patch_condition: 'patch_condition',
    patch: 'patch_condition',

    road_crossing: 'road_crossing',
    road_crossings: 'road_crossing',

    toll: 'toll',
    tolls: 'toll',

    drainage: 'drainage',

    retaining_wall: 'retaining_wall',
    retaining_walls: 'retaining_wall',

    guard_rail: 'guard_rail',
    guard_rails: 'guard_rail',

    tunnel: 'tunnel',
    tunnels: 'tunnel',

    dyke_curb_stone: 'dyke_curb_stone',
    dyke_curb_stones: 'dyke_curb_stone'
  };

  // Dropdown options per asset / field
  const ASSET_DROPDOWN_OPTIONS = {
    road: {
      carriageway_type: ['Single', 'Dual', 'Triple', 'Four Lane', 'Five Lane', 'Six Lane', 'Seven Lane', 'Eight Lane'],
      no_of_lanes: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      traffic_flow_direction: ['One Way', 'Two Way'],
      executing_agency: ['PKHA', 'C&W'],
      road_class: ['Motorway', 'Arterial Road', 'Collector Road', 'District Road', 'Access/Local Road', 'Rural Road', 'Urban Road'],
      pavement_type: ['TST/DST', 'Asphalt Concrete', 'Shingle/Gravel', 'PCC', 'Earthen'],
      shoulder_type: ['TST/DST', 'Asphalt Concrete', 'Shingle/Gravel', 'PCC', 'Earthen', 'None'],
      median_type: ['Curb Stone', 'Grass Barrier', 'New Jersey Barrier', 'None'],
      usability: ['All Weather', 'Snow Bound']
    },

    bridge: {
      construction_type: ['RCC', 'RCC. Stone', 'Arch', 'Steel Truss', 'Suspension', 'Masonry', 'Wooden', 'Steel With Wooden Slab', 'T-Girder', 'I-Girder', 'Prestressed'],
      parapet: ['Masonry', 'RCC', 'RCC Guard/Rails', 'Metallic Railings', 'Crash Barrier', 'Wooden'],
      abutment_pier_material: ['Stone Masonry', 'Brick Masonry', 'Mass Concrete', 'Reinforced Concrete', 'Columns'],
      passage: ['River', 'Flood Relief Channel', 'Irrigation Channel', 'Canal', 'Railway', 'Roadway', 'Pedestrian', 'Underpass', 'Flyover', 'Nalla'],
      foundation_type: ['Spread Footing', 'Piles', 'Caissons', 'Others'],
      type_of_joints: ['Neoprene', 'Steel'],
      severity: ['Low', 'Moderate', 'High']
    },

    culvert: {
      construction_type: ['Box', 'Pipe', 'Arch', 'Slab', 'Pipe Arch', 'Slab over Masonry', 'Composite'],
      type_of_apron: ['Stone', 'Brick', 'Concrete', 'None'],
      type_of_wingwalls: ['Stone', 'Brick', 'Concrete', 'None'],
      type_of_headwalls: ['Stone', 'Brick', 'Concrete', 'None'],
      waterway_clearance: ['Choked', 'Clear'],
      condition: ['Good', 'Fair', 'Poor'],
      severity: ['Low', 'Moderate', 'High']
    },

    signboard: {
      type_of_sign_board: ['Warning', 'Informatory', 'Regulatory', 'Gantry', 'Milestone', 'RD Post'],
      side: ['Right Side', 'Median', 'Left Side', 'Both Sides'],
      condition: ['Good', 'Fair', 'Poor']
    },

    light_pole: {
      type_of_light_pole: ['Single Arm', 'Double Arms', 'Multi Arms', 'Flood Light'],
      side: ['Right Side', 'Median', 'Left Side', 'Both Sides'],
      condition: ['Good', 'Fair', 'Poor']
    },

    interchange: {
      type_of_interchange: ['Diamond', 'Partial Cloverleaf', 'Full Cloverleaf', 'Directional', 'Trumpet', 'At Grade'],
      condition: ['Good', 'Fair', 'Poor']
    },

    patch_condition: {
      condition: ['Good', 'Fair', 'Poor', 'Restaurant', 'Hotel', 'Bank', 'Petrol Pump', 'Marriage Hall', 'Kanta']
    },

    road_crossing: {
      type_of_road_crossing: ['Underpass', 'Subway', 'Cattle Creep'],
      type_of_headwalls: ['Stone', 'Brick', 'Concrete'],
      severity: ['Low', 'Moderate', 'High'],
      condition: ['Good', 'Fair', 'Poor']
    },

    toll: {
      type_of_toll: ['Barrier Only', 'Barrier with Infrastructures'],
      condition: ['Good', 'Fair', 'Poor']
    },

    drainage: {
      drain_type: [
        'Ditch Drain', 'Saucer', 'Earthen', 'PCC Open Drain',
        'PCC Cover Drain', 'RCC', 'Drain with Breast Wall'
      ],
      brest_wall_type: ['PCC', 'RCC', 'Plum', 'Stone Masonry', 'None'],
      side: ['Right Side', 'Median', 'Left Side', 'Both Sides', 'Median and Both Sides'],
      condition: ['Good', 'Fair', 'Poor']
    },

    retaining_wall: {
      type_of_retaining_wall: ['PCC', 'RCC', 'PLUM', 'Dry Stone Masonry', 'Mortar Stone Masonry'],
      has_paraphet_wall: ['Yes', 'No'], // still as dropdown? (we'll use boolean toggle from DB when true/false)
      paraphet_wall_type: ['Plum', 'PCC', 'Stone Masonry'],
      side: ['Right Side', 'Left Side', 'Both Sides'],
      condition: ['Good', 'Fair', 'Poor']
    },

    guard_rail: {
      type_of_guard_rail: ['W-Beam', 'Steel Pipes', 'Steel Ropes', 'Wooden'],
      side: ['Right Side', 'Median', 'Left Side', 'Both Sides', 'Median and Both Sides'],
      condition: ['Good', 'Fair', 'Poor']
    },

    tunnel: {
      type_of_tunnel: ['Slide Shelter', 'Hill Crossing'],
      type_of_lining: ['RCC', 'Without lining'],
      shape_of_tunnel: ['Arched Shaped', 'Rectangular Shaped', 'Circular Shaped'],
      no_of_tubes: ['1', '2', '3', '4', '5', '6', '7', '8'],
      type_of_portal: ['With Box Cut', 'Without Box Cut'],
      severity: ['Low', 'Moderate', 'High'],
      condition: ['Good', 'Fair', 'Poor']
    },

    dyke_curb_stone: {
      type_of_dyke_curb_stone: ['PCC', 'Stone'],
      side: ['Right Side', 'Median', 'Left Side', 'Both Sides', 'Median and Both Sides'],
      condition: ['Good', 'Fair', 'Poor']
    }
  };

  function getFieldMeta(sectionKey, fieldKey, rawValue) {
    const assetType = SECTION_ASSET_MAP[sectionKey] || sectionKey;
    const opts =
      (ASSET_DROPDOWN_OPTIONS[assetType] && ASSET_DROPDOWN_OPTIONS[assetType][fieldKey]) ||
      null;

    if (opts) {
      return { widget: 'select', options: opts };
    }

    if (fieldKey === 'remarks') {
      return { widget: 'textarea' };
    }

    if (typeof rawValue === 'boolean' || fieldKey.startsWith('has_') || fieldKey.startsWith('is_')) {
      return { widget: 'boolean' };
    }

    if (typeof rawValue === 'number') {
      return { widget: 'number' };
    }

    return { widget: 'text' };
  }

  // Value reader for later (handles checkbox vs others)
  function getControlValue(control) {
    if (!control) return undefined;
    if (control.tagName === 'INPUT') {
      if (control.type === 'checkbox') return !!control.checked;
      if (control.type === 'number') {
        const v = control.value.trim();
        if (v === '') return null;
        const num = Number(v);
        return Number.isNaN(num) ? v : num;
      }
      return control.value;
    }
    if (control.tagName === 'SELECT' || control.tagName === 'TEXTAREA') {
      return control.value;
    }
    return undefined;
  }

  // Build a compact horizontal bar chart from {assetType: count, ...}
  // Rules:
  //  - only show counts > 0
  //  - sort desc by count
  //  - label uses full asset name (no abbreviations)
  //  - value sits to the right of the bar, outside
  function makeCountsChart(countsObj) {
    const entries = Object.entries(countsObj || {}).filter(([, n]) => Number(n) > 0);
    if (!entries.length) return null;
    entries.sort((a, b) => Number(b[1]) - Number(a[1]));
    const maxV = Math.max(...entries.map(([, n]) => Number(n)), 1);

    // outer section
    const wrap = document.createElement('div');
    wrap.className = 'drawer-section';

    // header row: title + arrow
    const head = document.createElement('div');
    head.className = 'cs-head';

    const h = document.createElement('h4');
    h.className = 'cs-title';
    h.textContent = '🧮 Asset Counts';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-toggle';
    btn.setAttribute('aria-expanded', 'true');
    btn.textContent = '▲';

    head.appendChild(h);
    head.appendChild(btn);

    // body with the chart
    const body = document.createElement('div');
    body.className = 'cs-body';

    const chart = document.createElement('div');
    chart.className = 'bar-chart';

    entries.forEach(([assetName, count]) => {
      const row = document.createElement('div');
      row.className = 'bar-row';

      const lab = document.createElement('div');
      lab.className = 'bar-label';
      lab.innerHTML = `${assetName} <b>(${count})</b>`;
      row.appendChild(lab);

      const track = document.createElement('div');
      track.className = 'bar-track';

      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      const pct = Math.round((Number(count) / maxV) * 100);
      requestAnimationFrame(() => { fill.style.width = `${pct}%`; });

      track.appendChild(fill);
      row.appendChild(track);
      chart.appendChild(row);
    });

    body.appendChild(chart);

    // toggle behavior
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      btn.textContent = open ? '▼' : '▲';
      body.hidden = open;
    });

    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

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

  // --- Pointer (red downward arrow) decoration over the selected marker ---
  let _pointerCopy = null;

  function clearPointer() {
    if (_pointerCopy) {
      try { prioritySource.removeFeature(_pointerCopy); } catch {}
      _pointerCopy = null;
    }
  }

  function makePointerArrowStyle() {
    // A small triangle pointing DOWN, displaced above the marker’s label
    return new ol.style.Style({
      image: new ol.style.RegularShape({
        points: 3,                  // triangle
        radius: 9,                  // size of pointer head
        fill:  new ol.style.Fill({ color: '#ef4444' }),  // red
        stroke:new ol.style.Stroke({ color: '#ffffff', width: 2 }), // white border
        rotation: Math.PI,           // 180° so it points DOWN
        displacement: [0, -33]
      }),
      // Lift the arrow above the marker/label (negative Y = up in OL screen space)
      zIndex: 100
    });
  }

  /**
   * Place the pointer arrow *over* a specific POINT-like feature.
   * We render a copy in `priorityLayer` so it’s always-on-top and not decluttered.
   */
  function decorateWithPointerArrow(pointFeature) {
    clearPointer();

    const geom = pointFeature?.getGeometry?.();
    if (!(geom instanceof ol.geom.Point)) return;

    const copy = new ol.Feature({ geometry: geom });

    // Respect current visual (badge / dot / label) and simply overlay the arrow
    const base = pointFeature.getStyle?.();
    const baseArr = Array.isArray(base) ? base : (base ? [base] : []);
    copy.setStyle([...baseArr, makePointerArrowStyle()]);

    prioritySource.addFeature(copy);
    _pointerCopy = copy;
  }

  // --- Animated edit ring around editable markers (Edit mode only) ---
  function stopEditHighlight() {
    if (editHighlightTimer) {
      clearInterval(editHighlightTimer);
      editHighlightTimer = null;
    }
    if (editHighlightFeature) {
      try { editHighlightSource.removeFeature(editHighlightFeature); } catch {}
      editHighlightFeature = null;
    }
    editHighlightSource.clear();
  }

  /**
   * Show a pulsing red ring around all editable markers (start/end/point)
   * without changing their original style. This uses a MultiPoint feature
   * rendered in a dedicated layer.
   *
   * @param {ol.Feature[]} targetFeatures - point-like features currently editable
   */
  function startEditHighlight(targetFeatures) {
    stopEditHighlight();

    const feats = (targetFeatures || []).filter(f => {
      const g = f && f.getGeometry && f.getGeometry();
      return g instanceof ol.geom.Point;
    });
    if (!feats.length) return;

    // initial coords
    const coords = feats
      .map(f => f.getGeometry().getCoordinates())
      .filter(Boolean);

    if (!coords.length) return;

    const geom = (coords.length === 1)
      ? new ol.geom.Point(coords[0])
      : new ol.geom.MultiPoint(coords);

    editHighlightFeature = new ol.Feature({ geometry: geom });
    editHighlightSource.addFeature(editHighlightFeature);

    let radius = 10;
    let growing = true;

    editHighlightTimer = setInterval(() => {
      if (!editHighlightFeature) return;

      // 🔁 keep ring geometry in sync with live features
      const liveCoords = feats
        .map(f => {
          const g = f && f.getGeometry && f.getGeometry();
          return g && g.getCoordinates && g.getCoordinates();
        })
        .filter(Boolean);

      if (liveCoords.length) {
        const g = editHighlightFeature.getGeometry();
        if (g instanceof ol.geom.Point && liveCoords.length === 1) {
          g.setCoordinates(liveCoords[0]);
        } else if (g instanceof ol.geom.MultiPoint && liveCoords.length > 1) {
          g.setCoordinates(liveCoords);
        }
      }

      // radius pulsing (same as before)
      radius += growing ? 0.6 : -0.6;
      if (radius >= 20) growing = false;
      if (radius <= 10) growing = true;

      const style = new ol.style.Style({
        image: new ol.style.Circle({
          radius,
          fill: new ol.style.Fill({ color: 'rgba(239,68,68,0.10)' }),
          stroke: new ol.style.Stroke({ color: '#ef4444', width: 2 })
        }),
        zIndex: 90
      });

      editHighlightFeature.setStyle(style);
    }, 45);
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

  function clearMap() {
    pointsSource.clear();
    linesSource.clear();
    clearSelectedCopies();
    clearPointer();  
    prioritySource.clear();
  }

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
      const roadLength = r.road_length ?? r.roadLength ?? r.length ?? r.road_len ?? null;
      const start_lat = r.start_lat ?? r.startLat ?? r.start_latitude ?? r.start_latitude_deg ?? null;
      const start_lon = r.start_lon ?? r.startLon ?? r.start_longitude ?? r.start_longitude_deg ?? null;
      const end_lat   = r.end_lat ?? r.endLat ?? r.end_latitude ?? r.end_latitude_deg ?? null;
      const end_lon   = r.end_lon ?? r.endLon ?? r.end_longitude ?? r.end_longitude_deg ?? null;
      return `
       <label class="check" data-name="${(r.name||'').toLowerCase()}">
        <input type="checkbox" value="${id}"
               data-road-length="${roadLength ?? ''}"
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
  function getRoadNameFromCheckbox(cb) {
    const labelEl = cb.closest('label.check');
    const span = labelEl ? labelEl.querySelector('span') : null;
    return span ? span.textContent.trim() : '';
  }
  function formatRoadKm(value) {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.round(value * 1000) / 1000;
    return rounded.toFixed(3).replace(/\.?0+$/, '');
  }
  function updateRoadsTotalLabel() {
    if (!roadsTotal) return;
    const total = getSelectedRoadCheckboxes().reduce((sum, cb) => {
      const val = parseFloat(cb.dataset.roadLength);
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);
    if (!total) {
      roadsTotal.textContent = '';
      return;
    }
    const formatted = formatRoadKm(total);
    roadsTotal.textContent = formatted ? `(${formatted} Km)` : '';
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
    updateRoadsTotalLabel();
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
    if (!isStickSelectionOn()) {
      clearMap();
    }

    const district = districtSel.value;
    const roadCbs  = getSelectedRoadCheckboxes();
    const roadIds  = roadCbs.map(cb => cb.value);
    const roadNameById = new Map();
    const selectedRoadsPayload = roadCbs.map(cb => {
      const sLat = parseFloat(cb.dataset.startLat), sLon = parseFloat(cb.dataset.startLon);
      const eLat = parseFloat(cb.dataset.endLat),   eLon = parseFloat(cb.dataset.endLon);
      const lengthKm = parseFloat(cb.dataset.roadLength);
      const roadName = getRoadNameFromCheckbox(cb);
      const record = {
        id: cb.value,
        name: roadName,
        length_km: Number.isFinite(lengthKm) ? lengthKm : null,
        start_lat: Number.isFinite(sLat) ? sLat : null,
        start_lon: Number.isFinite(sLon) ? sLon : null,
        end_lat: Number.isFinite(eLat) ? eLat : null,
        end_lon: Number.isFinite(eLon) ? eLon : null,
        district: district || ''
      };
      roadNameById.set(String(cb.value), roadName);
      return record;
    });
    let assetsPayload = [];

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
      const assetsData = data.assets || [];
      assetsPayload = assetsData.map(a => ({
        ...a,
        road_name: a.road_id ? (roadNameById.get(String(a.road_id)) || '') : '',
      }));

      // Expect: assets: array of records:
      // { kind:'point', lon, lat, label }
      // { kind:'line', start_lon, start_lat, end_lon, end_lat, label }
      assetsData.forEach(a => {
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
          // Asset POINT feature, linked to its own asset id/type only
          const typeKey = String(a.label || '').toLowerCase();
          addPoint(a.lon, a.lat, {
            color: '#7c3aed',
            label: short,
            id: a.id,
            feature_type: 'asset',
            road_id: a.road_id || null,
            asset_kind: 'point',
            asset_type: typeKey || null
          });
        } else if (a.kind === 'line') {
          // Asset LINE feature and its endpoints, all linked to the same asset id/type
          const typeKey = String(a.label || '').toLowerCase();
          addLine(a.start_lon, a.start_lat, a.end_lon, a.end_lat, {
            label: a.label || '',
            id: a.id,
            road_id: a.road_id || null,
            asset_type: typeKey || null
          });
        }
      });

    }

    if (window.SelectionTable) {
      let snapshotPayload = null;
      try {
        const snapUrl = new URL(location.origin + "/api/selection/snapshot/");
        if (district) snapUrl.searchParams.set("district", district);
        if (roadIds.length) snapUrl.searchParams.set("road_ids", roadIds.join(','));
        snapUrl.searchParams.set("types", typesParam);
        const snapRes = await fetch(snapUrl);
        if (snapRes.ok) {
          snapshotPayload = await snapRes.json();
          window.SelectionTable.setSnapshot(snapshotPayload);
        } else {
          console.warn("[selection-table] snapshot request failed:", snapRes.status);
        }
      } catch (err) {
        console.warn("[selection-table] snapshot fetch error:", err);
      }

      if (!snapshotPayload) {
        // Fallback to the lighter client-built snapshot
        if (selectedRoadsPayload.length) {
          window.SelectionTable.setSelection({
            district: { code: district || '', name: districtNameByCode(district) },
            roads: selectedRoadsPayload,
            assets: assetsPayload
          });
        } else {
          window.SelectionTable.clearSelection();
        }
      }
    }

    fitAll();
    // Close panels for a clean feel
    roadsPanel.setAttribute("aria-hidden","true");
    assetsPanel.setAttribute("aria-hidden","true");
    roadsTrigger.setAttribute("aria-expanded","false");
    assetsTrigger.setAttribute("aria-expanded","false");
  });

  btnReset.addEventListener('click', () => {
    // Always reset filter controls
    districtSel.value = "";
    renderRoadsList([]);
    roadsSearch.value = "";

    // assets -> reset to none
    assetsPanel.querySelector('input[name="asset_mode"][value="none"]').checked = true;
    setAssetsUIByMode('none');
    assetsList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

    const stickOn = isStickSelectionOn();

    if (window.SelectionTable) {
      window.SelectionTable.clearSelection();
    }

    // Only clear map and recenter when "stick" is OFF
    if (!stickOn) {
      clearMap();
      map.getView().setCenter(ol.proj.fromLonLat([71.5, 34.0]));
      map.getView().setZoom(7);
    }

    // Always close the drawer visually
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
    // in case the panel starts open due to server-side rendering or saved state
    syncFiltersHeightVar();    
    populateDistricts();
    renderAssetsList();
    setAssetsUIByMode('none');
    if (window.SelectionTable && typeof window.SelectionTable.init === 'function') {
      window.SelectionTable.init();
    }

    // --- Custom layers section (Add Layer button + chips container) ----------
    // We build this HTML here so layers.js can just query:
    //   #btn-add-layer  -> opens the upload modal
    //   #layer-toggles  -> where per-layer chips are rendered
    if (mapLayersPanel && !document.getElementById('layer-toggles')) {
      const section = document.createElement('div');
      section.className = 'map-layers-section map-layers-section--custom';

      const head = document.createElement('div');
      head.className = 'map-layers-section-head';

      const title = document.createElement('div');
      title.className = 'map-layers-section-title';
      title.textContent = 'Custom layers';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.id = 'btn-add-layer';
      addBtn.className = 'layer-chip';
      addBtn.textContent = '＋ Add layer';

      head.appendChild(title);
      head.appendChild(addBtn);

      const list = document.createElement('div');
      list.id = 'layer-toggles';
      list.className = 'layer-toggles';

      section.appendChild(head);
      section.appendChild(list);

      // Append after any existing content (e.g. basemap controls)
      mapLayersPanel.appendChild(section);
    }

    // Roads refresh when district changes
    districtSel.addEventListener('change', () => loadRoadsByDistrict(districtSel.value));

    // Drawer controls (no overlay; we squeeze map by toggling a body class)
    const drawer = document.getElementById('detail-drawer');
    const drawerTitle = document.getElementById('drawer-title');
    const drawerBody = document.getElementById('drawer-body');
    const drawerClose = document.getElementById('drawer-close');
    // --- One-time CSS for edit mode (drawer form) ---
    function ensureDrawerEditStyles() {
      if (document.getElementById('drawer-edit-css')) return;
      const css = document.createElement('style');
      css.id = 'drawer-edit-css';
      css.textContent = `
        .drawer-edit {
          margin-top: 10px;
        }

        /* Toggle: more rectangular, primary blue for active */
        .edit-toggle {
          display: flex;
          margin-bottom: 10px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #d1d5db;
          background: #ffffff;
        }
        .edit-toggle button {
          flex: 1 1 0;
          padding: 8px 12px;
          border: 0;
          background: #ffffff;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          color: #111827;
        }
        .edit-toggle button.is-active {
          background: #2563eb;   /* primary blue */
          color: #ffffff;
        }
        .edit-toggle button:not(.is-active):hover {
          background: #e5e7eb;
        }

        /* Edit grid: two fields per row where possible */
        .edit-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 16px;
        }
        .edit-field {
          flex: 1 1 calc(50% - 8px);
          min-width: 180px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .edit-field label {
          font-size: 13px;
          color: #4b5563;
        }
        .edit-field label.field-label-dirty {
          font-weight: 700;
          color: #b91c1c;
        }
        .edit-field label.field-label-dirty::after {
          content: " *";
        }
        /* Inputs, dropdowns, text areas all share the same styling */
        .edit-field input,
        .edit-field select,
        .edit-field textarea {
          padding: 6px 8px;
          border-radius: 6px;
          border: 1px solid #d1d5db;
          font-size: 13px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background-color: #ffffff;
        }

        /* Consistent focus ring for all controls */
        .edit-field input:focus,
        .edit-field select:focus,
        .edit-field textarea:focus {
          outline: none;
          border-color: #111827;
          box-shadow: 0 0 0 1px rgba(17,24,39,0.4);
        }

        /* Disabled state */
        .edit-field input[disabled],
        .edit-field select[disabled],
        .edit-field textarea[disabled] {
          background: #f9fafb;
          color: #9ca3af;
          cursor: default;
        }

        /* Make textarea slightly taller and prevent crazy resize */
        .edit-field textarea {
          min-height: 70px;
          resize: vertical;
        }

        /* Optional: narrower dropdown arrow and align text nicely */
        .edit-field select {
          padding-right: 28px;
        }

        /* Cleaning Status dropdown colour hints */
        .cleaning-status-select.status--pending {
          background-color: #fefce8; /* soft yellow */
          border-color: #facc15;
        }
        .cleaning-status-select.status--good {
          background-color: #dcfce7; /* light green */
          border-color: #16a34a;
        }
        .cleaning-status-select.status--bad {
          background-color: #fee2e2; /* light red */
          border-color: #f97316;
        }

        .edit-field input.field-coord-dirty {
          background: #fef2f2;
          border-color: #b91c1c;
        }

        /* Lat/Lon readonly style + hint */
        .edit-field input.field-coord-readonly {
          opacity: 0.6;
        }
        .coord-hint {
          margin-top: 2px;
          font-size: 10px; /* smaller hint text */
          color: #6b7280;
        }

        /* View vs Edit visibility */
        .drawer-edit[data-mode="view"] .edit-grid {
          display: none;
        }
        .drawer-edit[data-mode="edit"] .kv-view {
          display: none;
        }

        /* NEW: View mode → 2 fields per row, clean layout */
        .drawer-edit .kv-view {
          width: 100%;
          display: flex;
          flex-wrap: wrap;
          gap: 5px 8px;          /* spacing between cells */
          margin-top: 2px;
        }

        .drawer-edit .kv-view tr {
          flex: 1 1 calc(50% - 8px);   /* 2 per row */
          min-width: 180px;
          display: flex;
          flex-direction: column;
          padding: 2px 0;
          border-bottom: 1px solid #e5e7eb;
        }

        .drawer-edit .kv-view tr:last-child {
          border-bottom: none;
        }

        .drawer-edit .kv-view th {
          display: block;
          font-size: 13px;
          font-weight: 700;            /* stronger header */
          color: #1f2937;              /* darker heading */
          margin-bottom: 2px;
          white-space: normal;
        }

        .drawer-edit .kv-view td {
          display: block;
          font-size: 13px;
          color: #111827;
          word-break: break-word;
        }

        /* Boolean toggle switch */
        .toggle-wrapper {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .toggle-switch {
          position: relative;
          width: 34px;
          height: 18px;
        }
        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .toggle-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background-color: #d1d5db;
          border-radius: 999px;
          transition: 0.2s;
        }
        .toggle-slider::before {
          content: "";
          position: absolute;
          height: 14px;
          width: 14px;
          left: 2px;
          top: 2px;
          background-color: white;
          border-radius: 999px;
          transition: 0.2s;
        }
        .toggle-switch input:checked + .toggle-slider {
          background-color: #2563eb;
        }
        .toggle-switch input:checked + .toggle-slider::before {
          transform: translateX(16px);
        }
                /* Divider before cleaning status section */
        .edit-cleaning-divider {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 12px 0 10px;
        }

        /* Cleaning status row: dropdown + button side by side */
        .edit-cleaning-row {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          flex-wrap: nowrap;      /* keep them on the same row */
          margin-top: 4px;
        }

        .edit-cleaning-row .edit-field--cleaning-status {
          flex: 1 1 auto;          /* status select grows */
          margin-bottom: 0;
        }

        /* Make sure the button does NOT stretch / wrap */
        .edit-cleaning-row .edit-push-btn {
          flex: 0 0 auto;
        }

        /* Primary "Push Changes" button */
        .edit-push-btn {
          padding: 8px 16px;
          border-radius: 4px;      /* less rounded */
          border: none;
          background: #2563eb;
          color: #ffffff;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgba(15,23,42,0.12);
        }
        .edit-push-btn:hover {
          background: #1d4ed8;
        }
        .edit-push-btn:disabled {
          opacity: 0.6;
          cursor: default;
          box-shadow: none;
        }

      `;
      document.head.appendChild(css);
    }

    ensureDrawerEditStyles();

    function openDrawer(title, nodeOrHTML, opts = {}) {
      if (!drawer || !drawerTitle || !drawerBody) {
        console.warn('Drawer elements not found; showing console-only data.');
        return; // don’t throw; still allow highlight to work
      }
      // Build title + tiny id subtitle
      drawerTitle.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'drawer-title-wrap';
      const titleRow = document.createElement('div');
      titleRow.className = 'drawer-title-row';
      const h = document.createElement('div');
      h.textContent = title || 'Details';
      titleRow.appendChild(h);
      if (opts && opts.status) {
        titleRow.appendChild(makeStatusChip(opts.status));
      }
      const metaCol = document.createElement('div');
      // ID line
      if (opts && opts.id != null) {
        const sub = document.createElement('div');
        sub.className = 'drawer-subid';
        const idText = String(opts.id);
        sub.innerHTML = `ID: <code>${idText}</code>`;
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'copy-id-btn';
        copy.textContent = '📋';
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(idText);
            copy.textContent = '📋 ✓';
            setTimeout(()=>copy.textContent='📋', 1200);
          } catch {}
        });
        sub.appendChild(copy);
        metaCol.appendChild(sub);
      }
      // District line (no copy), shown when provided
      if (opts && opts.district != null) {
        const sub2 = document.createElement('div');
        sub2.className = 'drawer-subid';
        sub2.innerHTML = `District: <code>${String(opts.district)}</code>`;
        metaCol.appendChild(sub2);
      }
      wrap.appendChild(titleRow);
      if (metaCol.childNodes.length) wrap.appendChild(metaCol);
      drawerTitle.appendChild(wrap);
      drawerBody.innerHTML = '';
      if (typeof nodeOrHTML === 'string') {
        drawerBody.innerHTML = nodeOrHTML;
      } else if (nodeOrHTML instanceof Node) {
        drawerBody.appendChild(nodeOrHTML);
      }
      drawer.setAttribute('aria-hidden', 'false');
      drawer.classList.add('open');
      document.body.classList.add('drawer-open');
      // ensure map resizes with the drawer gap and current filters height
      setTimeout(() => { syncFiltersHeightVar(); map.updateSize(); }, 280);
    }
    function closeDrawer() {
      drawer.setAttribute('aria-hidden', 'true');
      drawer.classList.remove('open');
      document.body.classList.remove('drawer-open');
      setTimeout(() => map.updateSize(), 280);
    }
    if (drawerClose) drawerClose.addEventListener('click', closeDrawer);

    // Keys we never repeat in the "Details" table (shown elsewhere: gallery/metadata/header)
    const HIDE_IN_DETAILS = new Set([
      'id','pics','images','image_urls','photos',
      'created_at','updated_at','created_by','updated_by',
      'road','kind','type','model',
      'district','district_code','district_name'
    ]);

    // Helpers to render JSON table quickly
    function objToTable(obj, extraSkip = []) {
      const tbl = document.createElement('table');
      tbl.className = 'kv';
      const SKIP = new Set([...HIDE_IN_DETAILS, ...extraSkip]);
      Object.entries(obj || {}).forEach(([k,v]) => {
        if (SKIP.has(k)) return;
        const tr = document.createElement('tr');
        const th = document.createElement('th'); th.textContent = k;
        const td = document.createElement('td'); td.textContent = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
        tr.appendChild(th); tr.appendChild(td);
        tbl.appendChild(tr);
      });
      return tbl;
    }

    const CLEANING_STATUS_MAP = {
      pending: { label: 'Pending', icon: '⚠️' },
      good: { label: 'Good', icon: '✅' },
      bad: { label: 'Bad', icon: '⛔' }
    };

    function parseCleaningStatus(remarks) {
      // raw DB string
      const raw = remarks == null ? '' : String(remarks);
      const trimmed = raw.trimStart();
    
      // No leading {{...}} block → default pending, full text editable
      if (!trimmed.startsWith('{{')) {
        return { status: 'pending', text: raw };
      }
    
      const endIdx = trimmed.indexOf('}}');
      if (endIdx === -1) {
        return { status: 'pending', text: raw };
      }
    
      const block = trimmed.slice(2, endIdx).trim();
      const match = block.match(/status\s*:\s*(pending|good|bad)/i);
    
      const after = trimmed.slice(endIdx + 2);
      // strip a single run of whitespace between block and text
      const afterStripped = after.replace(/^\s*/, '');
    
      // restore original leading whitespace from before the {{
      const leadingLen = raw.length - trimmed.length;
      const leading = raw.slice(0, leadingLen);
    
      const text = leading + afterStripped;
      const status = match ? match[1].toLowerCase() : 'pending';
    
      return { status, text };
    }

    function makeStatusChip(statusKey) {
      const cfg = CLEANING_STATUS_MAP[statusKey] || CLEANING_STATUS_MAP.pending;
      const chip = document.createElement('span');
      chip.className = `status-chip status-chip--${(statusKey || 'pending')}`;
      chip.textContent = `${cfg.icon} ${cfg.label}`;
      return chip;
    }

    function revertActiveEditorGeom() {
      const ed = ACTIVE_EDITOR;
      // If there is no active editor or nothing is actually dirty anymore,
      // do not revert geometry – this lets *saved* positions become the new baseline.
      if (!ed || !ed.geomBindings) return;
      if (!ed.dirtyKeys || ed.dirtyKeys.size === 0) return;

      const { geomBindings, inputsByKey, labelsByKey, dirtyKeys } = ed;

      ['point', 'start', 'end'].forEach((key) => {
        const b = geomBindings[key];
        if (!b || !b.feature || !b.initialCoord) return;

        const g = b.feature.getGeometry && b.feature.getGeometry();
        if (g && g.setCoordinates) {
          // avoid marking dirty for this revert sync
          b._suppressDirtyOnce = true;
          g.setCoordinates(b.initialCoord.slice());
        }

        // Reset marker style back to normal (but does NOT touch road highlight copies)
        styleByFeatureReset(b.feature);

        const { latKey, lonKey } = b;

        if (latKey && inputsByKey[latKey]) {
          const inp = inputsByKey[latKey];
          const lbl = labelsByKey[latKey];
          inp.classList.remove('field-coord-dirty');
          lbl && lbl.classList.remove('field-label-dirty');
          dirtyKeys.delete(latKey);
        }
        if (lonKey && inputsByKey[lonKey]) {
          const inp = inputsByKey[lonKey];
          const lbl = labelsByKey[lonKey];
          inp.classList.remove('field-coord-dirty');
          lbl && lbl.classList.remove('field-label-dirty');
          dirtyKeys.delete(lonKey);
        }
      });

      // NEW: also revert line geometry for line-type assets
      if (geomBindings.line && geomBindings.start && geomBindings.end) {
        const line   = geomBindings.line;
        const sFeat  = geomBindings.start.feature;
        const eFeat  = geomBindings.end.feature;

        if (line && sFeat && eFeat) {
          const sg = sFeat.getGeometry && sFeat.getGeometry();
          const eg = eFeat.getGeometry && eFeat.getGeometry();

          if (sg && eg && sg.getCoordinates && eg.getCoordinates) {
            const lineGeom = line.getGeometry && line.getGeometry();
            if (lineGeom && lineGeom.setCoordinates) {
              // line back to the coordinates of reverted endpoints
              lineGeom.setCoordinates([
                sg.getCoordinates(),
                eg.getCoordinates()
              ]);
            }
          }
        }
      }
      // Ensure the Push Changes button is disabled if nothing is dirty any more
      if (ed.root && typeof ed.root.__syncPushButton === 'function') {
        ed.root.__syncPushButton();
      }
    }

    // --- View/Edit section builder (generic) -------------------------------
    function buildViewEditSection(kind, record, {
      extraSkip = [],
      geomBindings = null,   // { start:{latKey,lonKey,feature}, end:{...}, point:{...} }
      id = null
    } = {}) {
      const root = document.createElement('div');
      root.className = 'drawer-edit';
      root.dataset.mode = EDIT_MODE || 'view';
      let currentMode = EDIT_MODE || 'view';

      // Toggle bar
      const toggle = document.createElement('div');
      toggle.className = 'edit-toggle';
      const btnView = document.createElement('button');
      const btnEdit = document.createElement('button');
      btnView.type = btnEdit.type = 'button';
      btnView.textContent = 'View Mode';
      btnEdit.textContent = 'Edit Mode';
      toggle.appendChild(btnView);
      toggle.appendChild(btnEdit);

      // View table (reusing kv table)
      const viewTable = objToTable(record, extraSkip);
      viewTable.classList.add('kv-view');

      // Map "raw key" -> <td> cell so we can update the View table
      // after a successful save without refetching from the backend.
      const viewCellsByKey = {};
      [...viewTable.querySelectorAll('tr')].forEach((tr) => {
        const th = tr.querySelector('th');
        const td = tr.querySelector('td');
        if (!th || !td) return;
        const key = th.textContent.trim();
        if (!key) return;
        viewCellsByKey[key] = td;
      });

      // Edit grid
      const grid = document.createElement('div');
      grid.className = 'edit-grid';

      const SKIP = new Set([...HIDE_IN_DETAILS, ...extraSkip]);

      // Decide which asset "section" we are in for dropdown metadata
      const sectionKey =
        kind === 'road'
          ? 'road'
          : (record.type || record.asset_type || '').toString().toLowerCase();

      const original = {};      // stringified original values
      const inputsByKey = {};
      const labelsByKey = {};
      const dirtyKeys = new Set();
      const STATUS_KEY = '__cleaning_status';
      
      // Build kvPairs from record (label + value) while respecting SKIP
      const kvPairs = {};
      Object.entries(record || {}).forEach(([key, value]) => {
        if (SKIP.has(key)) return;
        const niceLabel = key
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
      
        let displayValue = value;
      
        // For remarks, strip out the {{status:*}} block from what the user edits
        if (key === 'remarks') {
          const parsed = parseCleaningStatus(value);
          displayValue = parsed.text ?? value;
        }
      
        kvPairs[key] = { label: niceLabel, value: displayValue };
        original[key] = displayValue == null ? '' : String(displayValue);
      });
          
    

      // Build edit fields
      Object.entries(kvPairs).forEach(([key, { label, value }]) => {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'edit-field';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        fieldDiv.appendChild(labelEl);
        labelsByKey[key] = labelEl;

        const meta = getFieldMeta(sectionKey, key, value);

        let control;

        if (meta.widget === 'select') {
          const select = document.createElement('select');
          select.className = 'edit-select';
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = '-- select --';
          placeholder.disabled = true;
          if (value == null || value === '') placeholder.selected = true;
          select.appendChild(placeholder);

          meta.options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (String(value) === String(opt)) o.selected = true;
            select.appendChild(o);
          });

          control = select;
        } else if (meta.widget === 'boolean') {
          const wrapper = document.createElement('div');
          wrapper.className = 'toggle-wrapper';

          const lbl = document.createElement('label');
          lbl.className = 'toggle-switch';

          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = !!value;

          const slider = document.createElement('span');
          slider.className = 'toggle-slider';

          lbl.appendChild(input);
          lbl.appendChild(slider);
          wrapper.appendChild(lbl);

          fieldDiv.appendChild(wrapper);
          grid.appendChild(fieldDiv);
          control = input;
          inputsByKey[key] = control;

          const dirtyHandler = () => updateDirtyState(key);
          control.addEventListener('change', dirtyHandler);
          return; // done for this field
        } else if (meta.widget === 'textarea') {
          const textarea = document.createElement('textarea');
          textarea.rows = 3;
          textarea.value = value == null ? '' : String(value);
          control = textarea;
        } else {
          const input = document.createElement('input');
          input.type = meta.widget === 'number' ? 'number' : 'text';
          input.value = value == null ? '' : String(value);
          control = input;
        }

        fieldDiv.appendChild(control);
        grid.appendChild(fieldDiv);
        inputsByKey[key] = control;

        const dirtyHandler = () => updateDirtyState(key);

        if (control.tagName === 'INPUT' || control.tagName === 'TEXTAREA') {
          control.addEventListener('input', dirtyHandler);
        } else if (control.tagName === 'SELECT') {
          control.addEventListener('change', dirtyHandler);
        }
      });

      // --- Cleaning Status section & Push Changes button ---

      // Derive initial cleaning status from the ORIGINAL remarks
      const initialRemarksRaw = (record && record.remarks) || '';
      const { status: initialCleaningStatus } = parseCleaningStatus(initialRemarksRaw);

      // Divider line
      const divider = document.createElement('hr');
      divider.className = 'edit-cleaning-divider';
      grid.appendChild(divider);

      // Row that holds dropdown + button
      const statusRow = document.createElement('div');
      statusRow.className = 'edit-cleaning-row';

      // Cleaning Status field
      const statusField = document.createElement('div');
      statusField.className = 'edit-field edit-field--cleaning-status';

      const statusLabel = document.createElement('label');
      statusLabel.textContent = 'Cleaning Status';
      statusField.appendChild(statusLabel);
      labelsByKey.__cleaning_status = statusLabel;

      const statusSelect = document.createElement('select');
      statusSelect.className = 'edit-select cleaning-status-select';

      ['pending', 'good', 'bad'].forEach((key) => {
        const opt = document.createElement('option');
        opt.value = key;
        const cfg = CLEANING_STATUS_MAP[key] || { label: key };
        opt.textContent = cfg.label;
        statusSelect.appendChild(opt);
      });

      statusSelect.value = initialCleaningStatus || 'pending';
      statusField.appendChild(statusSelect);

      // Track in our editor maps
      inputsByKey.__cleaning_status = statusSelect;
      original.__cleaning_status = initialCleaningStatus || 'pending';

      function syncStatusSelectClass() {
        statusSelect.classList.remove(
          'status--pending',
          'status--good',
          'status--bad'
        );
        const v = statusSelect.value || 'pending';
        statusSelect.classList.add(`status--${v}`);
      }
      syncStatusSelectClass();

      statusSelect.addEventListener('change', () => {
        syncStatusSelectClass();
        updateDirtyState('__cleaning_status');
      });

      statusRow.appendChild(statusField);

      // "Push Changes" primary button
      const pushBtn = document.createElement('button');
      pushBtn.type = 'button';
      pushBtn.className = 'edit-push-btn';
      pushBtn.textContent = 'Push Changes';
      pushBtn.disabled = true; // default: disabled until something is dirty

      // Helper to enable/disable based on dirtyKeys
      function syncPushButton() {
        pushBtn.disabled = dirtyKeys.size === 0;
      }

      // Expose so outer helpers (e.g., revertActiveEditorGeom) can call it
      root.__syncPushButton = syncPushButton;

      // expose for debugging if you still want it
      root.__pushChangesButton = pushBtn;

      statusRow.appendChild(pushBtn);

      grid.appendChild(statusRow);

      // Compare against original values using getControlValue()
      function updateDirtyState(key) {
        const control = inputsByKey[key];
        const label = labelsByKey[key];
        if (!control || !label) return;

        const cur = getControlValue(control);
        const curStr = cur == null ? '' : String(cur);
        const origStr = original[key] ?? '';

        const isDirty = curStr !== origStr;

        if (isDirty) {
          dirtyKeys.add(key);
          label.classList.add('field-label-dirty');
        } else {
          dirtyKeys.delete(key);
          label.classList.remove('field-label-dirty');
        }
        // keep the Push Changes button in sync
        if (typeof root.__syncPushButton === 'function') {
          root.__syncPushButton();
        }
      }

      root.appendChild(toggle);
      root.appendChild(viewTable);
      root.appendChild(grid);

      // --- Geometry sync (fields <-> markers) ------------------------------
      const geomListeners = [];
      function bindGeomField(binding) {
        if (!binding) return;
        const { latKey, lonKey, feature } = binding;
        if (!feature || !latKey || !lonKey) return;

        const latInput = inputsByKey[latKey];
        const lonInput = inputsByKey[lonKey];
        if (!latInput || !lonInput) return;

        // mark as coord fields
        latInput.classList.add('field-coord');
        lonInput.classList.add('field-coord');

        // Lat/Lon are marker-controlled: read-only but selectable
        latInput.readOnly = true;
        lonInput.readOnly = true;
        latInput.classList.add('field-coord-readonly');
        lonInput.classList.add('field-coord-readonly');

        // Store the original geometry so we can revert on cancel
        const geom = feature.getGeometry && feature.getGeometry();
        binding.initialCoord =
          geom && geom.getCoordinates ? geom.getCoordinates().slice() : null;

        // Internal flags to control dirty behaviour
        binding._firstSynced = false;
        binding._suppressDirtyOnce = false;

        // Tiny hints below BOTH latitude & longitude fields
        const hintText = 'Move the map marker to change this location.';
        const latField = latInput.closest('.edit-field');
        if (latField && !latField.querySelector('.coord-hint')) {
          const hint = document.createElement('div');
          hint.className = 'coord-hint';
          hint.textContent = hintText;
          latField.appendChild(hint);
        }
        const lonField = lonInput.closest('.edit-field');
        if (lonField && !lonField.querySelector('.coord-hint')) {
          const hint = document.createElement('div');
          hint.className = 'coord-hint';
          hint.textContent = hintText;
          lonField.appendChild(hint);
        }

        // Marker → fields (dragging marker updates coords)
        function updateInputsFromFeature() {
          const g = feature.getGeometry && feature.getGeometry();
          if (!g || !(g instanceof ol.geom.Point)) return;

          const [lon, lat] = ol.proj.toLonLat(g.getCoordinates());
          const latVal = lat.toFixed(6);
          const lonVal = lon.toFixed(6);

          const changed =
            latInput.value !== latVal || lonInput.value !== lonVal;

          if (!changed) return;

          latInput.value = latVal;
          lonInput.value = lonVal;

          // First sync OR specially-suppressed sync → NO dirty state
          if (!binding._firstSynced || binding._suppressDirtyOnce) {
            binding._firstSynced = true;
            binding._suppressDirtyOnce = false;
            latInput.classList.remove('field-coord-dirty');
            lonInput.classList.remove('field-coord-dirty');
            const latLbl = labelsByKey[latKey];
            const lonLbl = labelsByKey[lonKey];
            latLbl && latLbl.classList.remove('field-label-dirty');
            lonLbl && lonLbl.classList.remove('field-label-dirty');
            dirtyKeys.delete(latKey);
            dirtyKeys.delete(lonKey);
            return;
          }

          // Real user drag after first sync → mark dirty
          latInput.classList.add('field-coord-dirty');
          lonInput.classList.add('field-coord-dirty');
          updateDirtyState(latKey);
          updateDirtyState(lonKey);
          // 🔁 If this asset has a line feature (line-type asset),
          // keep its LineString in sync with the S/E endpoints.
          if (geomBindings && geomBindings.line && (geomBindings.start || geomBindings.end)) {
            const line = geomBindings.line;
            const sFeat = geomBindings.start && geomBindings.start.feature;
            const eFeat = geomBindings.end && geomBindings.end.feature;

            if (line && sFeat && eFeat) {
              const sg = sFeat.getGeometry && sFeat.getGeometry();
              const eg = eFeat.getGeometry && eFeat.getGeometry();
              if (sg && eg && sg.getCoordinates && eg.getCoordinates) {
                const sCoord = sg.getCoordinates();
                const eCoord = eg.getCoordinates();
                const lineGeom = line.getGeometry && line.getGeometry();
                if (lineGeom && lineGeom.setCoordinates) {
                  lineGeom.setCoordinates([sCoord, eCoord]);
                }
              }
            }
          }
        }

        const changeKey = feature.on('change', updateInputsFromFeature);
        geomListeners.push({ feature, changeKey });

        // Initial sync from current marker position (no dirty flag)
        updateInputsFromFeature();
        binding._firstSynced = true;
      }

      if (geomBindings) {
        if (geomBindings.point) bindGeomField(geomBindings.point);
        if (geomBindings.start) bindGeomField(geomBindings.start);
        if (geomBindings.end) bindGeomField(geomBindings.end);
      }


      // --- Hook into global ACTIVE_EDITOR ----------------------------------
      ACTIVE_EDITOR = {
        kind,
        id,
        record,
        root,
        toggle: { btnView, btnEdit },
        viewTable,
        viewCellsByKey,
        grid,
        inputsByKey,
        labelsByKey,
        original,
        dirtyKeys,
        geomBindings,
        geomListeners,
      };

      function setMode(mode) {
        const prevMode = currentMode;
        currentMode = mode;
        EDIT_MODE = mode;
        root.dataset.mode = mode;
        const isView = mode === 'view';

        btnView.classList.toggle('is-active', isView);
        btnEdit.classList.toggle('is-active', !isView);

        // enable/disable inputs
        Object.values(inputsByKey).forEach((inp) => {
          inp.disabled = isView;
        });

        // Always reset editableFeatures before reconfiguring
        editableFeatures.clear();

        // Leaving EDIT → VIEW = cancel geometry changes for coords
        if (prevMode === 'edit' && mode === 'view') {
          revertActiveEditorGeom();
        }

        // VIEW mode: no Modify, no edit pulse (but keep red arrow + declutter)
        if (!geomBindings || mode === 'view') {
          modifyInteraction.setActive(false);
          stopEditHighlight();
          return;
        }

        // EDIT mode:
        //  - keep road highlight + red pointer as-is
        //  - enable Modify and add animated red ring around editable markers
        const editTargets = [];
        ['point', 'start', 'end'].forEach((key) => {
          const b = geomBindings[key];
          if (!b || !b.feature) return;
          editableFeatures.push(b.feature);
          editTargets.push(b.feature);
        });

        startEditHighlight(editTargets);
        modifyInteraction.setActive(true);
      }

      btnView.addEventListener('click', () => setMode('view'));
      btnEdit.addEventListener('click', () => setMode('edit'));

      // initial mode
      setMode(EDIT_MODE || 'view');

      // --- Wire up "Push Changes" to POST to Django and update local state ---
      if (root.__pushChangesButton) {
        const pushBtn = root.__pushChangesButton;
        let saveInFlight = false;

        pushBtn.addEventListener('click', async () => {
          const ed = ACTIVE_EDITOR;
          if (!ed || ed.root !== root) return;
          if (saveInFlight) return;

          const dirtyKeysArr = [...ed.dirtyKeys].filter(k => k !== '__cleaning_status');
          const statusCtrl = ed.inputsByKey.__cleaning_status;

          // If nothing is dirty and we have no status control, nothing to do
          if (!dirtyKeysArr.length && !statusCtrl) return;

          const payload = {};

          // Normal dirty fields
          dirtyKeysArr.forEach((key) => {
            const ctrl = ed.inputsByKey[key];
            if (!ctrl) return;
            payload[key] = getControlValue(ctrl);
          });

          // Cleaning status + remarks block
          if (statusCtrl) {
            const statusVal = getControlValue(statusCtrl) || 'pending';
            const remarksCtrl = ed.inputsByKey.remarks;
            const remarksUserText = remarksCtrl ? (remarksCtrl.value || '') : (ed.record.remarks || '');
            payload.remarks = `{{status:${statusVal}}} ${remarksUserText}`.trim();
          }

          if (!Object.keys(payload).length) return;

          let url = '';
          if (kind === 'road') {
            url = `/api/road/${encodeURIComponent(id)}/`;
          } else {
            const t = (record.type || '').toString().toLowerCase();
            const qs = t ? `?type=${encodeURIComponent(t)}` : '';
            url = `/api/asset/${encodeURIComponent(id)}/${qs}`;
          }

          saveInFlight = true;
          pushBtn.disabled = true;

          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (!res.ok) {
              console.error('Save failed', await res.text());
              return;
            }
            const data = await res.json();
            const updated = Array.isArray(data.updated) && data.updated.length
              ? data.updated
              : Object.keys(payload);

            // Update local "record", original values, dirty flags and the view table
            updated.forEach((key) => {
              let newVal = (key === 'remarks')
                ? payload.remarks
                : payload[key];

              ed.record[key] = newVal;

              const ctrl = ed.inputsByKey[key];
              const lbl  = ed.labelsByKey[key];
              const td   = ed.viewCellsByKey[key];

              let curStr;

              if (key === 'remarks') {
                // For the UI we show only the text part, and keep that as baseline
                const parsed = parseCleaningStatus(newVal);
                curStr = parsed.text || '';
                ed.original[key] = curStr;
              } else {
                curStr = newVal == null ? '' : String(newVal);
                ed.original[key] = curStr;
              }

              ed.dirtyKeys.delete(key);

              if (lbl) lbl.classList.remove('field-label-dirty');
              if (td)  td.textContent = curStr;
            });
            // --- NEW: mark cleaning status as clean & update the title chip ---
            if (statusCtrl) {
              const statusVal = getControlValue(statusCtrl) || 'pending';

              // 1) Update local "original" baseline so the dropdown is no longer dirty
              ed.original.__cleaning_status = statusVal;
              ed.dirtyKeys.delete('__cleaning_status');

              const statusLbl = ed.labelsByKey.__cleaning_status;
              if (statusLbl) statusLbl.classList.remove('field-label-dirty');

              // 2) Update the status chip in the drawer title immediately
              if (drawerTitle) {
                const chip = drawerTitle.querySelector('.status-chip');
                if (chip) {
                  const cfg = CLEANING_STATUS_MAP[statusVal] || CLEANING_STATUS_MAP.pending;
                  chip.className = `status-chip status-chip--${statusVal}`;
                  chip.textContent = `${cfg.icon} ${cfg.label}`;
                }
              }

              // 3) Make sure the Push Changes button reflects the clean state
              if (typeof ed.root.__syncPushButton === 'function') {
                ed.root.__syncPushButton();
              }
            }

            // For coords, treat the current geometry as the new "initial" baseline
            if (ed.geomBindings) {
              ['point', 'start', 'end'].forEach((gKey) => {
                const b = ed.geomBindings[gKey];
                if (!b || !b.feature) return;
                const g = b.feature.getGeometry && b.feature.getGeometry();
                if (!g || !g.getCoordinates) return;
                b.initialCoord = g.getCoordinates().slice();

                // remove dirty styling for coord inputs
                if (b.latKey && ed.inputsByKey[b.latKey]) {
                  const inp = ed.inputsByKey[b.latKey];
                  const lbl = ed.labelsByKey[b.latKey];
                  inp.classList.remove('field-coord-dirty');
                  lbl && lbl.classList.remove('field-label-dirty');
                  ed.dirtyKeys.delete(b.latKey);
                }
                if (b.lonKey && ed.inputsByKey[b.lonKey]) {
                  const inp = ed.inputsByKey[b.lonKey];
                  const lbl = ed.labelsByKey[b.lonKey];
                  inp.classList.remove('field-coord-dirty');
                  lbl && lbl.classList.remove('field-label-dirty');
                  ed.dirtyKeys.delete(b.lonKey);
                }
              });
            }
            // Make sure button reflects that nothing is dirty any more
            if (typeof ed.root.__syncPushButton === 'function') {
              ed.root.__syncPushButton();
            }
          } catch (err) {
            console.error('Save error', err);
          } finally {
            saveInFlight = false;
            pushBtn.disabled = false;
          }
        });
      }

      return root;
    }

    // --- Detect lat/lon field names and match them to map features ----------
    function detectGeomBindingsForRoad(roadObj, roadId) {
      if (!roadObj || !roadId) return null;
      const keys = Object.keys(roadObj);
      const matchKey = (re) => keys.find(k => re.test(k));

      const startLatKey = matchKey(/start.*lat|lat.*start/i);
      const startLonKey = matchKey(/start.*lon|lon.*start/i);
      const endLatKey   = matchKey(/end.*lat|lat.*end/i);
      const endLonKey   = matchKey(/end.*lon|lon.*end/i);

      const endpoints = pointsSource.getFeatures().filter(f =>
        f.get('feature_type') === 'road_endpoint' &&
        String(f.get('road_id') || '') === String(roadId)
      );
      let startFeat = null;
      let endFeat = null;
      endpoints.forEach(f => {
        const lbl = (f.get('name') || '').toString().toUpperCase();
        if (lbl === 'S') startFeat = f;
        if (lbl === 'E') endFeat = f;
      });

      return {
        start: (startLatKey && startLonKey && startFeat) ? {
          latKey: startLatKey, lonKey: startLonKey, feature: startFeat
        } : null,
        end: (endLatKey && endLonKey && endFeat) ? {
          latKey: endLatKey, lonKey: endLonKey, feature: endFeat
        } : null
      };
    }

    function detectGeomBindingsForAsset(assetObj) {
      if (!assetObj || !assetObj.id) return null;
      const keys = Object.keys(assetObj);
      const matchKey = (re) => keys.find(k => re.test(k));

      // Base matches
      const latKeyRaw = matchKey(/^lat$|latitude/i);
      const lonKeyRaw = matchKey(/^lon$|^lng$|longitude/i);
      const startLat  = matchKey(/start.*lat|lat.*start/i);
      const startLon  = matchKey(/start.*lon|lon.*start/i);
      const endLat    = matchKey(/end.*lat|lat.*end/i);
      const endLon    = matchKey(/end.*lon|lon.*end/i);

      let latKey = latKeyRaw;
      let lonKey = lonKeyRaw;

      // 👇 Point-only assets that use end_lat/end_lon (e.g. patch_condition)
      if (!latKey && !lonKey && !startLat && !startLon && endLat && endLon) {
        latKey = endLat;
        lonKey = endLon;
      }

      // --- Single point asset (normal point or patch_condition-style) ---
      if (latKey && lonKey) {
        const feature = pointsSource.getFeatures().find(f =>
          f.get('asset_kind') === 'point' &&
          String(f.get('id') || '') === String(assetObj.id)
        );
        if (feature) {
          return {
            point: { latKey, lonKey, feature }
          };
        }
      }

      // --- Line asset → find its LineString feature too ---
      const lineFeature = linesSource.getFeatures().find(f =>
        f.get('asset_kind') === 'line' &&
        String(f.get('id') || '') === String(assetObj.id)
      );

      // True line: has start_* and end_* keys
      if (startLat && startLon && endLat && endLon) {
        const endpoints = pointsSource.getFeatures().filter(f =>
          f.get('kind') === 'line-endpoint' &&
          String(f.get('id') || '') === String(assetObj.id)
        );
        let startFeat = null, endFeat = null;
        endpoints.forEach(f => {
          const badge = (f.get('badgeText') || f.get('name') || '').toString().toUpperCase();
          if (badge === 'S') startFeat = f;
          if (badge === 'E') endFeat = f;
        });

        return {
          start: (startFeat ? { latKey: startLat, lonKey: startLon, feature: startFeat } : null),
          end:   (endFeat   ? { latKey: endLat,  lonKey: endLon,  feature: endFeat   } : null),
          line:  lineFeature || null
        };
      }

      return null;
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
          const typeKey = String(a.label || '').toLowerCase();
          addPoint(a.lon, a.lat, {
            color: '#7c3aed', label: (a.label||'').slice(0,2).toUpperCase(), id: a.id,
            feature_type: 'asset', road_id: a.road_id || null, asset_kind: 'point', asset_type: typeKey || null
          });
        } else {
          const typeKey = String(a.label || '').toLowerCase();
          addLine(a.start_lon, a.start_lat, a.end_lon, a.end_lat, {
            label: a.label || '', id: a.id, road_id: a.road_id || null, asset_type: typeKey || null
          });
        }
      });
    }

    async function fetchAsset(assetId, assetType) {
      const t = (assetType || '').toString().trim().toLowerCase();
      const url = new URL(location.origin + `/api/asset/${assetId}/`);
      if (t) url.searchParams.set('type', t); // fast-path on the backend
      const res = await fetch(url);
      if (!res.ok) throw new Error('asset fetch failed');
      return res.json();
    }

  // --- Image Lightbox (zoom/rotate + wheel zoom + drag pan) ---
  let _imgBox, _imgEl;
  let _scale = 1, _deg = 0;
  let _offsetX = 0, _offsetY = 0;        // pan offsets
  let _dragging = false;
  let _dragStartX = 0, _dragStartY = 0;
  let _imgStartX = 0, _imgStartY = 0;
  let _imgCurrentSrc = '';

    function ensureLightbox() {
      if (_imgBox) return;
      _imgBox = document.createElement('div');
      _imgBox.className = 'imglightbox';
      _imgBox.setAttribute('hidden','');
      _imgBox.innerHTML = `
        <div class="imglightbox__panel" role="dialog" aria-modal="true">
          <div class="imglightbox__stage">
            <img class="imglightbox__img" alt="">
          </div>
          <div class="imglightbox__tools">
            <button class="imglightbox__btn" data-act="zoom-in">Zoom +</button>
            <button class="imglightbox__btn" data-act="zoom-out">Zoom −</button>
            <button class="imglightbox__btn" data-act="rotate">Rotate ↻</button>
            <button class="imglightbox__btn" data-act="open-tab">Open in new tab ↗</button>
            <button class="imglightbox__btn" data-act="close">Close ✕</button>
          </div>
        </div>`;
      document.body.appendChild(_imgBox);
      _imgEl = _imgBox.querySelector('.imglightbox__img');
      _imgEl.draggable = false; // prevent default browser drag ghost

      const stage = _imgBox.querySelector('.imglightbox__stage');

      // Mouse wheel zoom
      stage.addEventListener('wheel', onLightboxWheel, { passive: false });

      // Click + drag pan
      stage.addEventListener('mousedown', onLightboxDragStart);
      window.addEventListener('mousemove', onLightboxDragMove);
      window.addEventListener('mouseup', onLightboxDragEnd);

      _imgBox.addEventListener('click', (e) => {
        // click backdrop closes
        if (e.target === _imgBox) closeImgBox();
      });
      _imgBox.querySelectorAll('[data-act]').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
          const act = e.currentTarget.getAttribute('data-act');
          if (act === 'close') return closeImgBox();
          if (act === 'zoom-in') { _scale = Math.min(6, _scale + 0.25); applyImgTf(); }
          if (act === 'zoom-out') { _scale = Math.max(0.25, _scale - 0.25); applyImgTf(); }
          if (act === 'rotate') { _deg = (_deg + 90) % 360; applyImgTf(); }
          if (act === 'open-tab') {
            const url = _imgCurrentSrc || _imgEl?.src;
            if (url) window.open(url, '_blank', 'noopener');
          }
        });
      });
      document.addEventListener('keydown', (e)=>{
        if (e.key === 'Escape' && !_imgBox.hasAttribute('hidden')) closeImgBox();
      });
    }

    function applyImgTf() {
      if (_imgEl) {
        _imgEl.style.transform =
          `translate(${_offsetX}px, ${_offsetY}px) scale(${_scale}) rotate(${_deg}deg)`;
      }
    }

    function onLightboxWheel(e) {
      e.preventDefault();
      const delta = e.deltaY || e.wheelDelta || 0;
      const step = delta > 0 ? -0.25 : 0.25;  // scroll down = zoom out
      _scale = Math.min(6, Math.max(0.25, _scale + step));
      applyImgTf();
    }

    function onLightboxDragStart(e) {
      // left button only
      if (e.button !== 0) return;
      _dragging = true;
      _dragStartX = e.clientX;
      _dragStartY = e.clientY;
      _imgStartX = _offsetX;
      _imgStartY = _offsetY;
    }

    function onLightboxDragMove(e) {
      if (!_dragging) return;
      _offsetX = _imgStartX + (e.clientX - _dragStartX);
      _offsetY = _imgStartY + (e.clientY - _dragStartY);
      applyImgTf();
    }

    function onLightboxDragEnd() {
      _dragging = false;
    }

    function openImgBox(src){
      ensureLightbox();
      _scale = 1;
      _deg = 0;
      _offsetX = 0;
      _offsetY = 0;
      _imgCurrentSrc = src || '';
      applyImgTf();
      _imgEl.src = src;
      _imgBox.removeAttribute('hidden');
    }

    function closeImgBox(){ _imgBox?.setAttribute('hidden',''); }

    // Normalize pics coming from API (array, JSON string, comma string, or alt keys)
    function normalizePics(obj) {
      const tryArr = (...keys) => {
        for (const k of keys) {
          const v = obj?.[k];
          if (!v) continue;
          if (Array.isArray(v)) return v.filter(Boolean);
          if (typeof v === 'string') {
            // 1) JSON array string
            const s = v.trim();
            if (s.startsWith('[') && s.endsWith(']')) {
              try { const arr = JSON.parse(s); if (Array.isArray(arr)) return arr.filter(Boolean); } catch {}
            }
            // 2) comma-separated
            if (s.includes(',')) return s.split(',').map(t=>t.trim()).filter(Boolean);
            // 3) single url
            if (/^https?:\/\//i.test(s)) return [s];
          }
        }
        return [];
      };
      // common fallbacks: pics, images, image_urls, photos
      return tryArr('pics','images','image_urls','photos');
    }

    // --- Collapsible section helper --------------------------------------------
    function makeCollapsibleSection(title = 'Section', contentNode, {
      open = true,
      titleFontSize = '16px',
      sectionClass = 'drawer-section'
    } = {}) {
      const wrap = document.createElement('div');
      wrap.className = sectionClass;

      // header row: title + arrow button on the right
      const head = document.createElement('div');
      head.className = 'cs-head';

      const h = document.createElement('h4');
      h.textContent = title;
      h.style.fontSize = titleFontSize;
      h.className = 'cs-title';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cs-toggle';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      // ▲ (open) ▼ (closed)
      btn.textContent = open ? '▲' : '▼';

      head.appendChild(h);
      head.appendChild(btn);

      const body = document.createElement('div');
      body.className = 'cs-body';
      if (contentNode instanceof Node) body.appendChild(contentNode);
      else if (typeof contentNode === 'string') body.innerHTML = contentNode;

      // initial state
      body.hidden = !open;

      btn.addEventListener('click', () => {
        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        const next = !isOpen;
        btn.setAttribute('aria-expanded', String(next));
        btn.textContent = next ? '▲' : '▼';
        body.hidden = !next;
      });

      wrap.appendChild(head);
      wrap.appendChild(body);
      return wrap;
    }

    // --- Metadata formatters ----------------------------------------------------
    function fmtDateOnly(val) {
      if (!val) return '';
      // Expect "YYYY-MM-DDTHH:MM:SS.sss+00:00" -> take "YYYY-MM-DD"
      const s = String(val);
      const t = s.indexOf('T');
      return t > 0 ? s.slice(0, t) : s.slice(0, 10);
    }
    function trimIdLast5(val) {
      if (!val) return '';
      const s = String(val);
      return '...' + s.slice(-5);
    }

    // Build key-value chip
    function makeMetaCell(key, value) {
      const cell = document.createElement('div');
      cell.className = 'meta-cell';
      cell.innerHTML = `<b>${key}:</b> <span>${value ?? ''}</span>`;
      return cell;
    }

    // Build Metadata grid from an asset object
    function makeMetadataSection(assetObj = {}) {
      const grid = document.createElement('div');
      grid.className = 'meta-grid';

      const created_at  = fmtDateOnly(assetObj.created_at || assetObj.createdAt);
      const updated_at  = fmtDateOnly(assetObj.updated_at || assetObj.updatedAt);
      const created_by  = trimIdLast5(assetObj.created_by || assetObj.createdBy);
      const updated_by  = trimIdLast5(assetObj.updated_by || assetObj.updatedBy);
      const roadRaw     = assetObj.road || assetObj.road_id || assetObj.roadId;
      const road        = roadRaw ? trimIdLast5(roadRaw) : '';
      const kind        = assetObj.kind ?? '';
      const type        = assetObj.type ?? '';
      const model       = assetObj.model ?? '';

      // Only add a cell if we have some value (keeps it concise)
      if (created_at) grid.appendChild(makeMetaCell('created_at', created_at));
      if (updated_at) grid.appendChild(makeMetaCell('updated_at', updated_at));
      if (created_by) grid.appendChild(makeMetaCell('created_by', created_by));
      if (updated_by) grid.appendChild(makeMetaCell('updated_by', updated_by));
      if (road)       grid.appendChild(makeMetaCell('road', road));
      if (kind)       grid.appendChild(makeMetaCell('kind', kind));
      if (type)       grid.appendChild(makeMetaCell('type', type));
      if (model)      grid.appendChild(makeMetaCell('model', model));

      // Collapsed by default, arrow ▼
      return makeCollapsibleSection('🏷️ Metadata', grid, { open: false, titleFontSize: '16px' });
    }

    // --- Drawer gallery helper: open images in modal + collapsible -------------
    function makeGallery(urls = [], title = '🖼️ Images') {
      const wrap = document.createElement('div');
      const arr = (urls || []).filter(Boolean);
      if (!arr.length) {
        const p = document.createElement('p'); 
        p.textContent = 'No images found.'; 
        wrap.appendChild( makeCollapsibleSection(title, p, { open: true, titleFontSize: '16px' }) );
        return wrap;
      }

      const grid = document.createElement('div');
      grid.className = 'gallery';
      arr.forEach(u => {
        const a = document.createElement('a');
        a.href = u; a.target = '_blank'; a.rel = 'noopener';
        const img = document.createElement('img'); img.src = u; img.alt = '';
        a.appendChild(img);
        // your lightbox hook
        a.addEventListener('click', (e)=>{ e.preventDefault(); openImgBox(u); });
        grid.appendChild(a);
      });

      // Wrap grid in a collapsible section (open by default, arrow ▲)
      wrap.appendChild( makeCollapsibleSection(title, grid, { open: true, titleFontSize: '16px' }) );
      return wrap;
    }

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

    function highlightRoadById(roadId) {
      // remove old mirrored points first
      clearSelectedCopies();
      clearPointer();  
      // 1) First, restore everyone to their base (normal) look
      pointsSource.getFeatures().forEach(styleByFeatureReset);
      linesSource.getFeatures().forEach(styleByFeatureReset);

      // 2) Dim everything that is NOT on the selected road
      let any = false;

      // Points (asset points, line endpoints, road endpoints)
      pointsSource.getFeatures().forEach(f => {
        const same = String(f.get('road_id') || '') === String(roadId);

        if (same) {
          any = true;
          // Mirror only point-like features so declutter can't hide them:
          // - regular asset points (kind === 'point')
          // - line endpoints (kind === 'line-endpoint')
          // - road start/end (feature_type === 'road_endpoint')
          const kind = f.get('kind');
          if (kind === 'point' || kind === 'line-endpoint' || f.get('feature_type') === 'road_endpoint') {
            addPriorityCopyFrom(f);
          }
          return; // leave selected features as-is (full style)
        }

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

    async function handleFeatureSelection(feat) {
      if (!feat) {
        if (drawer) closeDrawer();
        revertActiveEditorGeom();
        stopEditHighlight();
        pointsSource.getFeatures().forEach(styleByFeatureReset);
        linesSource.getFeatures().forEach(styleByFeatureReset);
        clearSelectedCopies();
        clearPointer();
        ACTIVE_EDITOR = null;
        EDIT_MODE = 'view';
        editableFeatures.clear();
        modifyInteraction.setActive(false);
        return;
      }

      const ftype = feat.get('feature_type');
      const roadId = feat.get('road_id');
      const assetId = feat.get('id');

      try {
        if (ftype === 'road_endpoint' && roadId) {
          const hasAny = highlightRoadById(roadId);
          if (!hasAny) {
            await fetchRoadAssetsOnce(roadId);
            highlightRoadById(roadId);
          }
          const res = await fetch(`/api/road/${roadId}/?include=counts`);
          const payload = await res.json();

          const panel = document.createElement('div');
          const chart = makeCountsChart(payload.counts || {});
          panel.appendChild(chart);

          const pics = normalizePics(payload.road);
          if (pics.length) panel.appendChild(makeGallery(pics, 'dY-мЛ,? Road Images'));

          const metaSection = makeMetadataSection(payload.road);
          panel.appendChild(metaSection);

          const geomBindings = detectGeomBindingsForRoad(payload.road, roadId);
          const veSection = buildViewEditSection('road', payload.road, {
            extraSkip: ['name'],
            geomBindings,
            id: payload.road?.id
          });
          panel.appendChild(veSection);

          const roadStatus = parseCleaningStatus(payload.road?.remarks);
          openDrawer(payload.road.name || 'Road', panel, {
            id: payload.road?.id,
            district: payload.road?.district ?? payload.road?.district_code ?? payload.road?.district_name,
            status: roadStatus.status
          });
          decorateWithPointerArrow(feat);
          return;
        }

        if ((ftype === 'asset' || ftype === 'asset_endpoint') && assetId) {
          const assetType = feat.get('asset_type') || null;
          const payload = await fetchAsset(assetId, assetType);
          const asset = payload.asset || {};

          if (asset.road_id) {
            const hasAny = highlightRoadById(asset.road_id);
            if (!hasAny) {
              await fetchRoadAssetsOnce(asset.road_id);
              highlightRoadById(asset.road_id);
            }
          }
          const panel = document.createElement('div');

          const pics = normalizePics(asset);
          panel.appendChild(makeGallery(pics, 'dY-мЛ,? Images'));

          const metaSection = makeMetadataSection(asset);
          panel.appendChild(metaSection);

          const geomBindings = detectGeomBindingsForAsset(asset);
          const veSection = buildViewEditSection('asset', asset, {
            geomBindings,
            id: asset.id
          });
          panel.appendChild(veSection);

          const assetStatus = parseCleaningStatus(asset.remarks);
          openDrawer(`${(asset.type || 'Asset').toString().toUpperCase()}`, panel, {
            id: asset.id,
            district: asset.district ?? asset.district_code ?? asset.district_name,
            status: assetStatus.status
          });
          if (feat.get('kind') === 'point' || feat.get('kind') === 'line-endpoint') {
            decorateWithPointerArrow(feat);
          } else {
            const endpoints = pointsSource.getFeatures().filter(f =>
              f.get('kind') === 'line-endpoint' && String(f.get('id')) === String(assetId)
            );
            if (endpoints.length) decorateWithPointerArrow(endpoints[0]);
          }
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }

    if (map.__clickBound) return;
    map.__clickBound = true;

    // Clicking the map: feature picking & behavior
    map.on('singleclick', async (evt) => {
      const pixel = evt.pixel;
      const feat = map.forEachFeatureAtPixel(pixel, f => f, { layerFilter: l => (l === pointsLayer || l === linesLayer) });
      await handleFeatureSelection(feat);
    });

    function extractLonLatFromRow(row) {
      if (!row) return null;
      const lonKeys = ['lon', 'lng', 'longitude', 'start_lon'];
      const latKeys = ['lat', 'latitude', 'start_lat'];
      let lon = null, lat = null;
      for (const k of lonKeys) {
        const v = row[k];
        if (v !== undefined && v !== null && v !== '') { lon = parseFloat(v); break; }
      }
      for (const k of latKeys) {
        const v = row[k];
        if (v !== undefined && v !== null && v !== '') { lat = parseFloat(v); break; }
      }
      if (Number.isFinite(lon) && Number.isFinite(lat)) return { lon, lat };
      return null;
    }

    function findFeatureById(id) {
      if (!id) return null;
      const sid = String(id);
      let feat = pointsSource.getFeatures().find(f => String(f.get('id') || '') === sid);
      if (feat) return feat;
      feat = linesSource.getFeatures().find(f => String(f.get('id') || '') === sid);
      return feat || null;
    }

    function findFeatureByRoadId(roadId, { preferRoadEndpoint = false } = {}) {
      if (!roadId) return null;
      const sid = String(roadId);
      const pointMatches = pointsSource.getFeatures().filter(f => String(f.get('road_id') || '') === sid);
      if (preferRoadEndpoint) {
        const roadEndpoint = pointMatches.find(f => f.get('feature_type') === 'road_endpoint');
        if (roadEndpoint) return roadEndpoint;
      }
      if (pointMatches.length) return pointMatches[0];
      const lineMatch = linesSource.getFeatures().find(f => String(f.get('road_id') || '') === sid);
      return lineMatch || null;
    }

    function findNearestFeatureByCoord(lon, lat, maxMeters = 200) {
      const target = ol.proj.fromLonLat([lon, lat]);
      let best = null;
      let bestDist = Infinity;
      const candidates = pointsSource.getFeatures().concat(linesSource.getFeatures());
      candidates.forEach(f => {
        const geom = f.getGeometry?.();
        if (!geom) return;
        let coord = null;
        if (geom.getType && geom.getType() === 'Point') coord = geom.getCoordinates();
        if (geom.getType && geom.getType() === 'LineString') {
          const ex = geom.getExtent();
          coord = ol.extent.getCenter(ex);
        }
        if (!coord) return;
        const dx = coord[0] - target[0];
        const dy = coord[1] - target[1];
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < bestDist) {
          bestDist = dist;
          best = f;
        }
      });
      if (best && Number.isFinite(bestDist)) {
        const meters = ol.proj.getPointResolution(ol.proj.get('EPSG:3857'), 1, target) * bestDist;
        if (meters <= maxMeters) return best;
      }
      return null;
    }

  async function focusMapFromTable(payload) {
      if (!payload || !payload.row) return;
      const row = payload.row;
      const isRoadRow = (payload.sheetKey || '').startsWith('roads') || (!row.type && row.start_lat !== undefined);

      // Prefer explicit coordinates from the row (point assets or line start)
      const coord = extractLonLatFromRow(row);
      if (coord) {
        const projected = ol.proj.fromLonLat([coord.lon, coord.lat]);
        const view = map.getView();
        const targetZoom = Math.max(view.getZoom() || 12, 18.5);
        view.animate({ center: projected, zoom: targetZoom, duration: 250 });
        flashCrosshair(projected);
        return;
      }

      // Fallback: try to center on a known feature by id/road_id
      let feat = null;
      if (row.id) {
        feat = findFeatureById(row.id);
      }
      if (!feat && row.road_id) {
        feat = findFeatureByRoadId(row.road_id, { preferRoadEndpoint: isRoadRow });
      }
      if (feat) {
        const geom = feat.getGeometry?.();
        if (geom) {
          const center = geom.getType && geom.getType() === 'Point'
            ? geom.getCoordinates()
            : ol.extent.getCenter(geom.getExtent());
          const view = map.getView();
          const targetZoom = Math.max(view.getZoom() || 12, 18.5);
          view.animate({ center, zoom: targetZoom, duration: 250 });
          flashCrosshair(center);
        }
      }
    }

    // --- Brief crosshair/highlight at a coordinate ---
    let crosshairLayer = null;
    function ensureCrosshairLayer() {
      if (crosshairLayer) return crosshairLayer;
      const source = new ol.source.Vector();
      crosshairLayer = new ol.layer.Vector({ source, zIndex: 80 });
      map.addLayer(crosshairLayer);
      crosshairLayer.__source = source;
      return crosshairLayer;
    }

    function flashCrosshair(coord) {
      if (!coord) return;
      const layer = ensureCrosshairLayer();
      const source = layer.__source;
      const size = 14;

      // Crosshair box corners
      const box = new ol.geom.Polygon([[
        [coord[0]-size, coord[1]-size],
        [coord[0]+size, coord[1]-size],
        [coord[0]+size, coord[1]+size],
        [coord[0]-size, coord[1]+size],
        [coord[0]-size, coord[1]-size],
      ]]);

      // Rays extending outward
      const rays = [
        new ol.geom.LineString([[coord[0]-size*1.6, coord[1]], [coord[0]-size*0.6, coord[1]]]),
        new ol.geom.LineString([[coord[0]+size*0.6, coord[1]], [coord[0]+size*1.6, coord[1]]]),
        new ol.geom.LineString([[coord[0], coord[1]-size*1.6], [coord[0], coord[1]-size*0.6]]),
        new ol.geom.LineString([[coord[0], coord[1]+size*0.6], [coord[0], coord[1]+size*1.6]])
      ];

      const features = [
        new ol.Feature({ geometry: box }),
        ...rays.map(g => new ol.Feature({ geometry: g }))
      ];

      const redStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#dc2626', width: 2 })
      });

      features.forEach(f => f.setStyle(redStyle));
      features.forEach(f => source.addFeature(f));

      // Blink twice then remove
      let visible = true;
      let count = 0;
      const interval = setInterval(() => {
        visible = !visible;
        features.forEach(f => f.setStyle(visible ? redStyle : new ol.style.Style({
          stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0)' })
        })));
        count += 1;
        if (count >= 6) {
          clearInterval(interval);
          features.forEach(f => source.removeFeature(f));
        }
      }, 250);
    }

    window.addEventListener('message', (evt) => {
      const data = evt.data || {};
      if (data.type === 'selection-table:focus') {
        focusMapFromTable(data.payload);
      }
    });

    // Direct bridge so the table window can call opener.centerOnSelectionRow(row)
    window.centerOnSelectionRow = function(row, sheetKey) {
      focusMapFromTable({ row, sheetKey });
    };
  })();
})();
