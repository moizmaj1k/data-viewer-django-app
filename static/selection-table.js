(function () {
  const SelectionTable = {
    button: null,
    snapshot: null,
    tableWindow: null,

    init() {
      if (this.button) return;
      this.button = document.getElementById('btn-open-selection-table');
      if (!this.button) return;

      this.button.disabled = true;
      this.button.setAttribute('aria-disabled', 'true');
      this.button.addEventListener('click', () => this.openWindow());
    },

    setSnapshot(snapshot) {
      const normalized = normalizeSnapshot(snapshot);
      const hasRoads = normalized && normalized.roads.length > 0;
      this.snapshot = hasRoads ? normalized : null;

      if (this.button) {
        this.button.disabled = !hasRoads;
        this.button.setAttribute('aria-disabled', (!hasRoads).toString());
      }

      if (!hasRoads) {
        this.teardownWindow();
        return;
      }

      if (this.tableWindow && !this.tableWindow.closed) {
        this.renderWindow();
      }
    },

    // Backward-compatible shim; treat minimal selection as snapshot
    setSelection(selection) {
      if (!selection) return this.setSnapshot(null);
      const snap = {
        district: selection.district || {},
        roads: Array.isArray(selection.roads) ? selection.roads : [],
        assets: Array.isArray(selection.assets)
          ? groupAssetsByType(selection.assets)
          : (selection.assets || {}),
      };
      this.setSnapshot(snap);
    },

    clearSelection() { this.setSnapshot(null); },

    openWindow() {
      if (!this.snapshot) return;
      if (!this.tableWindow || this.tableWindow.closed) {
        this.tableWindow = window.open('', 'selection-table', 'width=1200,height=800');
      }
      this.renderWindow();
      try { this.tableWindow.focus(); } catch (err) { console.warn('[selection-table] focus issue', err); }
    },

    teardownWindow() {
      if (this.tableWindow && !this.tableWindow.closed) this.tableWindow.close();
      this.tableWindow = null;
    },

    renderWindow() {
      if (!this.tableWindow || !this.snapshot) return;
      const sheets = buildSheets(this.snapshot);
      const doc = this.tableWindow.document;
      doc.open();
      doc.write(buildHtml(sheets, this.snapshot));
      doc.close();
      wireTabs(doc);
      wireTableInteractions(doc, sheets);
    }
  };

  function normalizeSnapshot(snapshot) {
    if (!snapshot) return null;
    const district = snapshot.district || {};
    const roads = Array.isArray(snapshot.roads) ? snapshot.roads : [];
    const assets = snapshot.assets || {};
    let assetsMap = {};
    if (Array.isArray(assets)) {
      assetsMap = groupAssetsByType(assets);
    } else if (typeof assets === 'object') {
      assetsMap = assets;
    }
    return {
      district: { code: district.code || '', name: district.name || '' },
      roads,
      assets: assetsMap,
    };
  }

  function groupAssetsByType(list) {
    const map = {};
    list.forEach(a => {
      const key = safeStr(a.type || a.label || a.asset_type || 'asset').toLowerCase();
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }

  function gatherColumns(rows) {
    const keys = [];
    rows.forEach(row => {
      Object.keys(row || {}).forEach(k => {
        if (!keys.includes(k)) keys.push(k);
      });
    });
    return keys;
  }

  function buildSheets(snapshot) {
    const sheets = [];
    if (snapshot.roads.length) {
      const roadCols = gatherColumns(snapshot.roads);
      const roadRows = snapshot.roads.map(r => roadCols.map(col => safeStr(r[col])));
      sheets.push({
        key: 'roads',
        title: 'Roads',
        tabLabel: `Roads (${snapshot.roads.length})`,
        columns: ['#', ...roadCols],
        rows: roadRows,
        rowsRaw: snapshot.roads,
      });
    }

    Object.entries(snapshot.assets || {}).forEach(([typeKey, rows]) => {
      const normalizedRows = Array.isArray(rows)
        ? rows.map(r => {
            const out = {...r};
            if (out.type === undefined) out.type = typeKey;
            return out;
          })
        : [];
      const cols = gatherColumns(normalizedRows);
      const rowCells = normalizedRows.map(r => cols.map(col => safeStr(r[col])));
      sheets.push({
        key: `asset-${typeKey || 'asset'}`,
        title: `${toTitle(typeKey)} assets`,
        tabLabel: `${toTitle(typeKey)} (${normalizedRows.length})`,
        columns: ['#', ...cols],
        rows: rowCells,
        rowsRaw: normalizedRows,
      });
    });

    return sheets;
  }

  function buildHtml(sheets, snapshot) {
    const hasTabs = sheets.length > 1;
    const district = snapshot.district || {};
    const districtLabel = district.name || district.code || 'All districts';
    const totalAssets = Object.values(snapshot.assets || {}).reduce((sum, arr) => {
      if (Array.isArray(arr)) return sum + arr.length;
      return sum;
    }, 0);
    const summary = `${snapshot.roads.length} road${snapshot.roads.length === 1 ? '' : 's'}`
      + (totalAssets ? ` | ${totalAssets} asset${totalAssets === 1 ? '' : 's'}` : '');

    const tabsHtml = hasTabs
      ? `<div class="st-tabs">
          ${sheets.map((s, idx) => `<button class="st-tab ${idx === 0 ? 'is-active' : ''}" data-sheet="${s.key}">${escapeHtml(s.tabLabel || s.title)}</button>`).join('')}
        </div>`
      : '';

    const sheetsHtml = sheets.map((s, idx) => `
      <section class="st-sheet ${idx === 0 ? 'is-active' : ''}" data-sheet="${s.key}">
        <div class="st-table-wrap">
          ${renderTable(s.columns, s.rows)}
        </div>
      </section>
    `).join('');

    return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Selection table</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: #f8fafc;
      color: #0f172a;
    }
    .st-header {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .st-chip {
      padding: 6px 10px;
      border-radius: 8px;
      background: #e2e8f0;
      color: #0f172a;
      font-weight: 600;
      font-size: 12px;
      letter-spacing: 0.02em;
    }
    .st-summary {
      font-size: 12px;
      color: #334155;
    }
    .st-tabs {
      display: flex;
      gap: 6px;
      margin: 10px 0 6px;
      flex-wrap: wrap;
    }
    .st-tab {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      padding: 4px 8px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      color: #0f172a;
      font-size: 12px;
    }
    .st-tab.is-active {
      background: #0ea5e9;
      border-color: #0284c7;
      color: #fff;
    }
    .st-sheet { display: none; }
    .st-sheet.is-active { display: block; }
    .st-table-wrap {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      overflow: auto;
      max-height: calc(100vh - 140px);
    }
    table.st-table {
      border-collapse: collapse;
      width: 100%;
      min-width: 780px;
      font-size: 12px;
    }
    table.st-table th,
    table.st-table td {
      border: 1px solid #e2e8f0;
      padding: 6px 8px;
      text-align: left;
      white-space: nowrap;
      user-select: text;
    }
    table.st-table thead th {
      background: #e2e8f0;
      font-weight: 700;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    table.st-table th.st-row-head {
      position: sticky;
      left: 0;
      z-index: 3;
      background: #cbd5e1;
      text-align: center;
    }
    table.st-table td.row-num {
      position: sticky;
      left: 0;
      z-index: 2;
      background: #e2e8f0;
      font-weight: 700;
      text-align: center;
    }
    table.st-table .row-empty {
      text-align: center;
      padding: 12px 8px;
      color: #94a3b8;
    }
    .st-cell-selected {
      background: #2563eb !important;
      color: #ffffff !important;
      font-weight: 700;
    }
    .st-finder {
      position: fixed;
      top: 12px;
      right: 12px;
      display: none;
      gap: 6px;
      align-items: center;
      padding: 8px 10px;
      background: #e2e8f0;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
    }
    .st-finder.is-visible { display: inline-flex; }
    .st-finder input {
      min-width: 180px;
      padding: 6px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 12px;
      outline: none;
    }
    .st-finder button {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      border-radius: 6px;
      padding: 6px 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
    }
    .st-finder button:hover { background: #e5e7eb; }
    .st-find-hit-span {
      background: #fef08a;
      color: #0f172a;
      padding: 0 1px;
    }
    .st-find-hit-active {
      background: #f59e0b !important;
      color: #0f172a !important;
      font-weight: 700;
    }
    .st-finder {
      position: fixed;
      top: 12px;
      right: 12px;
      display: none;
      gap: 6px;
      align-items: center;
      padding: 8px 10px;
      background: #e2e8f0;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
      z-index: 9;
    }
    .st-finder.is-visible { display: inline-flex; }
    .st-finder input {
      min-width: 200px;
      padding: 6px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 12px;
      outline: none;
    }
    .st-finder button {
      border: 1px solid #cbd5e1;
      background: #ffffff;
      border-radius: 6px;
      padding: 6px 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
    }
    .st-finder button:hover { background: #e5e7eb; }
.st-row-selected td,
    .st-row-selected th,
    .st-row-selected .row-num {
      background: #1d4ed8 !important;
      color: #ffffff !important;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="st-header">
    <span class="st-chip">District: ${escapeHtml(districtLabel || 'All')}</span>
    <span class="st-summary">${escapeHtml(summary)}</span>
  </div>
  ${tabsHtml}
  ${sheetsHtml}
  <div class="st-finder" id="st-finder">
    <input id="st-find-input" type="text" placeholder="Find..." />
    <span id="st-find-counter" style="font-size:12px;color:#0f172a;font-weight:600;">0/0</span>
    <button type="button" id="st-find-cancel">Cancel</button>
  </div>
</body>
</html>
    `;
  }

  function renderTable(columns, rows) {
    const header = columns.map((c, idx) => {
      if (idx === 0) return `<th class="st-row-head">#</th>`;
      return `<th>${escapeHtml(c)}</th>`;
    }).join('');

    const body = rows.length
      ? rows.map((row, idx) => `<tr>
            <td class="row-num">${idx + 1}</td>
            ${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}
          </tr>`).join('')
      : `<tr><td class="row-empty" colspan="${columns.length}">No data for this sheet</td></tr>`;

    return `
      <table class="st-table">
        <thead>
          <tr>${header}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function wireTabs(doc) {
    const tabs = doc.querySelectorAll('.st-tab');
    const sheets = doc.querySelectorAll('.st-sheet');
    if (!tabs.length) return;
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-sheet');
        tabs.forEach(t => t.classList.toggle('is-active', t === tab));
        sheets.forEach(s => s.classList.toggle('is-active', s.getAttribute('data-sheet') === key));
      });
    });
  }

  function wireTableInteractions(doc, sheetsMeta) {
    let selectedCell = null;
    let selectedRow = null;
    let activeText = '';
    let finder = null;
    let findMatches = [];
    let findIndex = -1;

    function clearCell() {
      if (selectedCell) selectedCell.classList.remove('st-cell-selected');
      selectedCell = null;
    }
    function clearRow() {
      if (selectedRow) selectedRow.classList.remove('st-row-selected');
      selectedRow = null;
    }
    function focusRow(sheetKey, rowIdx) {
      const sheet = sheetsMeta.find(s => s.key === sheetKey);
      if (!sheet || !Array.isArray(sheet.rowsRaw)) return;
      const row = sheet.rowsRaw[rowIdx];
      try {
        if (typeof window.centerOnSelectionRow === 'function') {
          // We are running in the opener realm, call directly.
          window.centerOnSelectionRow(row, sheetKey);
          return;
        }
        if (window.opener && !window.opener.closed && typeof window.opener.centerOnSelectionRow === 'function') {
          window.opener.centerOnSelectionRow(row, sheetKey);
        } else if (window.opener && !window.opener.closed) {
          window.opener.postMessage({
            type: 'selection-table:focus',
            payload: { sheetKey, rowIndex: rowIdx, row }
          }, '*');
        }
      } catch (err) {
        console.warn('[selection-table] focus postMessage failed', err);
      }
    }

    function selectCell(td, tr) {
      clearCell();
      clearRow();
      selectedCell = td;
      activeText = td.textContent || '';
      td.classList.add('st-cell-selected');
      if (tr) {
        selectedRow = tr;
        tr.classList.add('st-row-selected');
      }
    }

    function escapeRegExp(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function unwrapFindSpans() {
      const spans = Array.from(doc.querySelectorAll('.st-find-hit-span'));
      spans.forEach(span => {
        const parent = span.parentNode;
        if (!parent) return;
        parent.replaceChild(doc.createTextNode(span.textContent || ''), span);
        parent.normalize();
      });
    }

    function refreshFinder(term) {
      unwrapFindSpans();
      findMatches.forEach(el => el.classList.remove('st-find-hit-active'));
      findMatches = [];
      findIndex = -1;
      const counter = doc.getElementById('st-find-counter');
      if (counter) counter.textContent = '0/0';
      if (!term) return;
      const activeSheet = doc.querySelector('.st-sheet.is-active');
      if (!activeSheet) return;
      const tds = Array.from(activeSheet.querySelectorAll('tbody td'));
      const re = new RegExp(`(${escapeRegExp(term)})`, 'gi');
      tds.forEach(td => {
        const text = td.textContent || '';
        if (!re.test(text)) return;
        td.innerHTML = escapeHtml(text).replace(re, '<mark class=\"st-find-hit-span\">$1</mark>');
      });
      findMatches = Array.from(activeSheet.querySelectorAll('.st-find-hit-span'));
      if (counter) counter.textContent = `0/${findMatches.length}`;
    }

    function gotoMatch(direction = 1) {
      if (!findMatches.length) return;
      findMatches.forEach(el => el.classList.remove('st-find-hit-active'));
      findIndex = (findIndex + direction + findMatches.length) % findMatches.length;
      const target = findMatches[findIndex];
      target.classList.add('st-find-hit-active');
      const td = target.closest('td');
      const tr = target.closest('tr');
      clearCell();
      clearRow();
      selectedCell = td;
      if (tr) selectedRow = tr;
      target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      const counter = doc.getElementById('st-find-counter');
      if (counter) counter.textContent = `${findIndex + 1}/${findMatches.length}`;
    }

    function ensureFinder(doc) {
      if (finder) return finder;
      finder = {
        bar: doc.getElementById('st-finder'),
        input: doc.getElementById('st-find-input'),
        cancel: doc.getElementById('st-find-cancel'),
        open() {
          this.bar?.classList.add('is-visible');
          this.input?.focus();
          this.input?.select();
        },
        close() {
          this.bar?.classList.remove('is-visible');
          refreshFinder('');
        }
      };
      if (finder.input) {
        finder.input.addEventListener('input', () => refreshFinder(finder.input.value));
        finder.input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
        gotoMatch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        finder.close();
      }
    });
  }
      finder.cancel?.addEventListener('click', () => finder.close());
      return finder;
    }

    doc.querySelectorAll('.st-sheet').forEach(section => {
      const sheetKey = section.getAttribute('data-sheet');
      const rows = Array.from(section.querySelectorAll('tbody tr'));
      rows.forEach((tr, idx) => {
        tr.dataset.rowIndex = String(idx);
        const rowNumCell = tr.querySelector('.row-num');
        if (rowNumCell) {
          rowNumCell.addEventListener('click', () => {
            clearCell();
            clearRow();
            tr.classList.add('st-row-selected');
            selectedRow = tr;
            focusRow(sheetKey, idx);
          });
        }
        tr.querySelectorAll('td').forEach((td) => {
          td.addEventListener('click', (e) => {
            if (td.classList.contains('row-num')) return;
            selectCell(td, null);
          });
        });
      });
    });

    doc.addEventListener('keydown', (e) => {
      const key = e.key ? e.key.toLowerCase() : '';
      if ((e.ctrlKey || e.metaKey) && key === 'f') {
        e.preventDefault();
        ensureFinder(doc).open();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'c') {
        if (!selectedCell) return;
        e.preventDefault();
        const text = selectedCell.textContent || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(() => {
            tryCopyFallback(doc, text);
          });
        } else {
          tryCopyFallback(doc, text);
        }
      }
    });

    // Re-run finder highlights when tab changes
    doc.querySelectorAll('.st-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (finder && finder.bar?.classList.contains('is-visible')) {
          refreshFinder(finder.input?.value || '');
        }
      });
    });
  }

  function tryCopyFallback(doc, text) {
    const temp = doc.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    doc.body.appendChild(temp);
    temp.focus();
    temp.select();
    try { doc.execCommand('copy'); } catch (err) { console.warn('Copy failed', err); }
    temp.remove();
  }

  function escapeHtml(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeStr(val) { return val == null ? '' : String(val); }

  function toTitle(val) {
    const str = safeStr(val).replace(/[_-]+/g, ' ').trim();
    if (!str) return 'Asset';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  document.addEventListener('DOMContentLoaded', () => SelectionTable.init());
  window.SelectionTable = SelectionTable;
})();
