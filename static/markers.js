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

    // --- Layer + helpers for edit highlight ripple around the active marker ---
    const editHighlightSource = new ol.source.Vector();
    const editHighlightLayer = new ol.layer.Vector({
      source: editHighlightSource,
      zIndex: 59, // just beneath the main marker icon
    });
    map.addLayer(editHighlightLayer);

    let editHighlightFeature = null;
    let editHighlightTimer = null;

    function clearEditHighlight() {
      if (editHighlightTimer) {
        clearInterval(editHighlightTimer);
        editHighlightTimer = null;
      }
      editHighlightSource.clear();
      editHighlightFeature = null;
    }

    function startEditHighlightForFeature(feature) {
      clearEditHighlight();
      if (!feature || !feature.getGeometry) return;
      const geom = feature.getGeometry();
      if (!geom || !(geom instanceof ol.geom.Point)) return;

      // Share the same geometry so the ripple follows when marker is dragged
      editHighlightFeature = new ol.Feature({ geometry: geom });
      editHighlightSource.addFeature(editHighlightFeature);

      // Single "breathing" circle – smooth radius change in/out
      let phase = 0;
      const baseRadius = 20;   // mid radius
      const amplitude = 6;     // how much it grows/shrinks

      editHighlightTimer = setInterval(() => {
        if (!editHighlightFeature) return;

        // Smooth sinusoidal motion for radius
        phase += 0.12; // lower = slower pulse
        const r = baseRadius + amplitude * (0.5 + 0.5 * Math.sin(phase));

        editHighlightFeature.setStyle(
          new ol.style.Style({
            image: new ol.style.Circle({
              radius: r,
              stroke: new ol.style.Stroke({
                color: 'rgba(239,68,68,0.9)', // red-500 stroke
                width: 2,
              }),
              fill: new ol.style.Fill({
                color: 'rgba(254,226,226,0.35)', // red-100 fill
              }),
            }),
          })
        );
      }, 40); // smaller interval = smoother animation
    }

    // --- Shared Translate interaction for editing marker positions ---
    const dragFeatures = new ol.Collection();
    const translateInteraction = new ol.interaction.Translate({ features: dragFeatures });
    translateInteraction.setActive(false);
    map.addInteraction(translateInteraction);

    let activeEditId = null;

    // When a drag finishes, we can log the new position (and later persist it if needed)
    translateInteraction.on('translateend', (evt) => {
      const f = evt.features.item(0);
      if (!f) return;
      const geom = f.getGeometry && f.getGeometry();
      if (!geom || !(geom instanceof ol.geom.Point)) return;
      const [lon, lat] = ol.proj.toLonLat(geom.getCoordinates());
      console.log('Marker moved to:', lat.toFixed(6), lon.toFixed(6));
    });
    // --- Simple popup for marker clicks (lat/lon + copy) ---
    const popupEl = document.createElement('div');
    popupEl.className = 'marker-popup';
    popupEl.innerHTML = `
      <div class="marker-popup-inner">
        <div class="marker-popup-row">
          <span class="marker-popup-label">Lat, Lon</span>
          <span class="marker-popup-value"></span>
        </div>
        <button type="button" class="marker-popup-copy" title="Copy coordinates">📋</button>
      </div>
    `;
    const popupValueEl = popupEl.querySelector('.marker-popup-value');
    const popupCopyBtn = popupEl.querySelector('.marker-popup-copy');

    // Attach popup to the map viewport so it moves with the map
    map.getViewport().appendChild(popupEl);

    const popupOverlay = new ol.Overlay({
      element: popupEl,
      positioning: 'bottom-center',
      stopEvent: false,
      offset: [0, -10],
    });
    map.addOverlay(popupOverlay);

    function hideMarkerPopup() {
      popupOverlay.setPosition(undefined);
    }

    function showMarkerPopup(feature) {
      const geom = feature.getGeometry && feature.getGeometry();
      if (!geom || !(geom instanceof ol.geom.Point)) return;
      const coord = geom.getCoordinates();
      const [lon, lat] = ol.proj.toLonLat(coord);
      const latStr = lat.toFixed(6);
      const lonStr = lon.toFixed(6);
      const combined = `${latStr}, ${lonStr}`;

      if (popupValueEl) {
        popupValueEl.textContent = combined;
        popupValueEl.dataset.lat = latStr;
        popupValueEl.dataset.lon = lonStr;
      }
      popupOverlay.setPosition(coord);
    }

    if (popupCopyBtn && popupValueEl) {
      popupCopyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = popupValueEl.textContent || '';
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          const old = popupCopyBtn.textContent;
          popupCopyBtn.textContent = '📋 ✓';
          setTimeout(() => { popupCopyBtn.textContent = old; }, 1200);
        } catch (err) {
          console.warn('Clipboard copy failed', err);
        }
      });
    }

    // keep a reference so we can remove features on delete
    window.__USER_MARKERS_SOURCE__ = markersSource;

    // Style helper: marker.png icon + label text (minimal background, like other labels)
    function markerStyle(name) {
      return new ol.style.Style({
        image: new ol.style.Icon({
          src: '/static/marker.png',           // your marker icon
          anchor: [0.5, 1],                    // bottom-center anchor
          anchorXUnits: 'fraction',
          anchorYUnits: 'fraction',
          scale: 0.9                           // tweak if icon looks too big/small
        }),
        text: new ol.style.Text({
          text: String(name || ''),
          font: '600 12px system-ui, Segoe UI, Roboto, Arial, sans-serif',
          fill: new ol.style.Fill({ color: '#111827' }),
          stroke: new ol.style.Stroke({
            color: 'rgba(255,255,255,0.95)',   // soft white halo, no solid box
            width: 3
          }),
          offsetY: -50                         // lift text slightly above the icon
        })
      });
    }

    // Hidden style (collapse visuals)
    const hiddenStyle = new ol.style.Style(); // empty

    // Registry
    const registry = new Map(); // id -> { feature, name, style }

    // UI: toggles container (Map Items panel)
    const toggles = document.getElementById('marker-toggles');

    function addToggleRow(id, name) {
      if (!toggles) return;

      const row = document.createElement('div');
      row.className = 'marker-row';
      row.dataset.mid = id;

      const label = document.createElement('label');
      label.className = 'marker-toggle';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.value = id;

      const pill = document.createElement('span');
      pill.className = 'toggle-pill marker-toggle-pill is-on';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'marker-name';
      nameSpan.textContent = name; // "📍" emoji is injected via CSS

      label.appendChild(cb);
      label.appendChild(pill);
      label.appendChild(nameSpan);

      cb.addEventListener('change', () => {
        const rec = registry.get(id);
        if (!rec) return;
        const on = cb.checked;
        pill.classList.toggle('is-on', on);
        rec.feature.setStyle(on ? rec.style : hiddenStyle);
      });

      // Edit icon button – enable/disable drag of this marker
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'marker-edit-btn';
      editBtn.setAttribute('title', 'Move marker');
      // editBtn.textContent = '✏️'; // or swap for an <img> icon if you prefer

      editBtn.addEventListener('click', () => {
        const rec = registry.get(id);
        if (!rec) return;

        const isSame = activeEditId === id;

        // Toggle OFF if already editing this marker
        if (isSame) {
          activeEditId = null;
          dragFeatures.clear();
          translateInteraction.setActive(false);
          row.classList.remove('is-editing');
          clearEditHighlight();
          hideMarkerPopup(); // optional: also hide popup when done editing
          return;
        }

        // Switch edit mode to this marker
        activeEditId = id;
        dragFeatures.clear();
        dragFeatures.push(rec.feature);
        translateInteraction.setActive(true);
        startEditHighlightForFeature(rec.feature);

        // Optional visual state for the active row
        document
          .querySelectorAll('.marker-row.is-editing')
          .forEach(r => r.classList.remove('is-editing'));
        row.classList.add('is-editing');
      });

      // Delete icon button
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'marker-delete-btn';
      delBtn.setAttribute('title', 'Delete marker');

      delBtn.addEventListener('click', () => {
        const rec = registry.get(id);
        const src = window.__USER_MARKERS_SOURCE__;
        if (rec && src) {
          try { src.removeFeature(rec.feature); } catch (e) { console.warn('remove marker failed', e); }
        }
        registry.delete(id);
        // If this marker was being edited, stop the interaction
        if (activeEditId === id) {
          activeEditId = null;
          dragFeatures.clear();
          translateInteraction.setActive(false);
          clearEditHighlight();
          hideMarkerPopup();
        }
        row.remove();
      });

      // Center icon button – center map on this marker and show popup
      const centerBtn = document.createElement('button');
      centerBtn.type = 'button';
      centerBtn.className = 'marker-center-btn';
      centerBtn.setAttribute('title', 'Center map on marker');

      centerBtn.addEventListener('click', () => {
        const rec = registry.get(id);
        if (!rec) return;
        const geom = rec.feature.getGeometry && rec.feature.getGeometry();
        if (!geom || !(geom instanceof ol.geom.Point)) return;
        const coord = geom.getCoordinates();
        try {
          map.getView().animate({
            center: coord,
            duration: 400,
            zoom: Math.max(12, map.getView().getZoom() || 10),
          });
        } catch {}
        showMarkerPopup(rec.feature);
      });

      // Right-aligned actions wrapper so Edit / Center / Delete sit together
      const actions = document.createElement('div');
      actions.className = 'marker-row-actions';
      actions.appendChild(editBtn);
      actions.appendChild(centerBtn);
      actions.appendChild(delBtn);

      row.appendChild(label);
      row.appendChild(actions);
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

    // On map click: if a user marker is hit, show popup with lat/lon; otherwise hide
    map.on('singleclick', (evt) => {
      let found = null;
      map.forEachFeatureAtPixel(
        evt.pixel,
        (feature, layer) => {
          if (layer === markersLayer) {
            found = feature;
            return true;
          }
          return false;
        },
        { hitTolerance: 5 }
      );

      if (found) {
        showMarkerPopup(found);
      } else {
        hideMarkerPopup();
      }
    });

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
