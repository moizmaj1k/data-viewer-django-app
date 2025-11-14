/* markers.js — Add Marker modal & per-marker toggles
   Reuses .layer-modal styles from layers.css and the AppMap ready surface from dashboard.js
*/
(function () {
  // Wait for AppMap in the same way layers.js does
  function whenAppMapReady(fn) {
    if (window.__APP_MAP_READY__ && window.AppMap) return fn(window.AppMap);
    (window.__APP_MAP_WAITERS__ = window.__APP_MAP_WAITERS__ || []).push(fn);
  }

  whenAppMapReady(({ map, ol }) => {
    // --- Layer: dedicated vector for user markers
    const markersSource = new ol.source.Vector();
    const markersLayer = new ol.layer.Vector({ source: markersSource, zIndex: 60 });
    map.addLayer(markersLayer);

    // Style helper: black text on white pill, small black dot anchor
    function markerStyle(name) {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 5,
          fill: new ol.style.Fill({ color: '#111' }),
          stroke: new ol.style.Stroke({ color: '#000', width: 1 })
        }),
        text: new ol.style.Text({
          text: String(name || ''),
          font: '600 12px system-ui, Segoe UI, Roboto, Arial, sans-serif',
          fill: new ol.style.Fill({ color: '#111' }),
          stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
          backgroundFill: new ol.style.Fill({ color: '#fff' }),
          backgroundStroke: new ol.style.Stroke({ color: '#111', width: 1 }),
          padding: [2, 6, 2, 6],
          offsetY: -16
        })
      });
    }

    // Hidden style (collapse visuals)
    const hiddenStyle = new ol.style.Style(); // empty

    // Registry
    const registry = new Map(); // id -> { feature, name, style }

    // UI: toggles container
    const toggles = document.getElementById('marker-toggles');

    function addToggleRow(id, name) {
      if (!toggles) return;
      const row = document.createElement('label');
      row.className = 'check'; // reuse your list/check styling
      row.dataset.mid = id;
      row.innerHTML = `
        <input type="checkbox" checked>
        <span>${name}</span>
      `;
      const cb = row.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', () => {
        const rec = registry.get(id);
        if (!rec) return;
        rec.feature.setStyle(cb.checked ? rec.style : hiddenStyle);
      });
      toggles.appendChild(row);
    }

    // Create a marker feature
    let COUNTER = 0;
    function addMarker(lat, lon, name) {
      const id = `m-${Date.now()}-${++COUNTER}`;
      const feat = new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([+lon, +lat])),
        kind: 'user-marker',
        id,
        name
      });
      const st = markerStyle(name);
      feat.setStyle(st);
      markersSource.addFeature(feat);
      registry.set(id, { feature: feat, name, style: st });
      addToggleRow(id, name);
      return id;
    }

    // --- Modal (build dynamically, reuse .layer-modal look)
    const trigger = document.getElementById('btn-add-marker');
    if (!trigger) return; // nothing to do

    // Build once
    let modal, dlg, backdrop, inputLat, inputLon, inputName, statusEl;
    function ensureModal() {
      if (modal) return;

      modal = document.createElement('div');
      modal.id = 'marker-modal';
      modal.className = 'layer-modal';
      modal.setAttribute('aria-hidden', 'true');

      modal.innerHTML = `
        <div class="layer-modal__backdrop" aria-hidden="true"></div>
        <div class="layer-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="marker-modal-title">
          <div class="layer-modal__head">
            <h3 id="marker-modal-title">Add Marker</h3>
            <button class="layer-modal__close" aria-label="Close">×</button>
          </div>
          <div class="layer-modal__body">
            <div class="field">
              <span>Latitude</span>
              <input id="marker-lat" type="number" step="0.000001" placeholder="e.g. 34.015732">
            </div>
            <div class="field" style="margin-top:8px">
              <span>Longitude</span>
              <input id="marker-lon" type="number" step="0.000001" placeholder="e.g. 71.524841">
            </div>
            <div class="field" style="margin-top:8px">
              <span>Marker name</span>
              <input id="marker-name" type="text" maxlength="64" placeholder="e.g. Site A">
            </div>
            <div id="marker-status" class="layer-status" role="status" aria-live="polite"></div>
          </div>
          <div class="layer-modal__foot">
            <button class="btn btn-outline" data-act="cancel">Cancel</button>
            <button class="btn btn-solid" data-act="add">Add marker</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      dlg = modal.querySelector('.layer-modal__dialog');
      backdrop = modal.querySelector('.layer-modal__backdrop');
      inputLat = modal.querySelector('#marker-lat');
      inputLon = modal.querySelector('#marker-lon');
      inputName = modal.querySelector('#marker-name');
      statusEl = modal.querySelector('#marker-status');

      // Wire controls
      modal.querySelector('.layer-modal__close').addEventListener('click', closeModal);
      backdrop.addEventListener('click', closeModal);
      modal.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
      modal.querySelector('[data-act="add"]').addEventListener('click', onAdd);

      // Enter key inside any input triggers Add
      [inputLat, inputLon, inputName].forEach(inp => {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); onAdd(); }
        });
      });
    }

    function openModal() {
      ensureModal();
      modal.setAttribute('aria-hidden', 'false');
      inputLat.focus();
      // Clear prior values/status but keep last name as convenience
      statusEl.textContent = '';
      if (!inputName.value) inputName.value = '';
    }

    function closeModal() {
      if (!modal) return;
      modal.setAttribute('aria-hidden', 'true');
    }

    function showError(msg) {
      statusEl.style.color = '#b91c1c';
      statusEl.textContent = msg || '';
    }
    function showOk(msg) {
      statusEl.style.color = '#14532d';
      statusEl.textContent = msg || '';
    }

    function onAdd() {
      const lat = parseFloat(inputLat.value);
      const lon = parseFloat(inputLon.value);
      const name = (inputName.value || '').trim() || 'Marker';

      // Validate
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        showError('Please provide a valid latitude between -90 and 90.');
        inputLat.focus(); return;
      }
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        showError('Please provide a valid longitude between -180 and 180.');
        inputLon.focus(); return;
      }

      const id = addMarker(lat, lon, name);
      showOk('Marker added.');
      // Center softly on the new marker
      try {
        map.getView().animate({ center: ol.proj.fromLonLat([lon, lat]), duration: 400, zoom: Math.max(12, map.getView().getZoom() || 10) });
      } catch {}

      // Reset numeric fields for quick next entry; keep name so multiple sites share label base
      inputLat.value = '';
      inputLon.value = '';
      // Close immediately to match Add-Layer UX; comment if you prefer to keep open
      closeModal();
    }

    // Bind launcher
    trigger.addEventListener('click', openModal);
  });
})();
