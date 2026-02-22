(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const pad2 = (n) => String(n).padStart(2, '0');
  const pad4 = (n) => String(n).padStart(4, '0');
  const formatDmyFromDate = (d, includeTime) => {
    if (!(d instanceof Date) || !Number.isFinite(d.getTime?.())) {
      return '';
    }
    const dd = d.getDate();
    const mm = d.getMonth() + 1;
    const yyyy = d.getFullYear();
    const base = `${pad2(dd)}-${pad2(mm)}-${pad4(yyyy)}`;
    if (!includeTime) {
      return base;
    }
    const hh = d.getHours();
    const min = d.getMinutes();
    return `${base} ${pad2(hh)}:${pad2(min)}`;
  };

  function formatWeight(w) {
    const rounded = Math.round(w * 10) / 10;
    const asInt = Math.round(rounded);
    return Math.abs(rounded - asInt) < 1e-9 ? String(asInt) : rounded.toFixed(1);
  }

  function formatXAxisTimestamp(point, includeTime) {
    if (!point) {
      return '';
    }
    const d = new Date(point.t);
    return formatDmyFromDate(d, includeTime);
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
    const referenceY = opts.referenceY;
    const avoidXLabelOverlap = opts.avoidXLabelOverlap !== false;
    const xLabelGap = Number.isFinite(opts.xLabelGap) ? Number(opts.xLabelGap) : 6;

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
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      if (cls) {
        line.setAttribute('class', cls);
      }
      return line;
    };

    for (let i = 1; i < v; i++) {
      const x = plotLeft + (plotW * i) / v;
      svgGrid.appendChild(makeLine(x, plotTop, x, plotBottom));
    }

    for (let i = 1; i < hz; i++) {
      const y = plotTop + (plotH * i) / hz;
      svgGrid.appendChild(makeLine(plotLeft, y, plotRight, y));
    }

    if (Number.isFinite(referenceY) && Number.isFinite(minY) && Number.isFinite(maxY)) {
      const span = Math.max(0.0001, maxY - minY);
      const y = plotTop + plotH * (1 - (referenceY - minY) / span);
      svgGrid.appendChild(makeLine(plotLeft, y, plotRight, y, 'refLine'));
    }

    svgGrid.appendChild(makeLine(plotLeft, plotTop, plotLeft, plotBottom, 'axisLine'));

    if (axisTitle) {
      const title = document.createElementNS(SVG_NS, 'text');
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

        svgGrid.appendChild(makeLine(plotLeft - 4, y, plotLeft, y, 'axisTick'));

        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(plotLeft - 8));
        label.setAttribute('y', String(y));
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('class', 'axisLabel');
        label.textContent = `${formatWeight(value)}`;
        svgGrid.appendChild(label);
      }
    }

    if (xTicks && xTicks.length) {
      const axisY = plotBottom;
      svgGrid.appendChild(makeLine(plotLeft, axisY, plotRight, axisY, 'axisLine'));

      const kept = [];

      for (let i = 0; i < xTicks.length; i++) {
        const t = xTicks[i];
        const x = Number(t.x);
        if (!Number.isFinite(x)) {
          continue;
        }

        const tick = makeLine(x, axisY, x, axisY + 4, 'axisTick');
        svgGrid.appendChild(tick);

        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(x));
        label.setAttribute('y', String(axisY + 8));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'hanging');
        label.setAttribute('class', 'axisLabel');
        label.textContent = String(t.text ?? '');
        svgGrid.appendChild(label);

        if (!avoidXLabelOverlap) {
          kept.push({ label, tick, left: -Infinity, right: Infinity });
          continue;
        }

        // If this label would overlap the previous kept label, remove it (and its tick).
        let bbox;
        try {
          bbox = label.getBBox();
        } catch (_e) {
          bbox = null;
        }

        const textLen = String(t.text ?? '').length;
        const widthGuess = Math.max(0, textLen * 7);
        const labelW = bbox && Number.isFinite(bbox.width) && bbox.width > 0 ? bbox.width : widthGuess;
        const left = bbox && Number.isFinite(bbox.x) ? bbox.x : x - labelW / 2;
        const right = left + labelW;

        const isLast = i === xTicks.length - 1;

        if (!kept.length || left >= kept[kept.length - 1].right + xLabelGap) {
          kept.push({ label, tick, left, right });
          continue;
        }

        if (!isLast) {
          svgGrid.removeChild(label);
          svgGrid.removeChild(tick);
          continue;
        }

        // Ensure the final label is visible by removing previous kept labels until it fits.
        while (kept.length && left < kept[kept.length - 1].right + xLabelGap) {
          const prev = kept.pop();
          if (prev?.label?.parentNode === svgGrid) {
            svgGrid.removeChild(prev.label);
          }
          if (prev?.tick?.parentNode === svgGrid) {
            svgGrid.removeChild(prev.tick);
          }
        }

        kept.push({ label, tick, left, right });
      }
    }
  }

  function buildPath(points, w = 1000, h = 320, inset = { left: 72, right: 18, top: 18, bottom: 44 }, extraYValues = []) {
    const ys = points.map((p) => p.weight);
    const allYs = ys.concat(Array.isArray(extraYValues) ? extraYValues : []).filter((n) => Number.isFinite(n));
    const minY = Math.min(...allYs);
    const maxY = Math.max(...allYs);

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
    const xs = new Array(points.length);
    const ysPx = new Array(points.length);

    for (let i = 0; i < points.length; i++) {
      const x = xForPoint(points[i], i);
      const y = yFor(points[i].weight);
      xs[i] = x;
      ysPx[i] = y;
      d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    }

    const firstX = xs[0];
    const lastX = xs[xs.length - 1];
    const bottomY = h - inset.bottom;
    const areaD = `${d} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

    return { lineD: d, areaD, minY, maxY, inset, firstT, lastT, xs, ysPx };
  }

  const stateBySvg = new WeakMap();

  function getOrCreateTooltip(svg) {
    let g = svg.querySelector('g[data-wt-tooltip="1"]');
    if (g) {
      return g;
    }

    g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-wt-tooltip', '1');
    g.setAttribute('class', 'wtTooltip');
    g.setAttribute('visibility', 'hidden');

    const vLine = document.createElementNS(SVG_NS, 'line');
    vLine.setAttribute('class', 'wtTooltipLine');

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('class', 'wtTooltipDot');
    dot.setAttribute('r', '4');

    const bubble = document.createElementNS(SVG_NS, 'g');
    bubble.setAttribute('class', 'wtTooltipBubble');

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'wtTooltipRect');
    rect.setAttribute('rx', '8');
    rect.setAttribute('ry', '8');

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'wtTooltipText');

    bubble.appendChild(rect);
    bubble.appendChild(text);

    g.appendChild(vLine);
    g.appendChild(dot);
    g.appendChild(bubble);

    // Keep tooltip above grid/area/line: append as last child.
    svg.appendChild(g);
    return g;
  }

  function setTooltip(svg, opts) {
    const st = stateBySvg.get(svg);
    if (!st || !st.points || !st.points.length) {
      return;
    }

    const idx = Math.max(0, Math.min(st.points.length - 1, opts.index ?? 0));
    st.activeIndex = idx;

    const p = st.points[idx];
    const x = st.xs[idx];
    const y = st.ysPx[idx];

    const g = st.tooltip;
    const line = g.querySelector('line.wtTooltipLine');
    const dot = g.querySelector('circle.wtTooltipDot');
    const bubble = g.querySelector('g.wtTooltipBubble');
    const rect = bubble.querySelector('rect.wtTooltipRect');
    const text = bubble.querySelector('text.wtTooltipText');

    // Vertical line within plot area.
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
    line.setAttribute('y1', String(st.inset.top));
    line.setAttribute('y2', String(320 - st.inset.bottom));

    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));

    const dateLabel = st.includeTime ? p.date : p.isoDate || p.date;
    const label = `${dateLabel}  •  ${formatWeight(p.weight)} ${st.unit}`;

    // Measure text to size the bubble.
    text.textContent = label;

    // Position text after it has content; getBBox is available after it’s in DOM.
    const paddingX = 10;
    const paddingY = 7;

    // Temporarily place at 0,0 so bbox is stable.
    text.setAttribute('x', '0');
    text.setAttribute('y', '0');

    let bbox;
    try {
      bbox = text.getBBox();
    } catch (_e) {
      bbox = { x: 0, y: 0, width: label.length * 7, height: 14 };
    }

    const bubbleW = bbox.width + paddingX * 2;
    const bubbleH = Math.max(18, bbox.height + paddingY * 2);

    const plotLeft = st.inset.left;
    const plotRight = 1000 - st.inset.right;

    // Default bubble above the point, clamped horizontally.
    const desiredX = x - bubbleW / 2;
    const clampedX = Math.max(plotLeft, Math.min(plotRight - bubbleW, desiredX));

    const aboveY = y - (bubbleH + 12);
    const bubbleY = Math.max(st.inset.top, aboveY);

    rect.setAttribute('x', String(clampedX));
    rect.setAttribute('y', String(bubbleY));
    rect.setAttribute('width', String(bubbleW));
    rect.setAttribute('height', String(bubbleH));

    // Text baseline
    const textX = clampedX + paddingX;
    const textY = bubbleY + paddingY + (bbox.height || 12);
    text.setAttribute('x', String(textX));
    text.setAttribute('y', String(textY));

    g.setAttribute('visibility', 'visible');
  }

  function hideTooltip(svg) {
    const st = stateBySvg.get(svg);
    if (!st) {
      return;
    }
    st.tooltip?.setAttribute('visibility', 'hidden');
  }

  function findNearestIndex(xs, x) {
    // xs is sorted ascending.
    let lo = 0;
    let hi = xs.length - 1;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (xs[mid] < x) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    const i = lo;
    if (i <= 0) {
      return 0;
    }
    if (i >= xs.length) {
      return xs.length - 1;
    }
    const prev = i - 1;
    return Math.abs(xs[prev] - x) <= Math.abs(xs[i] - x) ? prev : i;
  }

  function clientToSvgX(svg, clientX) {
    const rect = svg.getBoundingClientRect();
    const xPx = clientX - rect.left;
    const xNorm = rect.width > 0 ? xPx / rect.width : 0;
    return xNorm * 1000;
  }

  function ensureInteractivity(svg) {
    const existing = stateBySvg.get(svg);
    if (existing?.hasListeners) {
      return;
    }

    const st = existing ?? { hasListeners: false };
    st.hasListeners = true;
    stateBySvg.set(svg, st);

    // Make focusable for keyboard “focus tooltip”.
    if (!svg.hasAttribute('tabindex')) {
      svg.setAttribute('tabindex', '0');
    }

    svg.addEventListener('pointermove', (e) => {
      const cur = stateBySvg.get(svg);
      if (!cur?.points?.length) {
        return;
      }
      const x = clientToSvgX(svg, e.clientX);
      const idx = findNearestIndex(cur.xs, x);
      setTooltip(svg, { index: idx });
    });

    svg.addEventListener('pointerleave', () => {
      // Don’t hide if keyboard-focused; that would flicker.
      if (document.activeElement === svg) {
        return;
      }
      hideTooltip(svg);
    });

    svg.addEventListener('focus', () => {
      const cur = stateBySvg.get(svg);
      if (!cur?.points?.length) {
        return;
      }
      const idx = Number.isFinite(cur.activeIndex) ? cur.activeIndex : cur.points.length - 1;
      setTooltip(svg, { index: idx });
    });

    svg.addEventListener('blur', () => {
      hideTooltip(svg);
    });
  }

  function renderChart(params) {
    const points = Array.isArray(params?.points) ? params.points : [];
    const svg = params?.svg;
    const grid = params?.grid;
    const line = params?.line;
    const area = params?.area;

    if (!svg || !grid || !line || !area) {
      return null;
    }

    if (!points.length) {
      line.setAttribute('d', '');
      area.setAttribute('d', '');
      while (grid.firstChild) {
        grid.removeChild(grid.firstChild);
      }
      hideTooltip(svg);
      return null;
    }

    ensureInteractivity(svg);

    const originalWeight = params?.referenceY;
    const unit = params?.unit ?? 'kg';

    const svgRect = svg.getBoundingClientRect?.();
    const svgPxW = svgRect?.width && svgRect.width > 0 ? svgRect.width : 1000;

    const includeTime = points.some((p) => p.hasTime);

    const built = buildPath(points, 1000, 320, undefined, [originalWeight]);
    line.setAttribute('d', built.lineD);
    area.setAttribute('d', built.areaD);

    const plotWUnits = Math.max(1, 1000 - built.inset.left - built.inset.right);
    const plotPxW = plotWUnits * (svgPxW / 1000);

    const n = points.length;
    const desiredLabels = Math.max(2, Math.min(n, Math.floor(plotPxW / 90)));
    const lastIdx = n - 1;
    const step = n > desiredLabels ? Math.ceil(lastIdx / Math.max(1, desiredLabels - 1)) : 1;

    const tickIdx = new Set([0, lastIdx]);
    for (let i = step; i < lastIdx; i += step) {
      tickIdx.add(i);
    }

    const xTicks = Array.from(tickIdx)
      .sort((a, b) => a - b)
      .map((i) => ({ x: built.xs[i], text: formatXAxisTimestamp(points[i], includeTime) }));

    setGridLines(grid, {
      w: 1000,
      h: 320,
      vertical: 6,
      horizontal: 4,
      inset: built.inset,
      minY: built.minY,
      maxY: built.maxY,
      unit,
      axisTitle: '',
      xTicks,
      referenceY: originalWeight
    });

    const tooltip = getOrCreateTooltip(svg);

    stateBySvg.set(svg, {
      points,
      xs: built.xs,
      ysPx: built.ysPx,
      inset: built.inset,
      includeTime,
      tooltip,
      unit,
      activeIndex: stateBySvg.get(svg)?.activeIndex,
      hasListeners: true
    });

    // If the chart is currently focused, keep tooltip visible after re-render.
    if (document.activeElement === svg) {
      const st = stateBySvg.get(svg);
      const idx = Number.isFinite(st.activeIndex) ? st.activeIndex : points.length - 1;
      setTooltip(svg, { index: idx });
    }

    return { includeTime, minY: built.minY, maxY: built.maxY };
  }

  function clearChart(params) {
    const svg = params?.svg;
    const grid = params?.grid;
    const line = params?.line;
    const area = params?.area;

    if (line) {
      line.setAttribute('d', '');
    }
    if (area) {
      area.setAttribute('d', '');
    }
    if (grid) {
      while (grid.firstChild) {
        grid.removeChild(grid.firstChild);
      }
    }

    if (svg) {
      hideTooltip(svg);
      stateBySvg.delete(svg);
    }
  }

  window.WTChart = {
    renderChart,
    clearChart
  };
})();
