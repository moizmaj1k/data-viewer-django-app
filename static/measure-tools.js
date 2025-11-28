// measure-tools.js
/* Measurement tools (length & area) using OpenLayers vector styles
   This is additive and does NOT change existing behaviour.
*/
(function () {
  // Same helper pattern as in markers.js / layers.js
  function whenAppMapReady(fn) {
    if (window.__APP_MAP_READY__ && window.AppMap) return fn(window.AppMap);
    (window.__APP_MAP_WAITERS__ = window.__APP_MAP_WAITERS__ || []).push(fn);
  }

  whenAppMapReady(({ map, ol }) => {
    // --- UI elements ---
    const toggleBtn = document.getElementById('map-measure-toggle');
    const panel = document.getElementById('map-measure-panel');
    const typeSelect = document.getElementById('map-measure-type');
    const showSegmentsEl = document.getElementById('map-measure-segments');
    const clearPreviousEl = document.getElementById(
      'map-measure-clear-previous'
    );
    const startBtn = document.getElementById('map-measure-start');
    const stopBtn = document.getElementById('map-measure-stop');
    const clearAllBtn = document.getElementById('map-measure-clear-all');

    if (
      !toggleBtn ||
      !panel ||
      !typeSelect ||
      !showSegmentsEl ||
      !clearPreviousEl ||
      !startBtn ||
      !stopBtn ||
      !clearAllBtn
    ) {
      // If the HTML is not present, silently bail.
      return;
    }

    // --- Toggle dropdown ---
    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('is-hidden');
    });

    // --- Measurement layer + source ---
    const measureSource = new ol.source.Vector();
    const measureLayer = new ol.layer.Vector({
      source: measureSource,
      zIndex: 70, // above roads/assets, below markers if you want
      style: function (feature) {
        return styleFunction(
          feature,
          showSegmentsEl.checked,
          currentDrawType,
          false
        );
      },
    });
    map.addLayer(measureLayer);

    // --- Styles (ported from example, using global ol.*) ---
    const baseStyle = new ol.style.Style({
      fill: new ol.style.Fill({
        color: 'rgba(255, 255, 255, 0.2)',
      }),
      stroke: new ol.style.Stroke({
        color: 'rgba(0, 0, 0, 0.5)',
        lineDash: [10, 10],
        width: 2,
      }),
      image: new ol.style.Circle({
        radius: 5,
        stroke: new ol.style.Stroke({
          color: 'rgba(0, 0, 0, 0.7)',
        }),
        fill: new ol.style.Fill({
          color: 'rgba(255, 255, 255, 0.2)',
        }),
      }),
    });
    // Final style (after double-click) — golden yellow, no dash
    const finalBaseStyle = baseStyle.clone();
    if (finalBaseStyle.getStroke()) {
      finalBaseStyle.getStroke().setColor('#fbbf24'); // golden yellow
      finalBaseStyle.getStroke().setLineDash(null);
    }


    const labelStyle = new ol.style.Style({
      text: new ol.style.Text({
        font: '14px Calibri,sans-serif',
        fill: new ol.style.Fill({
          color: 'rgba(255, 255, 255, 1)',
        }),
        backgroundFill: new ol.style.Fill({
          color: 'rgba(0, 0, 0, 0.7)',
        }),
        padding: [3, 3, 3, 3],
        textBaseline: 'bottom',
        offsetY: -15,
      }),
      image: new ol.style.RegularShape({
        radius: 8,
        points: 3,
        angle: Math.PI,
        displacement: [0, 10],
        fill: new ol.style.Fill({
          color: 'rgba(0, 0, 0, 0.7)',
        }),
      }),
    });

    const tipStyle = new ol.style.Style({
      text: new ol.style.Text({
        font: '12px Calibri,sans-serif',
        fill: new ol.style.Fill({
          color: 'rgba(255, 255, 255, 1)',
        }),
        backgroundFill: new ol.style.Fill({
          color: 'rgba(0, 0, 0, 0.4)',
        }),
        padding: [2, 2, 2, 2],
        textAlign: 'left',
        offsetX: 15,
      }),
    });

    const segmentStyle = new ol.style.Style({
      text: new ol.style.Text({
        font: '12px Calibri,sans-serif',
        fill: new ol.style.Fill({
          color: 'rgba(255, 255, 255, 1)',
        }),
        backgroundFill: new ol.style.Fill({
          color: 'rgba(0, 0, 0, 0.4)',
        }),
        padding: [2, 2, 2, 2],
        textBaseline: 'bottom',
        offsetY: -12,
      }),
      image: new ol.style.RegularShape({
        radius: 6,
        points: 3,
        angle: Math.PI,
        displacement: [0, 8],
        fill: new ol.style.Fill({
          color: 'rgba(0, 0, 0, 0.4)',
        }),
      }),
    });

    const segmentStyles = [segmentStyle];

    // --- Formatting helpers (sphere length/area) ---
    function formatLength(line) {
      const length = ol.sphere.getLength(line);
      let output;
      if (length > 100) {
        output = Math.round((length / 1000) * 100) / 100 + ' km';
      } else {
        output = Math.round(length * 100) / 100 + ' m';
      }
      return output;
    }

    function formatArea(polygon) {
      const area = ol.sphere.getArea(polygon);
      let output;
      if (area > 10000) {
        output = Math.round((area / 1000000) * 100) / 100 + ' km²';
      } else {
        output = Math.round(area * 100) / 100 + ' m²';
      }
      return output;
    }

    let tipPoint = null;
    let currentDrawType = null;

    function styleFunction(feature, segments, drawType, tip) {
      const styles = [];
      const geometry = feature.getGeometry();
      const type = geometry.getType();
      const isFinal = !!feature.get('isFinal'); // finalized flag

      let point, label, line;

      if (!drawType || drawType === type || type === 'Point') {
        // Use golden style for finalized features
        styles.push(isFinal ? finalBaseStyle : baseStyle);

        if (type === 'Polygon') {
          point = geometry.getInteriorPoint();
          label = formatArea(geometry);
          line = new ol.geom.LineString(geometry.getCoordinates()[0]);
        } else if (type === 'LineString') {
          point = new ol.geom.Point(geometry.getLastCoordinate());
          label = formatLength(geometry);
          line = geometry;
        }
      }

      if (segments && line) {
        let count = 0;
        line.forEachSegment(function (a, b) {
          const segment = new ol.geom.LineString([a, b]);
          const segLabel = formatLength(segment);
          if (segmentStyles.length - 1 < count) {
            segmentStyles.push(segmentStyle.clone());
          }
          const segmentPoint = new ol.geom.Point(
            segment.getCoordinateAt(0.5)
          );
          segmentStyles[count].setGeometry(segmentPoint);
          segmentStyles[count].getText().setText(segLabel);
          styles.push(segmentStyles[count]);
          count++;
        });
      }

      if (label) {
        labelStyle.setGeometry(point);
        labelStyle.getText().setText(label);
        styles.push(labelStyle);
      }

      if (tip && type === 'Point') {
        tipPoint = geometry;
        tipStyle.getText().setText(tip);
        styles.push(tipStyle);
      }

      return styles;
    }

    // --- Draw interaction management ---
    let drawInteraction = null;

    function startMeasuring() {
      // Remove any existing interaction
      if (drawInteraction) {
        map.removeInteraction(drawInteraction);
        drawInteraction = null;
      }

      currentDrawType = typeSelect.value || 'LineString';

      const activeTip =
        'Click to continue drawing the ' +
        (currentDrawType === 'Polygon' ? 'polygon' : 'line');
      const idleTip = 'Click to start measuring';

      let tip = idleTip;

      drawInteraction = new ol.interaction.Draw({
        source: measureSource,
        type: currentDrawType,
        style: function (feature) {
          return styleFunction(
            feature,
            showSegmentsEl.checked,
            currentDrawType,
            tip
          );
        },
      });

      drawInteraction.on('drawstart', function () {
        if (clearPreviousEl.checked) {
          measureSource.clear();
        }
        tip = activeTip;
      });

      drawInteraction.on('drawend', function (evt) {
        tip = idleTip;

        // Mark this feature as finalized so styling switches to golden
        if (evt && evt.feature) {
          evt.feature.set('isFinal', true);
        }
      });

      map.addInteraction(drawInteraction);
      stopBtn.disabled = false;
    }

    function stopMeasuring() {
      if (drawInteraction) {
        map.removeInteraction(drawInteraction);
        drawInteraction = null;
      }
      stopBtn.disabled = true;
    }

    // --- Wire up buttons ---
    startBtn.addEventListener('click', () => {
      startMeasuring();
    });

    stopBtn.addEventListener('click', () => {
      stopMeasuring();
    });

    clearAllBtn.addEventListener('click', () => {
      measureSource.clear();
    });

    // When user flips between LineString / Polygon while idle,
    // we just update the type for the *next* Start Measuring.
    typeSelect.addEventListener('change', () => {
      currentDrawType = typeSelect.value;
      // If currently drawing, restart with new type
      if (drawInteraction) {
        stopMeasuring();
        startMeasuring();
      }
    });

    // When "show segment lengths" is toggled,
    // refresh layer and current draw overlay if any.
    showSegmentsEl.addEventListener('change', () => {
      measureLayer.changed();
      if (drawInteraction && drawInteraction.getOverlay()) {
        drawInteraction.getOverlay().changed();
      }
    });

    // Safety: disable measuring if map is destroyed / reloaded (optional)
    window.addEventListener('beforeunload', () => {
      if (drawInteraction) {
        map.removeInteraction(drawInteraction);
      }
    });
  });
})();
