const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT99URla5Sl0nvFoF1Th5t73tRbC5y3gtlo0raAFGkj3TvptBtO-X2DpWC2_A32ha2da5DDlmfm2hwe/pub?gid=1200107546&single=true&output=csv';

const ORIGINAL_WEIGHT_KG = 90.8;

let myLossPct = null;
let latestPoint = null;
let editedCurrentWeight = null;
let isEditingCurrentWeight = false;

function $(id) {
  return document.getElementById(id);
}

function showNAState() {
  const errorEl = $('error');
  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  latestPoint = null;
  editedCurrentWeight = null;
  isEditingCurrentWeight = false;
  myLossPct = null;

  const currentWeightEl = $('currentWeight');
  if (currentWeightEl) {
    currentWeightEl.textContent = 'NA';
  }

  const pctEl = $('currentLossPct');
  if (pctEl) {
    pctEl.textContent = '—';
  }

  const currentMetaEl = $('currentMeta');
  if (currentMetaEl) {
    currentMetaEl.textContent = '';
  }

  const rangeMetaEl = $('rangeMeta');
  if (rangeMetaEl) {
    rangeMetaEl.textContent = '';
  }

  const lineEl = $('line');
  if (lineEl) {
    lineEl.setAttribute('d', '');
  }
  const areaEl = $('area');
  if (areaEl) {
    areaEl.setAttribute('d', '');
  }
  const gridEl = $('grid');
  if (gridEl) {
    while (gridEl.firstChild) {
      gridEl.removeChild(gridEl.firstChild);
    }
  }
}

