(function () {
  const $ = (sel) => document.querySelector(sel);
  let mapRef = null;                   // OpenLayers map
  let vectorCounter = 0;               // for unique layer names
  let pendingFile = null;              // file selected or dropped

  // Popup for KMZ line attributes
  let kmzPopupEl = null;

  // --- Boundary selection state -------------------------------------------
  let activeBoundaryFeature = null;

  /**
   * Toggle "boundary" styling on a KMZ line feature.
   * Stores original style in feature._origStyleSaved and flag in feature._isBoundary
   */
  function setBoundaryFeature(feature, useAsBoundary) {
    if (!feature) return;

    // If there is an existing boundary feature and it's different, restore it
    if (activeBoundaryFeature && activeBoundaryFeature !== feature) {
      if (activeBoundaryFeature._origStyleSaved) {
        activeBoundaryFeature.setStyle(activeBoundaryFeature._origStyleSaved);
      } else {
        // null => fall back to layer/KML style
        activeBoundaryFeature.setStyle(null);
      }
      activeBoundaryFeature._isBoundary = false;
    }

    if (useAsBoundary) {
      // Save original style once
      if (typeof feature._origStyleSaved === 'undefined') {
        feature._origStyleSaved = feature.getStyle ? feature.getStyle() : null;
      }

      // Figure out a label text from "name" column (case-insensitive),
      // fallback to first non-empty property if needed
      let labelText = '';
      const nameKeys = ['name', 'Name', 'NAME'];
      for (const key of nameKeys) {
        const v = feature.get && feature.get(key);
        if (v !== null && v !== undefined && v !== '') {
          labelText = String(v);
          break;
        }
      }
      if (!labelText && feature.getProperties) {
        const props = { ...feature.getProperties() };
        delete props.geometry;
        const firstKey = Object.keys(props)[0];
        if (firstKey) {
          labelText = String(props[firstKey]);
        }
      }

      // --- Boundary style: dashed line + limited labels following the line ---
      feature.setStyle((feat, resolution) => {
        const styles = [];

        // 1) Base dashed boundary line
        styles.push(
          new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: '#ec4899',
              width: 4,
              lineDash: [10, 6],
            }),
          })
        );

        // 2) Labels that follow the line direction, with white halo around letters
        if (labelText) {
          const geom = feat.getGeometry && feat.getGeometry();
          if (geom && geom.getType) {
            let line = null;
            const type = geom.getType();

            if (type === 'LineString') {
              line = geom;
            } else if (type === 'MultiLineString') {
              line = geom.getLineString(0);
            }

            if (line) {
              const length = line.getLength();           // map units
              const pixelLength = length / resolution;   // approx px on screen

              // Aim for ~1 label per 350px, clamped so we don't spam
              let labelCount = Math.round(pixelLength / 350);
              labelCount = Math.max(1, Math.min(labelCount, 15)); // between 1 and 4 labels

              for (let i = 0; i < labelCount; i++) {
                const tCenter = (i + 0.5) / labelCount;

                // Small segment around the center so text can align with local direction
                const t1 = Math.max(0, tCenter - 0.02);
                const t2 = Math.min(1, tCenter + 0.02);

                const seg = new ol.geom.LineString([
                  line.getCoordinateAt(t1),
                  line.getCoordinateAt(t2),
                ]);

                styles.push(
                  new ol.style.Style({
                    geometry: seg,
                    text: new ol.style.Text({
                      text: labelText,
                      placement: 'line', // follow the line segment
                      font:
                        '13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      fill: new ol.style.Fill({ color: '#000000' }),
                      // white halo around letters (no rectangle)
                      stroke: new ol.style.Stroke({
                        color: 'rgba(255,255,255,0.95)',
                        width: 3,
                      }),
                      offsetY: -2,      // small offset away from the line
                      overflow: true,
                      maxAngle: Math.PI / 4,
                    }),
                  })
                );
              }
            }
          }
        }

        return styles;
      });


      feature._isBoundary = true;
      activeBoundaryFeature = feature;

      console.log('[boundary] set on feature', feature.getId?.() || feature.get('name'));
    } else {
      // Turning off boundary for this feature
      if (feature._origStyleSaved) {
        feature.setStyle(feature._origStyleSaved);
      } else {
        feature.setStyle(null);
      }
      feature._isBoundary = false;

      if (activeBoundaryFeature === feature) {
        activeBoundaryFeature = null;
      }

      console.log('[boundary] cleared');
    }
  }

  function ensureKmzPopup() {
    if (kmzPopupEl) return kmzPopupEl;
    const el = document.createElement('div');
    el.className = 'kmz-popup';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'KMZ feature details');
    document.body.appendChild(el);
    kmzPopupEl = el;
    return el;
  }

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

    // Center icon button – fit map view to this layer's extent
    const centerBtn = document.createElement('button');
    centerBtn.type = 'button';
    centerBtn.className = 'layer-center-btn';
    centerBtn.setAttribute('title', 'Center map on layer');

    centerBtn.addEventListener('click', async () => {
      try {
        const map = await ensureMap();
        if (!map || !layer || !layer.getSource) return;
        const src = layer.getSource();
        if (!src || !src.getExtent) return;
        const extent = src.getExtent();
        if (!extent || !isFinite(extent[0])) return;

        map.getView().fit(extent, {
          duration: 450,
          padding: [40, 40, 40, 40],
          maxZoom: 18,
        });
      } catch (e) {
        console.warn('fit failed for user layer', e);
      }
    });

    // Delete icon button
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

    // Right-aligned actions wrapper: Center + Delete
    const actions = document.createElement('div');
    actions.className = 'layer-row-actions';
    actions.appendChild(centerBtn);
    actions.appendChild(delBtn);

    row.appendChild(label);
    row.appendChild(actions);
    layerTogglesEl.appendChild(row);
  }


  function addVectorLayerFromFeatures(map, features, nameHint, options = {}) {
    if (!features || features.length === 0) {
      status('No features found in the selected file.', true);
      return;
    }
    const { isKmzLayer = false } = options;
    const src = new ol.source.Vector({ features });
    const lyr = new ol.layer.Vector({
      source: src,
      zIndex: 50,
      properties: { userLayer: true, title: nameHint || `Custom Layer ${++vectorCounter}` }
    });
    lyr.set('isUserLayer', true);
    lyr.set('isKmzLayer', isKmzLayer);
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
        // Optionally skip the largest polygon (district boundary) if requested
        const skipBoundary = $('#layer-skip-boundary')?.checked;
        let kmzFeatures = all;

        if (skipBoundary && all.length) {
          const polys = all.filter(f => {
            const g = f.getGeometry && f.getGeometry();
            const type = g && g.getType && g.getType();
            return type === 'Polygon' || type === 'MultiPolygon';
          });

          if (polys.length) {
            let biggest = null;
            let biggestArea = -Infinity;

            polys.forEach(f => {
              const g = f.getGeometry();
              try {
                const extent = g.getExtent();
                const areaApprox =
                  (extent[2] - extent[0]) *
                  (extent[3] - extent[1]); // bbox area approximation is enough
                if (areaApprox > biggestArea) {
                  biggestArea = areaApprox;
                  biggest = f;
                }
              } catch {}
            });

            if (biggest) {
              kmzFeatures = all.filter(f => f !== biggest);
            }
          }
        }

        // If KML(s) produced features, add them now (we’ll also check for Shapefiles below)
        if (kmzFeatures.length) {
          addVectorLayerFromFeatures(map, kmzFeatures, nameHint, { isKmzLayer: true });
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
              addVectorLayerFromFeatures(map, f2, `${nameHint} (SHP)`, { isKmzLayer: true });
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

  async function setupKmzClickHandler() {
    let map;
    try {
      map = await ensureMap();
    } catch {
      return;
    }
    if (!map) return;

    // Hide popup on map move
    map.on('movestart', () => {
      if (kmzPopupEl) kmzPopupEl.style.display = 'none';
    });

    map.on('singleclick', (evt) => {
      // Hide any previous popup
      if (kmzPopupEl) kmzPopupEl.style.display = 'none';

      let foundFeature = null;
      let foundLayer = null;

      map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
        if (!layer) return;
        if (!layer.get || !layer.get('isUserLayer') || !layer.get('isKmzLayer')) return;

        const geom = feature.getGeometry && feature.getGeometry();
        const type = geom && geom.getType && geom.getType();
        if (type === 'LineString' || type === 'MultiLineString') {
          foundFeature = feature;
          foundLayer = layer;
          return true; // stop iteration
        }
      });

      if (!foundFeature) return;

      const props = foundFeature.getProperties ? { ...foundFeature.getProperties() } : {};
      delete props.geometry;

      const entries = Object.entries(props).filter(([k, v]) =>
        v !== null && v !== undefined && v !== ''
      );

      if (!entries.length) return;

      const popup = ensureKmzPopup();
      const title = foundLayer.get('name') || foundLayer.get('title') || 'KMZ feature';

      const isBoundary = !!foundFeature._isBoundary;

      let html = `
        <div class="kmz-popup-head">
          <strong>${title}</strong>
          <button type="button" class="kmz-popup-close" aria-label="Close">×</button>
        </div>
        <div class="kmz-popup-body">
          <div class="kmz-popup-row kmz-popup-row--boundary">
            <label class="kmz-boundary-toggle">
              <input type="checkbox" class="kmz-boundary-checkbox" ${isBoundary ? 'checked' : ''}>
              <span>Display name on boundary</span>
            </label>
          </div>
          <table>
      `;

      // Limit to first 20 fields
      entries.slice(0, 20).forEach(([k, v]) => {
        html += `<tr><th>${String(k)}</th><td>${String(v)}</td></tr>`;
      });

      html += '</table></div>';

      popup.innerHTML = html;

      // Wire up boundary checkbox behaviour
      const boundaryCheckbox = popup.querySelector('.kmz-boundary-checkbox');
      if (boundaryCheckbox) {
        boundaryCheckbox.addEventListener('change', () => {
          const checked = boundaryCheckbox.checked;
          setBoundaryFeature(foundFeature, checked);
        });
      }

      const mapEl = map.getTargetElement();
      const mapRect = mapEl.getBoundingClientRect();
      const pixel = evt.pixel;

      const x = mapRect.left + pixel[0] + 10;
      const y = mapRect.top + pixel[1] + 10;

      popup.style.left = `${x}px`;
      popup.style.top = `${y}px`;
      popup.style.display = 'block';

      const closeBtn = popup.querySelector('.kmz-popup-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          popup.style.display = 'none';
        }, { once: true });
      }
    });

    // Click outside popup closes it
    document.addEventListener('click', (e) => {
      if (!kmzPopupEl || kmzPopupEl.style.display !== 'block') return;
      if (e.target.closest('.kmz-popup')) return;
      kmzPopupEl.style.display = 'none';
    });
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
    document.addEventListener('DOMContentLoaded', () => {
      bind();
      setupKmzClickHandler();
    });
  } else {
    bind();
    setupKmzClickHandler();
  }
})();
