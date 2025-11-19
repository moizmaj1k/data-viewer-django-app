(function () {
  const $ = (sel) => document.querySelector(sel);
  let mapRef = null;                   // OpenLayers map
  let vectorCounter = 0;               // for unique layer names
  let pendingFile = null;              // file selected or dropped
  function showModal(open) {
    const modal = $('#layer-modal');
    if (!modal) return;
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    modal.style.display = open ? 'block' : 'none';
    document.body.classList.toggle('modal-open', open);
    if (open) {
      $('#layer-status').textContent = '';
      pendingFile = null;
      const fi = $('#layer-file');
      const fn = $('#layer-filename');
      if (fi) fi.value = '';
      if (fn) fn.textContent = '';
    }
  }
  function status(msg, isError=false) {
    const el = $('#layer-status');
    if (!el) return;
    el.classList.toggle('error', Boolean(isError));
    el.textContent = msg || '';
  }
  async function ensureMap() {
    if (mapRef && mapRef instanceof ol.Map) return mapRef;
    if (window.__APP_MAP__ instanceof ol.Map) { mapRef = window.__APP_MAP__; return mapRef; }
    if (window.__olMap instanceof ol.Map) { mapRef = window.__olMap; return mapRef; }
    if (window.__MAP_READY__ && typeof window.__MAP_READY__.then === 'function') {
      mapRef = await window.__MAP_READY__;
      return mapRef;
    }
    throw new Error('Map not available');
  }
  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => resolve(String(fr.result || ''));
      fr.readAsText(file);
    });
  }
  const userLayers = new Map(); // id -> ol.layer.Vector
  const layerTogglesEl = $('#layer-toggles'); // pills in top bar

  function addLayerToggleChip(layer, name) {
    if (!layerTogglesEl) return;

    const id = `layer-${Math.random().toString(36).slice(2,8)}`;
    userLayers.set(id, layer);

    const row = document.createElement('div');
    row.className = 'layer-row';
    row.dataset.layerId = id;

    const label = document.createElement('label');
    label.className = 'layer-toggle';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.layerId = id;

    const pill = document.createElement('span');
    pill.className = 'toggle-pill layer-toggle-pill is-on';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    nameSpan.textContent = name; // "🗺️" emoji is injected via CSS

    label.appendChild(cb);
    label.appendChild(pill);
    label.appendChild(nameSpan);

    cb.addEventListener('change', () => {
      const on = cb.checked;
      pill.classList.toggle('is-on', on);
      layer.setVisible(on);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'layer-delete-btn';
    delBtn.setAttribute('title', 'Remove layer');

    delBtn.addEventListener('click', async () => {
      try {
        const map = await ensureMap();
        if (map && layer) {
          map.removeLayer(layer);
        }
      } catch (e) {
        console.warn('remove layer failed', e);
      }
      userLayers.delete(id);
      row.remove();
    });

    row.appendChild(label);
    row.appendChild(delBtn);
    layerTogglesEl.appendChild(row);
  }


  function addVectorLayerFromFeatures(map, features, nameHint) {
    if (!features || features.length === 0) {
      status('No features found in the selected file.', true);
      return;
    }
    const src = new ol.source.Vector({ features });
    const lyr = new ol.layer.Vector({
      source: src,
      zIndex: 50,
      properties: { userLayer: true, title: nameHint || `Custom Layer ${++vectorCounter}` }
    });
    lyr.set('isUserLayer', true);
    lyr.set('name', nameHint || `Custom Layer ${++vectorCounter}`);
    map.addLayer(lyr);
    try {
      const extent = src.getExtent();
      if (extent && isFinite(extent[0])) {
        map.getView().fit(extent, { padding: [40,40,40,40], duration: 300, maxZoom: 17 });
      }
    } catch {}
    status(`Added: ${lyr.get('name')}`);
    // create top-bar toggle
    addLayerToggleChip(lyr, lyr.get('name') || 'Layer');
    showModal(false);
  }
  async function handleAddLayer() {
    status('');
    const input = $('#layer-file');
    const nameIn = $('#layer-name');
    // prefer dropped file; fallback to file input
    const file = pendingFile || input?.files?.[0];
    if (!file) { status('Please choose a file.', true); return; }
    let map;
    try { map = await ensureMap(); }
    catch (e) { status('Map is not ready yet. Please reload once scripts finish loading.', true); return; }
    const nameHint = (nameIn?.value || file.name).replace(/\.(kml|kmz|geojson|json)$/i,'');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'kml') {
        const text = await readAsText(file);
        // Preserve styles, labels and parse all folder depths
        const fmt = new ol.format.KML({
          extractStyles: true,
          showPointNames: true,
          maxDepth: Infinity
        });
        const feats = fmt.readFeatures(text, {
          dataProjection: 'EPSG:4326',
          featureProjection: map.getView().getProjection()
        });
        addVectorLayerFromFeatures(map, feats, nameHint);
        return;
      }
      if (ext === 'geojson' || ext === 'json') {
        const text = await readAsText(file);
        const json = JSON.parse(text);
        const fmt = new ol.format.GeoJSON();
        const feats = fmt.readFeatures(json, {
          dataProjection: 'EPSG:4326',
          featureProjection: map.getView().getProjection()
        });
        addVectorLayerFromFeatures(map, feats, nameHint);
        return;
      }
      // ----- zipped Shapefile (.zip) uploaded directly -----
      if (ext === 'zip') {
        if (!window.shp || !window.shp.parseZip) {
          status('Shapefile support missing (shpjs not loaded).', true);
          return;
        }
        const buf = await file.arrayBuffer();
        const gj = await window.shp.parseZip(buf); // GeoJSON (FeatureCollection or GeometryCollection)
        const fmt = new ol.format.GeoJSON();
        const feats = fmt.readFeatures(gj, { featureProjection: map.getView().getProjection() });
        if (!feats.length) { status('No features found in Shapefile zip.', true); return; }
        addVectorLayerFromFeatures(map, feats, nameHint);
        return;
      }

      if (ext === 'kmz') {
        if (!window.JSZip) {
          status('KMZ needs JSZip. Please include JSZip or upload a KML/GeoJSON instead.', true);
          return;
        }
        const buf = await file.arrayBuffer();
        const zip = await window.JSZip.loadAsync(buf);
        // Collect ALL .kml files inside the KMZ (many archives contain multiple)
        const entries = zip.file(/\.kml$/i) || [];
        if (!entries.length) { status('No KML found inside the KMZ.', true); return; }
        const fmt = new ol.format.KML({
          extractStyles: true,
          showPointNames: true,
          maxDepth: Infinity
        });
        const all = [];
        for (const entry of entries) {
          const kmlText = await entry.async('string');
          const feats = fmt.readFeatures(kmlText, {
            dataProjection: 'EPSG:4326',
            featureProjection: map.getView().getProjection()
          });
          if (feats?.length) all.push(...feats);
        }
        // If KML(s) produced features, add them now (we’ll also check for Shapefiles below)
        if (all.length) {
          addVectorLayerFromFeatures(map, all, nameHint);
        }

        // ----- Shapefile set embedded inside KMZ -----
        const shpFiles = zip.file(/\.shp$/i);
        const dbfFiles = zip.file(/\.dbf$/i);
        const shxFiles = zip.file(/\.shx$/i);
        const prjFiles = zip.file(/\.prj$/i);
        if (shpFiles.length && dbfFiles.length && window.shp && window.shp.parseZip) {
          // Repack only the shapefile parts into a new ZIP for shpjs
          const repack = new window.JSZip();
          const addTo = async (file) => {
            repack.file(file.name.split('/').pop(), await file.async('arraybuffer'));
          };
          await Promise.all([...shpFiles, ...dbfFiles, ...shxFiles, ...prjFiles].map(addTo));
          const subBuf = await repack.generateAsync({ type: 'arraybuffer' });
          try {
            const gj = await window.shp.parseZip(subBuf);
            const fmtGJ = new ol.format.GeoJSON();
            const f2 = fmtGJ.readFeatures(gj, { featureProjection: map.getView().getProjection() });
            if (f2.length) {
              addVectorLayerFromFeatures(map, f2, `${nameHint} (SHP)`);
            }
          } catch (e) {
            console.warn('Embedded Shapefile parse failed:', e);
          }
        }

        if (!all.length && !shpFiles.length) {
          status('No KML/Shapefile features found in this KMZ.', true);
          return;
        }
        return; // KMZ handled
      }
      status('Unsupported file type. Use KMZ, KML, Shapefile (.zip) or GeoJSON.', true);
    } catch (err) {
      console.error(err);
      status(`Failed to add layer: ${err.message || err}`, true);
    }
  }
  function bind() {
    const openBtn = $('#btn-add-layer');
    const cancel  = $('#layer-cancel');
    const closeX  = $('#layer-modal-close');
    const addBtn  = $('#layer-add');
    const modal   = $('#layer-modal');
    const bg      = modal?.querySelector('.layer-modal__backdrop');
    const drop    = $('#layer-dropzone');
    const fileBtn = $('#layer-file');
    const fileName = $('#layer-filename');
    if (!openBtn || !cancel || !addBtn || !modal) return;
    openBtn.addEventListener('click', () => showModal(true));
    cancel.addEventListener('click', () => showModal(false));
    closeX?.addEventListener('click', () => showModal(false));
    bg?.addEventListener('click', () => showModal(false));
    // click outside (backdrop) closes
    bg?.addEventListener('click', () => showModal(false));
    addBtn.addEventListener('click', handleAddLayer);

    // Drag & drop support
    if (drop) {
      const over = (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.add('dz-over'); };
      const off  = (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('dz-over'); };
      ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, over));
      ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, off));
      drop.addEventListener('drop', (e) => {
        const f = e.dataTransfer?.files?.[0];
        if (f) {
          pendingFile = f;
          if (fileName) fileName.textContent = f.name;
          status(`Ready: ${f.name}`);
        }
      });
      drop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { fileBtn?.click(); e.preventDefault(); }
      });
    }

    // Reflect file input to preview label
    fileBtn?.addEventListener('change', () => {
      const f = fileBtn.files?.[0];
      if (f) {
        pendingFile = f;
        if (fileName) fileName.textContent = f.name;
        status(`Ready: ${f.name}`);
      }
    });

    // Escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') showModal(false);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
