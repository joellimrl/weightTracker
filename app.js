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

  const api = window.WTChart;
  if (api?.clearChart) {
    api.clearChart({ svg: $('chart'), grid: $('grid'), line: $('line'), area: $('area') });
  } else {
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
  const pad4 = (n) => String(n).padStart(4, '0');
  const toDmy = (yyyy, mm, dd) => `${pad2(dd)}-${pad2(mm)}-${pad4(yyyy)}`;

  // Accept explicit Y-M-D (optionally with time) and interpret as LOCAL time.
  // Output is normalized to dd-mm-yyyy.
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
      const dmyDate = toDmy(yyyy, mm, dd);
      const dmyText = hasTime ? `${dmyDate} ${pad2(hh)}:${pad2(min)}` : dmyDate;
      return { ms: d.getTime(), isoDate: dmyDate, isoText: dmyText, hasTime };
    }
  }

  // D-M-YYYY (optionally with time) — interpret as LOCAL time.
  // Supports:
  // - 16-02-2026
  // - 16-02-2026 07:30
  // - 16-02-2026T07:30
  // - 16-02-2026 07:30:00
  const dmyTime = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (dmyTime) {
    const dd = Number(dmyTime[1]);
    const mm = Number(dmyTime[2]);
    const yyyy = Number(dmyTime[3]);
    const hh = dmyTime[4] != null ? Number(dmyTime[4]) : 0;
    const min = dmyTime[5] != null ? Number(dmyTime[5]) : 0;
    const sec = dmyTime[6] != null ? Number(dmyTime[6]) : 0;
    const hasTime = dmyTime[4] != null;

    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && hh >= 0 && hh <= 23 && min >= 0 && min <= 59) {
      const d = new Date(yyyy, mm - 1, dd, hh, min, sec, 0);
      const dmyDate = toDmy(yyyy, mm, dd);
      const dmyText = hasTime ? `${dmyDate} ${pad2(hh)}:${pad2(min)}` : dmyDate;
      return { ms: d.getTime(), isoDate: dmyDate, isoText: dmyText, hasTime };
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
      const dmyDate = toDmy(yyyy, mm, dd);
      const dmyText = hasTime ? `${dmyDate} ${pad2(hh)}:${pad2(min)}` : dmyDate;
      return { ms: d.getTime(), isoDate: dmyDate, isoText: dmyText, hasTime };
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
  const dmyDate = toDmy(yyyy, mm, dd);
  const dmyText = hasTime ? `${dmyDate} ${pad2(hh)}:${pad2(min)}` : dmyDate;
  return { ms: d.getTime(), isoDate: dmyDate, isoText: dmyText, hasTime };
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

function renderChart(points) {
  const api = window.WTChart;
  if (!api?.renderChart) {
    return;
  }
  api.renderChart({
    points,
    svg: $('chart'),
    grid: $('grid'),
    line: $('line'),
    area: $('area'),
    referenceY: ORIGINAL_WEIGHT_KG,
    unit: 'kg'
  });
}

function render(points) {
  const ys = points.map((p) => p.weight);
  const dataMinY = Math.min(...ys);
  const dataMaxY = Math.max(...ys);

  const latest = points[points.length - 1];
  latestPoint = latest ?? null;
  renderCurrentWeightValue();

  const metaParts = [];
  if (latest?.date) {
    metaParts.push(`as of ${latest.date}`);
  }
  $('currentMeta').textContent = metaParts.length ? metaParts.join(' • ') : '';

  renderChart(points);

  const start = points[0]?.date;
  const end = latest?.date;
  $('rangeMeta').textContent = `${start} → ${end} • min ${formatWeight(dataMinY)} • max ${formatWeight(dataMaxY)}`;
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
          renderChart(points);
        });
      });
      ro.observe(svg);
    } else {
      window.addEventListener('resize', () => renderChart(points));
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