function parseCsv(text) {
  // Minimal CSV parser that supports quoted values.
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(cur);
      cur = '';
      continue;
    }

    if (ch === '\n') {
      row.push(cur.replace(/\r$/, ''));
      cur = '';
      if (row.some((c) => String(c).trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cur += ch;
  }

  if (cur.length > 0 || row.length > 0) {
    row.push(cur.replace(/\r$/, ''));
    if (row.some((c) => String(c).trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function toNumber(value) {
  const s = String(value ?? '').trim();
  if (!s) {
    return null;
  }
  const cleaned = s.replace(/[^0-9.+-]/g, '');
  if (!cleaned) {
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseTimestamp(value) {
  const s = String(value ?? '').trim();
  if (!s) {
    return null;
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  // Prefer explicit Y-M-D (optionally with time) and interpret as LOCAL time.
  // Supports:
  // - 2026-02-16
  // - 2026-02-16 07:30
  // - 2026-02-16T07:30
  // - 2026-02-16 07:30:00
  const ymdTime = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (ymdTime) {
    const yyyy = Number(ymdTime[1]);
    const mm = Number(ymdTime[2]);
    const dd = Number(ymdTime[3]);
    const hh = ymdTime[4] != null ? Number(ymdTime[4]) : 0;
    const min = ymdTime[5] != null ? Number(ymdTime[5]) : 0;
    const sec = ymdTime[6] != null ? Number(ymdTime[6]) : 0;
    const hasTime = ymdTime[4] != null;

    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && hh >= 0 && hh <= 23 && min >= 0 && min <= 59) {
      const d = new Date(yyyy, mm - 1, dd, hh, min, sec, 0);
      const isoDate = `${String(yyyy).padStart(4, '0')}-${pad2(mm)}-${pad2(dd)}`;
      const isoText = hasTime ? `${isoDate} ${pad2(hh)}:${pad2(min)}` : isoDate;
      return { ms: d.getTime(), isoDate, isoText, hasTime };
    }
  }

  // M/D/YYYY (optionally with time) — interpret as LOCAL time.
  const mdyTime = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (mdyTime) {
    const a = Number(mdyTime[1]);
    const b = Number(mdyTime[2]);
    const yyyy = Number(mdyTime[3]);
    const hh = mdyTime[4] != null ? Number(mdyTime[4]) : 0;
    const min = mdyTime[5] != null ? Number(mdyTime[5]) : 0;
    const sec = mdyTime[6] != null ? Number(mdyTime[6]) : 0;
    const hasTime = mdyTime[4] != null;

    // Heuristic for dd/mm vs mm/dd:
    // - If the first number can't be a month (13-31), treat as dd/mm.
    // - If the second number can't be a day for mm/dd (13-31), treat as mm/dd.
    // - If ambiguous (<=12 and <=12), assume mm/dd (Google Sheets US default).
    let mm;
    let dd;
    if (a > 12 && b >= 1 && b <= 12) {
      dd = a;
      mm = b;
    } else {
      mm = a;
      dd = b;
    }

    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && hh >= 0 && hh <= 23 && min >= 0 && min <= 59) {
      const d = new Date(yyyy, mm - 1, dd, hh, min, sec, 0);
      const isoDate = `${String(yyyy).padStart(4, '0')}-${pad2(mm)}-${pad2(dd)}`;
      const isoText = hasTime ? `${isoDate} ${pad2(hh)}:${pad2(min)}` : isoDate;
      return { ms: d.getTime(), isoDate, isoText, hasTime };
    }
  }

  // Fallback to Date.parse for other formats.
  const t = Date.parse(s);
  if (!Number.isFinite(t)) {
    return null;
  }
  const d = new Date(t);
  const yyyy = d.getFullYear();
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = d.getHours();
  const min = d.getMinutes();
  const hasTime = hh !== 0 || min !== 0;
  const isoDate = `${String(yyyy).padStart(4, '0')}-${pad2(mm)}-${pad2(dd)}`;
  const isoText = hasTime ? `${isoDate} ${pad2(hh)}:${pad2(min)}` : isoDate;
  return { ms: d.getTime(), isoDate, isoText, hasTime };
}

function extractPointsFromCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    return [];
  }

  const header = rows[0].map(normalizeHeader);

  let dateIdx = header.findIndex(
    (h) => h === 'timestamp' || h.includes('timestamp') || h === 'date' || h.includes('date')
  );
  let weightIdx = header.findIndex(
    (h) => h === 'weight' || h.includes('weight') || h.includes('lbs') || h.includes('lb') || h.includes('kg')
  );

  const startRow = dateIdx >= 0 || weightIdx >= 0 ? 1 : 0;
  if (dateIdx < 0) {
    dateIdx = 0;
  }
  if (weightIdx < 0) {
    weightIdx = 1;
  }

  const points = [];
  for (let i = startRow; i < rows.length; i++) {
    const r = rows[i];
    const ts = parseTimestamp(r[dateIdx]);
    const weight = toNumber(r[weightIdx]);
    if (!ts || weight === null) {
      continue;
    }
    points.push({ t: ts.ms, date: ts.isoText, isoDate: ts.isoDate, hasTime: ts.hasTime, weight });
  }

  points.sort((a, b) => a.t - b.t);

  const deduped = [];
  for (const p of points) {
    const last = deduped[deduped.length - 1];
    if (last && last.t === p.t) {
      deduped[deduped.length - 1] = p;
    } else {
      deduped.push(p);
    }
  }

  return deduped;
}

function formatXAxisTimestamp(point, includeTime) {
  if (!point) {
    return '';
  }
  const d = new Date(point.t);
  const opts = includeTime
    ? { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: '2-digit' };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

async function loadData() {
  const maybeWindow = typeof window !== 'undefined' ? window : null;
  if (maybeWindow) {
    const testPoints = maybeWindow.WT_TEST_POINTS;
    if (Array.isArray(testPoints) && testPoints.length) {
      return testPoints;
    }

    const testCsvText = maybeWindow.WT_TEST_CSV_TEXT;
    if (typeof testCsvText === 'string' && testCsvText.trim()) {
      return extractPointsFromCsv(testCsvText);
    }
  }

  const res = await fetch(CSV_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`CSV fetch failed: ${res.status}`);
  }
  const csvText = await res.text();
  const points = extractPointsFromCsv(csvText);
  return points;
}

function formatWeight(w) {
  const rounded = Math.round(w * 10) / 10;
  const asInt = Math.round(rounded);
  return Math.abs(rounded - asInt) < 1e-9 ? String(asInt) : rounded.toFixed(1);
}

function formatPct(n) {
  if (!Number.isFinite(n)) {
    return '—';
  }
  const rounded = Math.round(n * 10) / 10;
  return `${rounded.toFixed(1)}%`;
}

function readInputNumber(el) {
  if (!el) {
    return null;
  }
  return toNumber(el.value);
}

function clearCompareClasses(...els) {
  for (const el of els) {
    if (!el) {
      continue;
    }
    el.classList.remove('compareHigher', 'compareLower');
  }
}

function getEffectiveCurrentWeight() {
  if (Number.isFinite(editedCurrentWeight)) {
    return editedCurrentWeight;
  }
  return latestPoint?.weight ?? null;
}

function updateCurrentLossPctForWeight(weight) {
  const pctEl = $('currentLossPct');
  if (!pctEl) {
    return;
  }

  if (Number.isFinite(weight) && Number.isFinite(ORIGINAL_WEIGHT_KG) && ORIGINAL_WEIGHT_KG !== 0) {
    const delta = ORIGINAL_WEIGHT_KG - weight;
    const pct = (delta / ORIGINAL_WEIGHT_KG) * 100;
    myLossPct = pct;
    pctEl.textContent = delta >= 0 ? `${formatPct(pct)} loss` : `${formatPct(Math.abs(pct))} gain`;
  } else {
    pctEl.textContent = '—';
    myLossPct = null;
  }

  updateUserComparison();
}

function renderCurrentWeightValue() {
  const el = $('currentWeight');
  if (!el || isEditingCurrentWeight) {
    return;
  }

  const weight = getEffectiveCurrentWeight();
  el.textContent = Number.isFinite(weight) ? formatWeight(weight) : '—';
  updateCurrentLossPctForWeight(weight);
}

function startCurrentWeightEdit() {
  const el = $('currentWeight');
  if (!el || isEditingCurrentWeight) {
    return;
  }

  isEditingCurrentWeight = true;
  const prevEdited = editedCurrentWeight;

  const current = getEffectiveCurrentWeight();
  const input = document.createElement('input');
  input.className = 'input currentWeightInline';
  input.setAttribute('inputmode', 'decimal');
  input.setAttribute('aria-label', 'Edit current weight (kg)');
  input.value = Number.isFinite(current) ? formatWeight(current) : '';

  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();

  const updateFromInput = () => {
    const n = toNumber(input.value);
    editedCurrentWeight = Number.isFinite(n) ? n : null;
    updateCurrentLossPctForWeight(editedCurrentWeight);
  };

  const cleanupAndRender = () => {
    isEditingCurrentWeight = false;
    renderCurrentWeightValue();
  };

  const commit = () => {
    const n = toNumber(input.value);
    editedCurrentWeight = Number.isFinite(n) ? n : null;
    cleanupAndRender();
  };

  const cancel = () => {
    editedCurrentWeight = prevEdited;
    cleanupAndRender();
  };

  input.addEventListener('input', updateFromInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener('blur', () => {
    commit();
  }, { once: true });
}

function updateUserComparison() {
  const originalEl = $('userOriginal');
  const currentEl = $('userCurrent');
  const outEl = $('userLossPct');
  const compareEl = $('userCompare');
  if (!outEl || !compareEl) {
    return;
  }

  const original = readInputNumber(originalEl);
  const current = readInputNumber(currentEl);

  clearCompareClasses(outEl, compareEl);

  if (!Number.isFinite(original) || !Number.isFinite(current) || original === 0) {
    outEl.textContent = '—';
    compareEl.textContent = '';
    return;
  }

  const delta = original - current;
  const pct = (delta / original) * 100;
  outEl.textContent = delta >= 0 ? `${formatPct(pct)} loss` : `${formatPct(Math.abs(pct))} gain`;

  if (!Number.isFinite(myLossPct)) {
    compareEl.textContent = '';
    return;
  }

  if (pct > myLossPct) {
    compareEl.textContent = 'Higher than mine';
    outEl.classList.add('compareHigher');
    compareEl.classList.add('compareHigher');
  } else if (pct < myLossPct) {
    compareEl.textContent = 'Lower than mine';
    outEl.classList.add('compareLower');
    compareEl.classList.add('compareLower');
  } else {
    compareEl.textContent = 'Same as mine';
  }
}

function setGridLines(svgGrid, opts = {}) {
  const width = opts.w ?? 1000;
  const height = opts.h ?? 320;
  const v = opts.vertical ?? 6;
  const hz = opts.horizontal ?? 4;
  const inset = opts.inset ?? { left: 18, right: 18, top: 18, bottom: 18 };
  const minY = opts.minY;
  const maxY = opts.maxY;
  const unit = opts.unit ?? 'kg';
  const axisTitle = opts.axisTitle ?? unit;
  const xTicks = Array.isArray(opts.xTicks) ? opts.xTicks : null;

  while (svgGrid.firstChild) {
    svgGrid.removeChild(svgGrid.firstChild);
  }

  const plotLeft = inset.left;
  const plotRight = width - inset.right;
  const plotTop = inset.top;
  const plotBottom = height - inset.bottom;
  const plotW = Math.max(1, plotRight - plotLeft);
  const plotH = Math.max(1, plotBottom - plotTop);

  const makeLine = (x1, y1, x2, y2, cls) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    if (cls) {
      line.setAttribute('class', cls);
    }
    return line;
  };

  // Grid lines (confined to plot area so they align with the padded path).
  for (let i = 1; i < v; i++) {
    const x = plotLeft + (plotW * i) / v;
    svgGrid.appendChild(makeLine(x, plotTop, x, plotBottom));
  }

  for (let i = 1; i < hz; i++) {
    const y = plotTop + (plotH * i) / hz;
    svgGrid.appendChild(makeLine(plotLeft, y, plotRight, y));
  }

  // Y axis + tick labels (kg).
  svgGrid.appendChild(makeLine(plotLeft, plotTop, plotLeft, plotBottom, 'axisLine'));

  if (axisTitle) {
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', String(plotLeft - 8));
    title.setAttribute('y', String(plotTop + 10));
    title.setAttribute('text-anchor', 'end');
    title.setAttribute('dominant-baseline', 'hanging');
    title.setAttribute('class', 'axisTitle');
    title.textContent = String(axisTitle);
    svgGrid.appendChild(title);
  }

  if (Number.isFinite(minY) && Number.isFinite(maxY)) {
    const span = Math.max(0.0001, maxY - minY);
    const ticks = hz;

    for (let i = 0; i <= ticks; i++) {
      const t = i / ticks;
      const y = plotTop + plotH * t;
      const value = maxY - span * t;

      // Tick mark
      svgGrid.appendChild(makeLine(plotLeft - 4, y, plotLeft, y, 'axisTick'));

      // Label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(plotLeft - 8));
      label.setAttribute('y', String(y));
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('class', 'axisLabel');
      label.textContent = `${formatWeight(value)}`;
      svgGrid.appendChild(label);
    }
  }

  // X axis + tick labels (timestamps).
  if (xTicks && xTicks.length) {
    const axisY = plotBottom;

    // Axis line
    svgGrid.appendChild(makeLine(plotLeft, axisY, plotRight, axisY, 'axisLine'));

    for (const t of xTicks) {
      const x = Number(t.x);
      if (!Number.isFinite(x)) {
        continue;
      }

      // Tick mark
      svgGrid.appendChild(makeLine(x, axisY, x, axisY + 4, 'axisTick'));

      // Label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(axisY + 8));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'hanging');
      label.setAttribute('class', 'axisLabel');
      label.textContent = String(t.text ?? '');
      svgGrid.appendChild(label);
    }
  }
}

function buildPath(points, w = 1000, h = 320, inset = { left: 72, right: 18, top: 18, bottom: 44 }) {
  const ys = points.map((p) => p.weight);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = Math.max(1, points.length - 1);
  const spanY = Math.max(0.0001, maxY - minY);

  const firstT = points[0]?.t;
  const lastT = points[points.length - 1]?.t;
  const spanT = Number.isFinite(firstT) && Number.isFinite(lastT) ? lastT - firstT : 0;

  const plotW = Math.max(1, w - inset.left - inset.right);
  const plotH = Math.max(1, h - inset.top - inset.bottom);

  const xForIndex = (i) => inset.left + (plotW * i) / spanX;
  const xForPoint = (p, i) => {
    if (Number.isFinite(spanT) && spanT > 0 && Number.isFinite(p?.t) && Number.isFinite(firstT)) {
      const tNorm = (p.t - firstT) / spanT;
      const clamped = Math.max(0, Math.min(1, tNorm));
      return inset.left + plotW * clamped;
    }
    return xForIndex(i);
  };
  const yFor = (weight) => inset.top + plotH * (1 - (weight - minY) / spanY);

  let d = '';
  for (let i = 0; i < points.length; i++) {
    const x = xForPoint(points[i], i);
    const y = yFor(points[i].weight);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }

  const firstX = xForPoint(points[0], 0);
  const lastX = xForPoint(points[points.length - 1], points.length - 1);
  const bottomY = h - inset.bottom;
  const areaD = `${d} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

  return { lineD: d, areaD, minY, maxY, inset, firstT, lastT };
}

function render(points) {
  const latest = points[points.length - 1];
  latestPoint = latest ?? null;
  renderCurrentWeightValue();

  const metaParts = [];
  if (latest?.date) {
    metaParts.push(`as of ${latest.date}`);
  }
  $('currentMeta').textContent = metaParts.length ? metaParts.join(' • ') : '';

  const { lineD, areaD, minY, maxY, inset, firstT, lastT } = buildPath(points);
  $('line').setAttribute('d', lineD);
  $('area').setAttribute('d', areaD);

  const svg = $('chart');
  const svgRect = svg?.getBoundingClientRect?.();
  const svgPxW = svgRect?.width && svgRect.width > 0 ? svgRect.width : 1000;
  const plotWUnits = Math.max(1, 1000 - inset.left - inset.right);
  const plotPxW = plotWUnits * (svgPxW / 1000);

  const includeTime = points.some((p) => p.hasTime);
  const n = points.length;
  const desiredLabels = Math.max(2, Math.min(n, Math.floor(plotPxW / 90)));
  const lastIdx = n - 1;
  const step = n > desiredLabels ? Math.ceil(lastIdx / Math.max(1, desiredLabels - 1)) : 1;

  const tickIdx = new Set([0, lastIdx]);
  for (let i = step; i < lastIdx; i += step) {
    tickIdx.add(i);
  }

  const spanT = Number.isFinite(firstT) && Number.isFinite(lastT) ? lastT - firstT : 0;
  const xForIndex = (i) => {
    const p = points[i];
    if (Number.isFinite(spanT) && spanT > 0 && Number.isFinite(p?.t) && Number.isFinite(firstT)) {
      const tNorm = (p.t - firstT) / spanT;
      const clamped = Math.max(0, Math.min(1, tNorm));
      return inset.left + plotWUnits * clamped;
    }
    return inset.left + (plotWUnits * i) / Math.max(1, lastIdx);
  };
  const xTicks = Array.from(tickIdx)
    .sort((a, b) => a - b)
    .map((i) => ({ x: xForIndex(i), text: formatXAxisTimestamp(points[i], includeTime) }));

  setGridLines($('grid'), {
    w: 1000,
    h: 320,
    vertical: 6,
    horizontal: 4,
    inset,
    minY,
    maxY,
    unit: 'kg',
    axisTitle: '',
    xTicks
  });

  const start = points[0]?.date;
  const end = latest?.date;
  $('rangeMeta').textContent = `${start} → ${end} • min ${formatWeight(minY)} • max ${formatWeight(maxY)}`;
}

(async function main() {
  try {
    const points = await loadData();
    if (!points.length) {
      showNAState();
      return;
    }
    render(points);

    // Re-render axis labels on resize so we can skip labels when crowded.
    const svg = $('chart');
    if (svg && 'ResizeObserver' in window) {
      let raf = 0;
      const ro = new ResizeObserver(() => {
        if (raf) {
          cancelAnimationFrame(raf);
        }
        raf = requestAnimationFrame(() => {
          raf = 0;
          render(points);
        });
      });
      ro.observe(svg);
    } else {
      window.addEventListener('resize', () => render(points));
    }

    const currentWeightEl = $('currentWeight');
    if (currentWeightEl) {
      currentWeightEl.addEventListener('click', startCurrentWeightEdit);
      currentWeightEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startCurrentWeightEdit();
        }
      });
    }

    const originalEl = $('userOriginal');
    const currentEl = $('userCurrent');
    if (originalEl) {
      originalEl.addEventListener('input', updateUserComparison);
    }
    if (currentEl) {
      currentEl.addEventListener('input', updateUserComparison);
    }
  } catch (_e) {
    showNAState();
  }
})();
