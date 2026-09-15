  // ---- Sun, moon & bite (solunar) trend chart ----
  // Pixels-per-hour by zoom preset. The chart itself always spans the full fetched
  // forecast (see buildSunMoonChart) — these just control how zoomed-in the view is,
  // so scrolling keeps going as far as the underlying data allows in either direction.
  function sunMoonPPH(range) { return range === '1' ? 16 : range === '3' ? 7 : 3.2; }

  function sunMoonInfoPopupHtml(range) {
    const zoomNote = range === '1' ? 'Zoomed in for hourly detail.' : range === '3' ? 'Zoomed to a multi-day view.' : 'Zoomed out for a broad overview.';
    return `
      <p><strong>${zoomNote}</strong> Scroll to explore the full forecast at any zoom level.</p>
      <p>Tap the chart to move the cursor, or press and drag the bar to scrub through time. It snaps onto major bites (teal), minor bites (slate-blue), and sunrise/sunset (gold) — the key above updates as you go.</p>
      <p>Taller teal bands are major bite windows, shorter grey-blue bands are minor ones. How vivid a band is reflects its estimated effectiveness (moon phase, distance from Earth &amp; pressure trend), which shifts day to day.</p>
    `;
  }

  // ---- Estimated bite-window "effectiveness" ----
  // A folklore-based heuristic, not a scientific prediction: solunar theory holds that bite
  // windows are stronger near new/full moon (sun-earth-moon alignment) and near lunar perigee
  // (closer moon, stronger pull). We blend that with the day's pressure trend, since falling
  // pressure is commonly associated with more active fish. Recomputed per window, so it moves
  // day to day as the moon's phase and distance change.
  function computeBiteEffectiveness(center, isMajor, trendCls) {
    const illum = SunCalc.getMoonIllumination(center);
    const phaseFactor = Math.abs(Math.cos(illum.phase * 2 * Math.PI)); // 1 at new/full, 0 at quarters
    const moonPos = SunCalc.getMoonPosition(center, lastCoords.lat, lastCoords.lon);
    const PERIGEE_KM = 356500, APOGEE_KM = 406700;
    const distFactor = Math.min(1, Math.max(0, 1 - (moonPos.distance - PERIGEE_KM) / (APOGEE_KM - PERIGEE_KM)));
    let score = phaseFactor * 0.5 + distFactor * 0.35 + (isMajor ? 0.1 : 0.03);
    if (trendCls === 'trend-falling') score += 0.12;
    else if (trendCls === 'trend-rising') score -= 0.05;
    score = Math.max(0.18, Math.min(1, score));
    return Math.round(score * 100);
  }

  // Which color (if any) the cursor should take when parked exactly on a significant event —
  // shared by the initial chart build and by updateSunMoonCursor's live drag updates, so both
  // agree on what "locked on" looks like for each event type.
  function sunMoonSnapColor(timeMs, majors, minors, sunEvents) {
    const near = list => (list || []).some(t => Math.abs(t - timeMs) < 1000);
    if (near(majors)) return '#2F7268';
    if (near(minors)) return '#5B6A86';
    if (near(sunEvents)) return '#E3A857';
    return null;
  }

  function buildSunMoonChart(range) {
    const CT = chartTheme();
    const days = weatherData.daily.time; // full fetched range: scrolling never hits an artificial edge
    const wStart = new Date(days[0] + 'T00:00:00');
    const wEnd = new Date(days[days.length - 1] + 'T23:59:59');
    const pph = sunMoonPPH(range);
    const totalHours = (wEnd - wStart) / 3600000;
    const W = Math.max(360, Math.round(totalHours * pph));
    // At the "Week" zoom, per-event time labels would overlap (too little horizontal room),
    // so that view drops the two label rows and keeps just the day-boundary row.
    const compact = range === '7';
    const plotTop = 16, plotH = 116;
    const plotBottom = plotTop + plotH;
    // Each label row needs room for its tick (rowY-9 to rowY-4) plus its text baseline (rowY+7,
    // with the glyphs themselves reaching a couple px past that) — a 22px step keeps the next
    // row's tick clear of the previous row's text instead of the two nearly touching.
    const sunRowY = plotBottom + 18;
    const moonRowY = sunRowY + 22;
    const axisY = compact ? plotBottom + 22 : moonRowY + 22;
    const H = axisY + 14;
    const zeroY = plotTop + plotH / 2;
    const altToY = deg => plotTop + (1 - (deg + 90) / 180) * plotH;
    const xForTime = t => ((t - wStart.getTime()) / 3600000) * pph;

    const MAJOR_COLOR = '#4C9F94';
    const MINOR_COLOR = '#8C9BB5';
    const SUN_COLOR = '#E3A857';
    const MOON_COLOR = '#6B7A99';

    function eventMark(x, rowY, color, text, bold) {
      return `<line x1="${x}" x2="${x}" y1="${rowY - 9}" y2="${rowY - 4}" stroke="${color}" stroke-width="${bold ? 2 : 1.5}" stroke-linecap="round"/>` +
        `<text x="${x}" y="${rowY + 7}" text-anchor="middle" font-size="9" fill="${bold ? CT.text : '#6B7A99'}" font-family="Work Sans, sans-serif" font-weight="${bold ? '600' : '400'}">${text}</text>`;
    }

    // Labels are collected per row first, then rendered left-to-right, dropping the text (but
    // keeping the tick) on any label that would land too close to the one before it — otherwise
    // "9:15am"/"10:30pm" etc. can overlap when two events fall close together in time.
    const MIN_LABEL_GAP = 36;
    function renderMarksRow(marks, rowY) {
      marks.sort((a, b) => a.x - b.x);
      let lastShownX = -Infinity, html = '';
      marks.forEach(m => {
        const showText = (m.x - lastShownX) >= MIN_LABEL_GAP;
        if (showText) lastShownX = m.x;
        html += eventMark(m.x, rowY, m.color, showText ? m.text : '', m.bold);
      });
      return html;
    }

    const sunPts = [], moonPts = [];
    const stepMs = 20 * 60000;
    for (let t = wStart.getTime(); t <= wEnd.getTime(); t += stepMs) {
      const d = new Date(t);
      const sunAlt = SunCalc.getPosition(d, lastCoords.lat, lastCoords.lon).altitude * 180 / Math.PI;
      const moonAlt = SunCalc.getMoonPosition(d, lastCoords.lat, lastCoords.lon).altitude * 180 / Math.PI;
      const x = xForTime(t);
      sunPts.push(`${x === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${altToY(sunAlt).toFixed(1)}`);
      moonPts.push(`${x === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${altToY(moonAlt).toFixed(1)}`);
    }

    let bandsHtml = '', majorTimesMs = [], minorTimesMs = [], sunEventTimesMs = [];
    const sunMarks = [], moonMarks = [];
    days.forEach(d => {
      const dayStart = new Date(d + 'T00:00:00');
      // Reuse the same daily sunrise/sunset used elsewhere in the app (Open-Meteo), rather than
      // recomputing via SunCalc, so this chart never disagrees with the Sun & moon panel above it.
      const dIdx = weatherData.daily.time.indexOf(d);
      const sunrise = dIdx !== -1 ? new Date(weatherData.daily.sunrise[dIdx]) : null;
      const sunset = dIdx !== -1 ? new Date(weatherData.daily.sunset[dIdx]) : null;
      if (sunrise) sunEventTimesMs.push(sunrise.getTime());
      if (sunset) sunEventTimesMs.push(sunset.getTime());
      if (!compact) {
        if (sunrise) sunMarks.push({ x: xForTime(sunrise.getTime()), color: SUN_COLOR, text: shortClockWords(sunrise), bold: false });
        if (sunset) sunMarks.push({ x: xForTime(sunset.getTime()), color: SUN_COLOR, text: shortClockWords(sunset), bold: false });
      }

      const sol = computeSolunar(lastCoords.lat, lastCoords.lon, dayStart);
      const dm = computeDayMetrics(d);
      const trendCls = dm ? dm.trend.cls : 'trend-steady';
      // Major bite windows: full-height band with a solid border, strongest visual weight.
      // Fill opacity is driven by the estimated effectiveness score (more vivid = stronger).
      sol.majors.forEach(mm => {
        majorTimesMs.push(mm.center.getTime());
        const cx = xForTime(mm.center.getTime());
        const halfW = pph; // 1 hour half-width -> 2h window
        const eff = computeBiteEffectiveness(mm.center, true, trendCls);
        const opacity = (0.16 + (eff / 100) * 0.34).toFixed(2);
        bandsHtml += `<rect x="${(cx - halfW).toFixed(1)}" y="${plotTop}" width="${(halfW * 2).toFixed(1)}" height="${plotH}" fill="${MAJOR_COLOR}" opacity="${opacity}" stroke="${MAJOR_COLOR}" stroke-width="1.5" stroke-opacity="0.7"><title>Major bite window: ${shortClockWords(mm.center)} (2h) — ~${eff}% estimated effectiveness</title></rect>`;
        if (!compact) moonMarks.push({ x: cx, color: MAJOR_COLOR, text: shortClockWords(mm.center), bold: true });
      });
      // Minor bite windows (moonrise/moonset): shorter, lighter band in a distinct hue from major.
      sol.minors.forEach(mm => {
        minorTimesMs.push(mm.center.getTime());
        const cx = xForTime(mm.center.getTime());
        const halfW = pph / 2;
        const bandTop = plotTop + plotH * 0.25;
        const eff = computeBiteEffectiveness(mm.center, false, trendCls);
        const opacity = (0.14 + (eff / 100) * 0.30).toFixed(2);
        bandsHtml += `<rect x="${(cx - halfW).toFixed(1)}" y="${bandTop.toFixed(1)}" width="${(halfW * 2).toFixed(1)}" height="${(plotH * 0.5).toFixed(1)}" fill="${MINOR_COLOR}" opacity="${opacity}"><title>Minor bite window: ${shortClockWords(mm.center)} (${mm.label}) — ~${eff}% estimated effectiveness</title></rect>`;
        if (!compact) moonMarks.push({ x: cx, color: MINOR_COLOR, text: shortClockWords(mm.center), bold: false });
      });
    });
    const eventMarks = renderMarksRow(sunMarks, sunRowY) + renderMarksRow(moonMarks, moonRowY);

    let dividers = '', dayLabels = '';
    days.forEach((d, i) => {
      const dayStartX = xForTime(new Date(d + 'T00:00:00').getTime());
      if (i > 0) dividers += `<line x1="${dayStartX}" x2="${dayStartX}" y1="${plotTop}" y2="${plotTop + plotH}" stroke="${CT.divider}" stroke-width="1"/>`;
      const isToday = d === todayStr;
      const [, mo, da] = d.split('-');
      const weekday = isToday ? 'Today' : new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
      const label = `${weekday} ${da}/${mo}`;
      dayLabels += `<text x="${dayStartX + 4}" y="${axisY}" text-anchor="start" font-size="11" fill="${isToday ? '#4C9F94' : '#6B7A99'}" font-family="Work Sans, sans-serif" font-weight="${isToday ? '600' : '400'}">${label}</text>`;
    });

    // Interactive cursor: defaults to "now" until the user clicks/drags the chart to pin it elsewhere.
    // It snaps onto major/minor bite peaks and sunrise/sunset (see sunMoonSnappedTimeFromClientX),
    // taking on that event's color with a glow when locked, so it's easy to find and unmistakable.
    const cursorTime = sunMoonCursorTime || new Date(weatherData.current.time);
    let cursorLine = '';
    if (cursorTime >= wStart && cursorTime <= wEnd) {
      const x = xForTime(cursorTime.getTime());
      const snapColor = sunMoonSnapColor(cursorTime.getTime(), majorTimesMs, minorTimesMs, sunEventTimesMs);
      const isSnapped = snapColor !== null;
      const cursorColor = snapColor || CT.text;
      cursorLine = `
        <circle id="sunMoonCursorGlow" cx="${x}" cy="${plotTop - 6}" r="8" fill="${cursorColor}" opacity="${isSnapped ? 0.25 : 0}"/>
        <line id="sunMoonCursorLine" x1="${x}" x2="${x}" y1="${plotTop - 6}" y2="${plotTop + plotH + 6}" stroke="${cursorColor}" stroke-width="${isSnapped ? 2.5 : 2}" stroke-linecap="round"/>
        <circle id="sunMoonCursorDot" cx="${x}" cy="${plotTop - 6}" r="${isSnapped ? 5 : 4}" fill="${cursorColor}"/>
        <rect id="sunMoonCursorHandle" x="${x - 12}" y="${plotTop - 14}" width="24" height="${plotH + 28}" fill="transparent" style="cursor:grab; touch-action:none;"/>
      `;
    }

    const horizonLine = `<line x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}" stroke="${CT.horizon}" stroke-width="1" stroke-dasharray="3,3"/>`;
    const rowDividers = compact ? '' : `<line x1="0" x2="${W}" y1="${plotBottom + 8}" y2="${plotBottom + 8}" stroke="${CT.faintDivider}" stroke-width="1"/>`;

    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${bandsHtml}${dividers}${horizonLine}${rowDividers}
      <path d="${sunPts.join(' ')}" fill="none" stroke="${SUN_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${moonPts.join(' ')}" fill="none" stroke="${MOON_COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${cursorLine}${eventMarks}${dayLabels}
    </svg>`;

    sunMoonChartMeta = { wStartMs: wStart.getTime(), wEndMs: wEnd.getTime(), pph, majorTimesMs, minorTimesMs, sunEventTimesMs };
    return svg;
  }

  // ---- Cursor info key: sun/moon position & bite status at a given time ----
  function biteStatusAt(time) {
    const dayStart = new Date(fmtDateStr(time) + 'T00:00:00');
    const sol = computeSolunar(lastCoords.lat, lastCoords.lon, dayStart);
    for (const mm of sol.majors) {
      if (Math.abs(time - mm.center) <= 60 * 60000) return { active: true, type: 'major', center: mm.center };
    }
    for (const mm of sol.minors) {
      if (Math.abs(time - mm.center) <= 30 * 60000) return { active: true, type: 'minor', center: mm.center };
    }
    return { active: false };
  }

  // Sun icon reflects altitude: full sun in daylight, a sun on the horizon (with a rise/set
  // chevron) through twilight, and a quiet starfield once it's well below the horizon.
  function sunStateGlyph(altitudeDeg, rising, size) {
    const s = size || 26;
    if (altitudeDeg >= 6) {
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#E3A857" stroke-width="1.6">
        <circle cx="12" cy="12" r="4.5"/>
        <path d="M12 1.5v2.5M12 20v2.5M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2 19 19M5 19l1.8-1.8M17.2 6.8 19 5" stroke-linecap="round"/>
      </svg>`;
    }
    if (altitudeDeg > -6) {
      const arrow = rising
        ? '<path d="M9 4.5 12 1.5 15 4.5" stroke="#E3A857" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<path d="M9 1.5 12 4.5 15 1.5" stroke="#E3A857" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24">
        <path d="M6.5 15a5.5 5.5 0 0 1 11 0Z" fill="#E3A857"/>
        <line x1="2" y1="15" x2="22" y2="15" stroke="#6B7A99" stroke-width="1.6" stroke-linecap="round"/>
        ${arrow}
      </svg>`;
    }
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24">
      <line x1="2" y1="15" x2="22" y2="15" stroke="#6B7A99" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="8" cy="7" r="1.1" fill="#6B7A99"/><circle cx="16" cy="5" r="0.9" fill="#6B7A99"/><circle cx="13" cy="10" r="0.7" fill="#6B7A99"/>
    </svg>`;
  }

  function sunMoonCursorInfoHtml(time) {
    const sunAlt = SunCalc.getPosition(time, lastCoords.lat, lastCoords.lon).altitude * 180 / Math.PI;
    const sunAltSoon = SunCalc.getPosition(new Date(time.getTime() + 5 * 60000), lastCoords.lat, lastCoords.lon).altitude * 180 / Math.PI;
    const moonAlt = SunCalc.getMoonPosition(time, lastCoords.lat, lastCoords.lon).altitude * 180 / Math.PI;
    const illum = SunCalc.getMoonIllumination(time);
    const bite = biteStatusAt(time);

    const sunState = sunAlt > 0 ? 'above horizon' : 'below horizon';
    const moonState = moonAlt > 0 ? 'above horizon' : 'below horizon';
    const biteText = bite.active ? `${bite.type === 'major' ? 'Major' : 'Minor'} bite window (peak ${shortClockWords(bite.center)})` : 'Not a bite window';
    const biteClass = bite.active ? (bite.type === 'major' ? 'cursor-bite-major' : 'cursor-bite-minor') : '';

    return `
      <div class="cursor-time">${chipLabel(fmtDateStr(time), todayStr)} · ${clockLabel(time)}</div>
      <div class="cursor-row"><span class="cursor-icon">${sunStateGlyph(sunAlt, sunAltSoon > sunAlt)}</span>Sun ${Math.round(sunAlt)}° (${sunState})</div>
      <div class="cursor-row"><span class="cursor-icon" style="opacity:${moonAlt > 0 ? 1 : 0.4};">${moonPhaseGlyph(illum.phase, '#F5F3EE', '#1C2541', 26)}</span>Moon ${Math.round(moonAlt)}° (${moonState}) · ${moonPhaseName(illum.phase)}, ${Math.round(illum.fraction * 100)}% lit</div>
      <div class="cursor-row ${biteClass}"><span class="cursor-dot"></span>${biteText}</div>
    `;
  }

  function updateSunMoonCursor(time) {
    if (sunMoonChartMeta) {
      const clampedMs = Math.min(sunMoonChartMeta.wEndMs, Math.max(sunMoonChartMeta.wStartMs, time.getTime()));
      time = new Date(clampedMs);
    }
    sunMoonCursorTime = time;
    if (sunMoonChartMeta) {
      const x = ((time - sunMoonChartMeta.wStartMs) / 3600000) * sunMoonChartMeta.pph;
      const snapColor = sunMoonSnapColor(time.getTime(), sunMoonChartMeta.majorTimesMs, sunMoonChartMeta.minorTimesMs, sunMoonChartMeta.sunEventTimesMs);
      const isSnapped = snapColor !== null;
      const cursorColor = snapColor || chartTheme().text;
      const glow = document.getElementById('sunMoonCursorGlow');
      const line = document.getElementById('sunMoonCursorLine');
      const dot = document.getElementById('sunMoonCursorDot');
      const handle = document.getElementById('sunMoonCursorHandle');
      if (glow) { glow.setAttribute('cx', x); glow.setAttribute('fill', cursorColor); glow.setAttribute('opacity', isSnapped ? 0.25 : 0); }
      if (line) { line.setAttribute('x1', x); line.setAttribute('x2', x); line.setAttribute('stroke', cursorColor); line.setAttribute('stroke-width', isSnapped ? 2.5 : 2); }
      if (dot) { dot.setAttribute('cx', x); dot.setAttribute('fill', cursorColor); dot.setAttribute('r', isSnapped ? 5 : 4); }
      if (handle) handle.setAttribute('x', x - 12);
    }
    const infoEl = document.getElementById('sunMoonCursorInfo');
    if (infoEl) infoEl.innerHTML = sunMoonCursorInfoHtml(time);
  }

  function renderSunMoonPanel() {
    const svg = buildSunMoonChart(sunMoonRange);
    const cursorTime = sunMoonCursorTime || new Date(weatherData.current.time);
    return `
      <div class="panel trend-panel">
        <div class="trend-header">
          <p class="panel-title">Sun, moon &amp; bite times<button type="button" class="info-btn" id="sunMoonInfoBtn" aria-label="About this chart">i</button></p>
          <div class="trend-toggle" id="sunMoonToggle">
            <button data-range="1" class="${sunMoonRange === '1' ? 'active' : ''}">1 Day</button>
            <button data-range="3" class="${sunMoonRange === '3' ? 'active' : ''}">3 Day</button>
            <button data-range="7" class="${sunMoonRange === '7' ? 'active' : ''}">Week</button>
          </div>
        </div>
        <div class="chart-info-popup" id="sunMoonInfoPopup" hidden>
          <button type="button" class="info-popup-close" id="sunMoonInfoCloseBtn" aria-label="Close">&times;</button>
          ${sunMoonInfoPopupHtml(sunMoonRange)}
        </div>
        <div class="chart-cursor-info" id="sunMoonCursorInfo">${sunMoonCursorInfoHtml(cursorTime)}</div>
        <div class="sunmoon-chart-container">
          <div class="sunmoon-chart-wrap" id="sunMoonChartWrap">${svg}</div>
          <button type="button" class="chart-today-btn" id="sunMoonTodayBtn">Today</button>
        </div>
        <div class="sunmoon-legend">
          <span class="legend-item"><span class="legend-dot" style="background:#E3A857;"></span>Sun altitude</span>
          <span class="legend-item"><span class="legend-dot" style="background:#6B7A99;"></span>Moon altitude</span>
          <span class="legend-item"><span class="legend-dot" style="background:#4C9F94;"></span>Major bite (2h)</span>
          <span class="legend-item"><span class="legend-dot" style="background:#8C9BB5;"></span>Minor bite (1h)</span>
        </div>
      </div>
    `;
  }

  // Centers on wherever the cursor currently is (not "now"), so switching between 1/3/Week
  // zooms — or any other re-render — keeps showing the same moment instead of snapping back.
  function scrollSunMoonToFocus(smooth) {
    const wrap = document.getElementById('sunMoonChartWrap');
    if (!wrap) return;
    const days = weatherData.daily.time;
    const wStart = new Date(days[0] + 'T00:00:00');
    const wEnd = new Date(days[days.length - 1] + 'T23:59:59');
    const pph = sunMoonPPH(sunMoonRange);
    const cursor = sunMoonCursorTime || new Date(weatherData.current.time);
    const focusTime = (cursor >= wStart && cursor <= wEnd) ? cursor : new Date(selectedDateStr + 'T12:00:00');
    const x = ((focusTime - wStart) / 3600000) * pph;
    const left = Math.max(0, x - wrap.clientWidth / 2);
    if (smooth) wrap.scrollTo({ left, behavior: 'smooth' });
    else wrap.scrollLeft = left;
  }

  function jumpSunMoonToToday() {
    if (!weatherData) return;
    updateSunMoonCursor(new Date(weatherData.current.time));
    scrollSunMoonToFocus(true);
  }

  function sunMoonTimeFromClientX(clientX) {
    const wrap = document.getElementById('sunMoonChartWrap');
    const svgEl = wrap && wrap.querySelector('svg');
    if (!svgEl || !sunMoonChartMeta) return null;
    const rect = svgEl.getBoundingClientRect();
    const scale = svgEl.viewBox.baseVal.width / rect.width;
    const dataX = (clientX - rect.left) * scale;
    const ms = sunMoonChartMeta.wStartMs + (dataX / sunMoonChartMeta.pph) * 3600000;
    return new Date(ms);
  }

  // A fixed time window (not pixel-based) so the pull feels consistent at every zoom level —
  // a pixel radius would swing from under a minute at the Week zoom to nearly an hour at the
  // 1 Day zoom, since those map very different amounts of time to the same screen distance.
  // Each event type gets its own "slight" pull window, roughly scaled to how prominent that
  // event is (majors have the widest 2h band, minors and sun events are more momentary).
  const SUNMOON_SNAP_WINDOWS = [
    { key: 'majorTimesMs', ms: 10 * 60000 },
    { key: 'minorTimesMs', ms: 6 * 60000 },
    { key: 'sunEventTimesMs', ms: 6 * 60000 },
  ];

  // Pulls the cursor onto the nearest significant event — major/minor bite peak, sunrise, or
  // sunset — when it's within that event's window, so those moments are easy to land on
  // precisely without needing pixel-perfect dragging. When more than one is in range, whichever
  // is genuinely closest wins.
  function sunMoonSnapTime(rawTime) {
    if (!rawTime || !sunMoonChartMeta) return rawTime;
    const rawMs = rawTime.getTime();
    let best = null, bestDist = Infinity;
    SUNMOON_SNAP_WINDOWS.forEach(({ key, ms }) => {
      (sunMoonChartMeta[key] || []).forEach(t => {
        const dist = Math.abs(t - rawMs);
        if (dist <= ms && dist < bestDist) { bestDist = dist; best = t; }
      });
    });
    return best !== null ? new Date(best) : rawTime;
  }

  function sunMoonSnappedTimeFromClientX(clientX) {
    return sunMoonSnapTime(sunMoonTimeFromClientX(clientX));
  }

  function handleSunMoonChartClick(e) {
    if (e.target.id === 'sunMoonCursorHandle') return; // a plain tap-without-drag on the handle is a no-op here
    const time = sunMoonSnappedTimeFromClientX(e.clientX);
    if (time) updateSunMoonCursor(time);
  }

  const SUNMOON_EDGE_ZONE = 50; // px from the visible chart's edge that triggers auto-scroll
  const SUNMOON_MAX_SCROLL_SPEED = 14; // px per animation frame at the very edge

  function sunMoonAutoScrollStep() {
    const wrap = document.getElementById('sunMoonChartWrap');
    if (!wrap || !draggingSunMoonCursor || sunMoonAutoScrollDir === 0) { sunMoonAutoScrollRAF = null; return; }
    const maxScroll = wrap.scrollWidth - wrap.clientWidth;
    wrap.scrollLeft = Math.max(0, Math.min(maxScroll, wrap.scrollLeft + sunMoonAutoScrollDir * sunMoonAutoScrollSpeed));
    const time = sunMoonSnappedTimeFromClientX(sunMoonLastClientX);
    if (time) updateSunMoonCursor(time);
    sunMoonAutoScrollRAF = requestAnimationFrame(sunMoonAutoScrollStep);
  }

  function updateSunMoonAutoScroll(clientX) {
    const wrap = document.getElementById('sunMoonChartWrap');
    if (!wrap) { sunMoonAutoScrollDir = 0; return; }
    const rect = wrap.getBoundingClientRect();
    const leftDist = clientX - rect.left;
    const rightDist = rect.right - clientX;
    if (leftDist < SUNMOON_EDGE_ZONE) {
      sunMoonAutoScrollDir = -1;
      sunMoonAutoScrollSpeed = SUNMOON_MAX_SCROLL_SPEED * (1 - Math.max(0, leftDist) / SUNMOON_EDGE_ZONE);
    } else if (rightDist < SUNMOON_EDGE_ZONE) {
      sunMoonAutoScrollDir = 1;
      sunMoonAutoScrollSpeed = SUNMOON_MAX_SCROLL_SPEED * (1 - Math.max(0, rightDist) / SUNMOON_EDGE_ZONE);
    } else {
      sunMoonAutoScrollDir = 0;
    }
    if (sunMoonAutoScrollDir !== 0 && !sunMoonAutoScrollRAF) {
      sunMoonAutoScrollRAF = requestAnimationFrame(sunMoonAutoScrollStep);
    }
  }

  function stopSunMoonAutoScroll() {
    sunMoonAutoScrollDir = 0;
    if (sunMoonAutoScrollRAF) { cancelAnimationFrame(sunMoonAutoScrollRAF); sunMoonAutoScrollRAF = null; }
  }

  function handleSunMoonPointerDown(e) {
    if (e.target.id !== 'sunMoonCursorHandle') return;
    draggingSunMoonCursor = true;
    sunMoonLastClientX = e.clientX;
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    e.target.style.cursor = 'grabbing';
    const time = sunMoonSnappedTimeFromClientX(e.clientX);
    if (time) updateSunMoonCursor(time);
    e.preventDefault();
  }

  function handleSunMoonPointerMove(e) {
    if (!draggingSunMoonCursor) return;
    sunMoonLastClientX = e.clientX;
    const time = sunMoonSnappedTimeFromClientX(e.clientX);
    if (time) updateSunMoonCursor(time);
    updateSunMoonAutoScroll(e.clientX);
  }

  function handleSunMoonPointerUp(e) {
    if (!draggingSunMoonCursor) return;
    draggingSunMoonCursor = false;
    stopSunMoonAutoScroll();
    if (e.target.id === 'sunMoonCursorHandle') e.target.style.cursor = 'grab';
  }

