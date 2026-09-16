  // ---- Temperature trend chart (1 day / 3 day / week) ----
  function toDisplayTemp(c) {
    if (c === null || c === undefined || isNaN(c)) return null;
    return unit === 'celsius' ? c : (c * 9 / 5 + 32);
  }

  function trendPPH(range) { return range === '1' ? 16 : range === '3' ? 7 : 3.2; }

  // Rounds a [minV, maxV] span to a "nice" step (1/2/5/10 × a power of ten) so the y-axis reads
  // like a real chart's gridlines instead of landing on arbitrary decimal temperatures.
  function niceTempTicks(minV, maxV) {
    const span = Math.max(1e-6, maxV - minV);
    const rawStep = span / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const niceMin = Math.floor(minV / step) * step;
    const niceMax = Math.ceil(maxV / step) * step;
    const ticks = [];
    for (let v = niceMin; v <= niceMax + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    return { ticks, min: niceMin, max: niceMax };
  }

  // Continuous hourly line across the full fetched date range, at a zoom-dependent pixel-per-hour
  // density — the same "infinitely scrollable" structure as buildSunMoonChart, so the two charts
  // behave consistently (persisted cursor, Today button, day-sync, etc. all reuse this shape).
  function buildTrendSVG(range) {
    const CT = chartTheme();
    const days = weatherData.daily.time;
    const wStart = new Date(days[0] + 'T00:00:00');
    const wEnd = new Date(days[days.length - 1] + 'T23:59:59');
    const pph = trendPPH(range);
    const totalHours = (wEnd - wStart) / 3600000;
    const W = Math.max(360, Math.round(totalHours * pph));
    const plotTop = 16, plotH = 130;
    const plotBottom = plotTop + plotH;
    const hourRowY = plotBottom + 18;
    const axisY = hourRowY + 20;
    const H = axisY + 10;
    const xForTime = t => ((t - wStart.getTime()) / 3600000) * pph;

    const pts = [];
    weatherData.hourly.time.forEach((t, i) => {
      const tm = new Date(t).getTime();
      if (tm >= wStart.getTime() && tm <= wEnd.getTime()) pts.push({ t: tm, v: toDisplayTemp(weatherData.hourly.temperature_2m[i]) });
    });
    const vals = pts.map(p => p.v).filter(v => v !== null);
    if (vals.length === 0) { trendState.chartMeta = null; return '<div class="status" style="padding:30px 0;">No data available.</div>'; }
    const rawMin = Math.min(...vals), rawMax = Math.max(...vals);
    const { ticks: yTicks, min: minV, max: maxV } = niceTempTicks(rawMin, rawMax === rawMin ? rawMax + 1 : rawMax);
    const yScale = v => plotTop + (1 - (v - minV) / (maxV - minV)) * plotH;

    const linePts = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForTime(p.t).toFixed(1)} ${yScale(p.v).toFixed(1)}`).join(' ');
    const areaPts = `M ${xForTime(pts[0].t).toFixed(1)} ${plotBottom} ` +
      pts.map(p => `L ${xForTime(p.t).toFixed(1)} ${yScale(p.v).toFixed(1)}`).join(' ') +
      ` L ${xForTime(pts[pts.length - 1].t).toFixed(1)} ${plotBottom} Z`;

    const gridLines = yTicks.map(tv => `<line x1="0" x2="${W}" y1="${yScale(tv).toFixed(1)}" y2="${yScale(tv).toFixed(1)}" stroke="${CT.faintDivider}" stroke-width="1"/>`).join('');

    // Hour-of-day ticks beneath the plot — spaced wider at more zoomed-out ranges so the labels
    // never crowd each other, while the (larger, bold-on-today) day labels sit in their own row.
    const hourInterval = range === '1' ? 3 : range === '3' ? 6 : 12;
    let hourTicks = '';
    let dividers = '', dayLabels = '';
    days.forEach((d, i) => {
      const dayStartMs = new Date(d + 'T00:00:00').getTime();
      const dayStartX = xForTime(dayStartMs);
      if (i > 0) dividers += `<line x1="${dayStartX}" x2="${dayStartX}" y1="${plotTop}" y2="${plotBottom}" stroke="${CT.divider}" stroke-width="1"/>`;
      const isToday = d === todayStr;
      const [, mo, da] = d.split('-');
      const weekday = isToday ? 'Today' : new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
      const label = `${weekday} ${da}/${mo}`;
      dayLabels += `<text x="${dayStartX + 4}" y="${axisY}" text-anchor="start" font-size="11" fill="${isToday ? '#4C9F94' : '#6B7A99'}" font-family="Work Sans, sans-serif" font-weight="${isToday ? '600' : '400'}">${label}</text>`;

      for (let h = 0; h < 24; h += hourInterval) {
        const t = dayStartMs + h * 3600000;
        if (t < wStart.getTime() || t > wEnd.getTime()) continue;
        const x = xForTime(t);
        const hourLabel = h === 0 ? '12am' : h === 12 ? '12pm' : (h < 12 ? h + 'am' : (h - 12) + 'pm');
        hourTicks += `<line x1="${x}" x2="${x}" y1="${plotBottom}" y2="${plotBottom + 4}" stroke="${CT.faintDivider}" stroke-width="1"/>` +
          `<text x="${x}" y="${hourRowY}" text-anchor="middle" font-size="9.5" fill="#6B7A99" font-family="Work Sans, sans-serif">${hourLabel}</text>`;
      }
    });

    // Interactive crosshair cursor: snaps to the nearest actual hourly sample (rather than
    // interpolating) so the dot always sits exactly on the plotted line and the legend below
    // always describes a real data point.
    const cursorTime = trendState.cursorTime || new Date(weatherData.current.time);
    let cursorHtml = '';
    const cursorIdx = Math.round((cursorTime.getTime() - wStart.getTime()) / 3600000);
    const cursorPt = pts[Math.max(0, Math.min(pts.length - 1, cursorIdx))];
    if (cursorPt) {
      const cx = xForTime(cursorPt.t);
      const cy = yScale(cursorPt.v);
      cursorHtml = `
        <line id="trendCursorX" x1="${cx}" x2="${cx}" y1="${plotTop - 6}" y2="${plotBottom + 6}" stroke="${CT.text}" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.4"/>
        <line id="trendCursorY" x1="0" x2="${W}" y1="${cy}" y2="${cy}" stroke="${CT.text}" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.4"/>
        <circle id="trendCursorDot" cx="${cx}" cy="${cy}" r="4.5" fill="#E3A857" stroke="${CT.dotStroke}" stroke-width="1.5"/>
        <rect id="trendCursorHandle" x="${cx - 12}" y="${plotTop - 14}" width="24" height="${plotH + 28}" fill="transparent" style="cursor:grab; touch-action:none;"/>
      `;
    }

    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#4C9F94" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#4C9F94" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}${dividers}
      <path d="${areaPts}" fill="url(#trendFill)"/>
      <path d="${linePts}" fill="none" stroke="${CT.text}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${cursorHtml}${hourTicks}${dayLabels}
    </svg>`;

    trendState.chartMeta = { wStartMs: wStart.getTime(), wEndMs: wEnd.getTime(), pph, minV, maxV, plotTop, plotH, pts };
    return svg;
  }

  function trendYAxisLabelsHtml() {
    if (!trendState.chartMeta) return '';
    const { minV, maxV, plotTop, plotH } = trendState.chartMeta;
    const { ticks } = niceTempTicks(minV, maxV);
    return ticks.map(tv => {
      const y = plotTop + (1 - (tv - minV) / (maxV - minV)) * plotH;
      return `<span class="y-tick" style="top:${y}px;">${Math.round(tv)}°</span>`;
    }).join('');
  }

  function trendCursorInfoHtml(time) {
    const idx = findIndexForDateHour(weatherData.hourly.time, fmtDateStr(time), String(time.getHours()).padStart(2, '0') + ':00');
    const code = idx !== -1 ? weatherData.hourly.weather_code[idx] : null;
    const temp = idx !== -1 ? weatherData.hourly.temperature_2m[idx] : null;
    const d2 = code !== null ? describeCode(code) : null;
    return `
      <div class="cursor-time">${chipLabel(fmtDateStr(time), todayStr)} · ${clockLabel(time)}</div>
      <div class="cursor-row">${d2 ? `<span class="cursor-icon">${glyphFor(d2.kind, chartTheme().text)}</span>` : ''}${fmtTemp(temp)}${d2 ? ` · ${d2.text}` : ''}</div>
    `;
  }

  // The only two ways the trend cursor's own behavior differs from the shared mechanism in
  // chart-scrub.js: it re-snaps onto the nearest hourly sample on every update (so the dot and
  // legend always agree with a real data point), and its dot sits at that sample's plotted
  // temperature rather than a fixed height.
  function trendSnapToSample(time, meta) {
    const idx = Math.round((time.getTime() - meta.wStartMs) / 3600000);
    const pt = meta.pts[Math.max(0, Math.min(meta.pts.length - 1, idx))];
    return pt ? new Date(pt.t) : time;
  }

  function trendComputeY(time, meta) {
    const idx = Math.round((time.getTime() - meta.wStartMs) / 3600000);
    const pt = meta.pts[Math.max(0, Math.min(meta.pts.length - 1, idx))];
    return pt ? meta.plotTop + (1 - (pt.v - meta.minV) / (meta.maxV - meta.minV)) * meta.plotH : null;
  }

  function trendPaintCursor(x, y, time) {
    const xLine = document.getElementById('trendCursorX');
    const yLine = document.getElementById('trendCursorY');
    const dot = document.getElementById('trendCursorDot');
    const handle = document.getElementById('trendCursorHandle');
    if (xLine) { xLine.setAttribute('x1', x); xLine.setAttribute('x2', x); }
    if (yLine) { yLine.setAttribute('y1', y); yLine.setAttribute('y2', y); }
    if (dot) { dot.setAttribute('cx', x); dot.setAttribute('cy', y); }
    if (handle) handle.setAttribute('x', x - 12);
  }

  const trendChart = createScrubbableChart({
    state: trendState,
    wrapId: 'trendChartWrap', handleId: 'trendCursorHandle', infoId: 'trendCursorInfo',
    pph: trendPPH,
    infoHtml: trendCursorInfoHtml,
    snapCursorTime: trendSnapToSample,
    computeY: trendComputeY,
    paintCursor: trendPaintCursor,
  });
  function updateTrendCursor(time) { trendChart.updateCursor(time); }
  function scrollTrendToFocus(smooth) { trendChart.scrollToFocus(smooth); }
  function jumpTrendToToday() { trendChart.jumpToToday(); }
  function trendTimeFromClientX(clientX) { return trendChart.timeFromClientX(clientX); }
  function handleTrendChartClick(e) { trendChart.handleChartClick(e); }
  function handleTrendPointerDown(e) { trendChart.handlePointerDown(e); }
  function handleTrendPointerMove(e) { trendChart.handlePointerMove(e); }
  function handleTrendPointerUp(e) { trendChart.handlePointerUp(e); }

  function trendInfoPopupHtml() {
    return `<p>Scroll to see the full forecast. Tap or drag the chart to move the cursor and read the time and temperature above — use the Today button to jump back to now.</p>`;
  }

  function renderTrendPanel() {
    const svg = buildTrendSVG(trendState.range);
    const cursorTime = trendState.cursorTime || new Date(weatherData.current.time);
    return `
      <div class="panel trend-panel">
        <div class="trend-header">
          <p class="panel-title">Temperature trend <span class="sub">${unit === 'celsius' ? '°C' : '°F'}</span><button type="button" class="info-btn" id="trendInfoBtn" aria-label="About this chart">i</button></p>
          <div class="trend-toggle" id="trendToggle">
            <button data-range="1" class="${trendState.range === '1' ? 'active' : ''}">1 Day</button>
            <button data-range="3" class="${trendState.range === '3' ? 'active' : ''}">3 Day</button>
            <button data-range="7" class="${trendState.range === '7' ? 'active' : ''}">Week</button>
          </div>
        </div>
        <div class="chart-info-popup" id="trendInfoPopup" hidden>
          <button type="button" class="info-popup-close" id="trendInfoCloseBtn" aria-label="Close">&times;</button>
          ${trendInfoPopupHtml()}
        </div>
        <div class="chart-cursor-info" id="trendCursorInfo">${trendCursorInfoHtml(cursorTime)}</div>
        <div class="trend-chart-container">
          <div class="trend-chart-yaxis" id="trendChartYAxis">${trendYAxisLabelsHtml()}</div>
          <div class="trend-chart-wrap" id="trendChartWrap">${svg}</div>
          <button type="button" class="chart-today-btn" id="trendTodayBtn">Today</button>
        </div>
      </div>
    `;
  }

