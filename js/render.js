  // The "Through the day / This week at a glance" block, its own panel independent of the hero,
  // compare table, and either chart — extracted so the Daily/Weekly toggle can rebuild just this
  // (see wireOutlookToggle/refreshOutlookBlock) instead of the whole dated-content area.
  function buildOutlookBlockHtml(dateStr, m) {
    const hourlyTimes = weatherData.hourly.time;
    const slotHours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
    const nowHour = m.isToday ? (new Date(weatherData.current.time)).getHours().toString().padStart(2, '0') : null;
    const hourlyHtml = slotHours.map(hh => {
      const idx = findIndexForDateHour(hourlyTimes, dateStr, hh);
      if (idx === -1) return '';
      const d2 = describeCode(weatherData.hourly.weather_code[idx]);
      const t = weatherData.hourly.temperature_2m[idx];
      const isNow = m.isToday && hh.split(':')[0] === nowHour;
      const hLabel = (parseInt(hh) % 12 === 0 ? 12 : parseInt(hh) % 12) + (parseInt(hh) < 12 ? 'AM' : 'PM');
      return `<div class="hour-item ${isNow ? 'is-now' : ''}"><div class="time">${hLabel}</div>${glyphFor(d2.kind, chartTheme().text)}<div class="temp">${fmtTemp(t)}</div></div>`;
    }).join('');

    const upcoming = [];
    for (let i = 0; i < weatherData.daily.time.length; i++) {
      if (weatherData.daily.time[i] >= todayStr && upcoming.length < 7) upcoming.push(i);
    }
    const dailyHtml = upcoming.map(i => {
      const d = weatherData.daily.time[i];
      const desc2 = describeCode(weatherData.daily.weather_code[i]);
      return `<div class="daily-row" data-date="${d}"><div class="day">${chipLabel(d, todayStr)}</div>${glyphFor(desc2.kind, '#6B7A99')}<div class="cond">${desc2.text}</div><div class="range"><span>${fmtTemp(weatherData.daily.temperature_2m_max[i])}</span> <span class="lo">${fmtTemp(weatherData.daily.temperature_2m_min[i])}</span></div></div>`;
    }).join('');

    return `
      <div id="outlookBlock">
        <p class="section-label outlook-label">
          <span>${outlookView === 'daily' ? 'Through the day' : 'This week at a glance'}</span>
          <span class="outlook-label-sep">|</span>
          <span class="outlook-toggle" id="outlookToggle">
            <button data-view="daily" class="${outlookView === 'daily' ? 'active' : ''}">Daily</button>
            <button data-view="weekly" class="${outlookView === 'weekly' ? 'active' : ''}">Weekly</button>
          </span>
        </p>
        ${outlookView === 'daily'
          ? `<div class="hourly-strip">${hourlyHtml}</div>`
          : `<div class="daily-list">${dailyHtml}</div>`}
      </div>
    `;
  }

  function wireOutlookToggle() {
    document.querySelectorAll('#outlookToggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        outlookView = btn.dataset.view;
        refreshOutlookBlock();
      });
    });
    document.querySelectorAll('.daily-row').forEach(row => {
      row.addEventListener('click', () => selectDate(row.dataset.date, true));
    });
  }

  function refreshOutlookBlock() {
    const el = document.getElementById('outlookBlock');
    const m = computeDayMetrics(selectedDateStr);
    if (!el || !m) return;
    el.outerHTML = buildOutlookBlockHtml(selectedDateStr, m);
    wireOutlookToggle();
  }

  function renderForDate(dateStr, smoothScroll) {
    const m = computeDayMetrics(dateStr);
    if (!m) { contentEl.innerHTML = `<div class="status">No weather data available for this date.</div>`; return; }

    const colors = heroColorsFor(m.desc.kind);
    const minIdxDate = weatherData.daily.time[0];
    const maxIdxDate = weatherData.daily.time[weatherData.daily.time.length - 1];
    const canPrev = dateStr !== minIdxDate;
    const canNext = dateStr !== maxIdxDate;

    const waterTempHtml = m.marineAvailable && m.waterTemp !== null
      ? `<div class="value">${fmtTemp(m.waterTemp)}</div>`
      : `<div class="value" style="font-size:14px; color:var(--text-muted); font-weight:400;">${m.marineAvailable ? 'No data' : 'Outside forecast range'}</div>`;
    const waveHtml = m.marineAvailable && m.waveHeight !== null
      ? `<div class="value">${fmtWave(m.waveHeight)}<span class="unit">${waveUnitLabel()}</span></div>`
      : `<div class="value" style="font-size:14px; color:var(--text-muted); font-weight:400;">${m.marineAvailable ? 'No data' : 'Outside forecast range'}</div>`;

    // Split out of the old single "Fishing conditions" panel now that wind has its own tab —
    // pressure/water/waves stay on the Weather tab (water & waves are a placeholder home until
    // there's an actual Tides & Swell tab to move them into).
    const weatherCondHtml = `
      <div class="cond-grid">
        <div class="cond-item">
          <div class="label">Pressure</div>
          <div class="value">${fmtPressure(m.pressureNow)}<span class="unit">${pressureUnitLabel()}</span> <span class="trend-arrow ${m.trend.cls}">${m.trend.arrow}</span></div>
          <div class="note" style="margin-top:2px;">${m.trend.label}</div>
        </div>
        <div class="cond-item"><div class="label">Water temp</div>${waterTempHtml}</div>
        <div class="cond-item"><div class="label">Wave height</div>${waveHtml}</div>
      </div>
    `;
    const windCondHtml = `
      <div class="cond-item">
        <div class="label">Speed</div>
        <div class="value">${fmtWind(m.windAt)}<span class="unit">${windUnitLabel()}</span></div>
      </div>
    `;

    const sunMoonHtml = `
      <div class="sunmoon-grid">
        <div class="sunmoon-col">${sunGlyph('#E3A857')}<div class="lines"><div class="t1">${m.sunrise ? clockLabel(m.sunrise) : '--'}</div><div class="t2">Sunrise</div></div></div>
        <div class="sunmoon-col">${sunGlyph('#6B7A99')}<div class="lines"><div class="t1">${m.sunset ? clockLabel(m.sunset) : '--'}</div><div class="t2">Sunset</div></div></div>
        <div class="sunmoon-col">${moonPhaseGlyph(m.illum.phase, '#F5F3EE', '#1C2541')}<div class="lines"><div class="t1">${m.moonTimesToday.rise ? clockLabel(m.moonTimesToday.rise) : '--'}</div><div class="t2">Moonrise</div></div></div>
        <div class="sunmoon-col">${moonPhaseGlyph(m.illum.phase, '#F5F3EE', '#1C2541')}<div class="lines"><div class="t1">${m.moonTimesToday.set ? clockLabel(m.moonTimesToday.set) : '--'}</div><div class="t2">Moonset</div></div></div>
      </div>
      <div class="moon-name">${moonPhaseName(m.illum.phase)} · ${Math.round(m.illum.fraction * 100)}% illuminated</div>
    `;

    const dayMinutes = 24 * 60;
    function blockStyle(center, halfWidthMin, cls) {
      let centerMin = minutesOfDay(center);
      const dayDiff = Math.round((new Date(center.getFullYear(), center.getMonth(), center.getDate()) - m.dayStart) / 86400000);
      centerMin += dayDiff * dayMinutes;
      let left = centerMin - halfWidthMin;
      const clippedLeft = Math.max(0, left);
      const clippedRight = Math.min(dayMinutes, left + halfWidthMin * 2);
      const finalWidth = clippedRight - clippedLeft;
      if (finalWidth <= 0) return '';
      return `<div class="tl-block ${cls}" style="left:${(clippedLeft / dayMinutes) * 100}%; width:${(finalWidth / dayMinutes) * 100}%;"></div>`;
    }
    let tlBlocks = '';
    m.solunar.majors.forEach(mm => { tlBlocks += blockStyle(mm.center, 60, 'tl-major'); });
    m.solunar.minors.forEach(mm => { tlBlocks += blockStyle(mm.center, 30, 'tl-minor'); });
    let nowMarker = '';
    if (m.isToday) {
      const nowDate = new Date(weatherData.current.time);
      nowMarker = `<div class="tl-now" style="left:${(minutesOfDay(nowDate) / dayMinutes) * 100}%;"></div>`;
    }
    const solunarListHtml = [
      ...m.solunar.majors.map(mm => `<div><span class="kind">Major</span> — ${clockLabel(mm.center)} (2h window)</div>`),
      ...m.solunar.minors.map(mm => `<div><span class="kind">Minor</span> — ${clockLabel(mm.center)} (${mm.label})</div>`)
    ].join('');
    const solunarHtml = `
      <div class="timeline-track">${tlBlocks}${nowMarker}</div>
      <div class="tl-labels"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span></div>
      <div class="solunar-legend">
        <div class="legend-item"><span class="legend-dot" style="background:var(--teal);"></span>Major period</div>
        <div class="legend-item"><span class="legend-dot" style="background:#A9CFC8;"></span>Minor period</div>
      </div>
      <div class="solunar-list">${solunarListHtml}</div>
    `;

    const dateLabel = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const heroTag = m.isToday ? 'Live now' : (dateStr < todayStr ? 'Midday (recorded)' : 'Midday forecast');

    // ---- Compare table across all fetched days ----
    const compareCols = weatherData.daily.time.map(d => {
      const dm = computeDayMetrics(d);
      if (!dm) return '';
      const isSel = d === selectedDateStr;
      const isTod = d === todayStr;
      const majors = dm.solunar.majors.slice(0, 2).map(x => shortClockWords(x.center)).join('<br>') || '--';
      const waterCell = dm.marineAvailable && dm.waterTemp !== null ? fmtTemp(dm.waterTemp) : '—';
      const waveCell = dm.marineAvailable && dm.waveHeight !== null ? fmtWave(dm.waveHeight) + waveUnitLabel() : '—';
      return `
        <div class="compare-col ${isSel ? 'selected' : ''} ${isTod ? 'is-today' : ''}" data-date="${d}">
          <div class="compare-cell date-cell">${chipLabel(d, todayStr)}</div>
          <div class="compare-cell">${glyphFor(dm.desc.kind, chartTheme().text)}<span class="sub">${fmtTemp(dm.hi)}/${fmtTemp(dm.lo)}</span></div>
          <div class="compare-cell"><span class="trend-arrow ${dm.trend.cls}">${dm.trend.arrow}</span><span class="sub">${fmtPressure(dm.pressureNow)}</span></div>
          <div class="compare-cell">${fmtWind(dm.windAt)}<span class="sub">${windUnitLabel()}</span></div>
          <div class="compare-cell">${waterCell}</div>
          <div class="compare-cell">${waveCell}</div>
          <div class="compare-cell">${moonPhaseGlyph(dm.illum.phase, chartTheme().text, darkMode ? '#2A3350' : '#DCE2EC', 18)}</div>
          <div class="compare-cell" style="font-size:10.5px; line-height:1.3;">${majors}</div>
        </div>
      `;
    }).join('');

    const compareHtml = `
      <div class="compare-wrap">
        <div class="compare-labels">
          <div class="compare-row-label">&nbsp;</div>
          <div class="compare-row-label">Hi / Lo<span class="row-unit">${unit === 'celsius' ? '°C' : '°F'}</span></div>
          <div class="compare-row-label">Pressure<span class="row-unit">${pressureUnitLabel()}</span></div>
          <div class="compare-row-label">Wind<span class="row-unit">${windUnitLabel()}</span></div>
          <div class="compare-row-label">Water<span class="row-unit">${unit === 'celsius' ? '°C' : '°F'}</span></div>
          <div class="compare-row-label">Waves<span class="row-unit">${waveUnitLabel()}</span></div>
          <div class="compare-row-label">Moon</div>
          <div class="compare-row-label">Major</div>
        </div>
        <div class="compare-scroll" id="compareScroll"><div class="compare-cols">${compareCols}</div></div>
      </div>
    `;

    contentEl.innerHTML = `
      <div id="weatherContent" ${activeTab !== 'weather' ? 'hidden' : ''}>
        <div class="hero" style="background:${colors.bg}">
          <div class="hero-nav">
            <button class="hero-arrow" id="prevDayBtn" ${canPrev ? '' : 'disabled'} aria-label="Previous day">‹</button>
            <div>
              <div class="hero-glyph" style="color:${colors.accent}">${glyphFor(m.desc.kind, colors.accent)}</div>
              <p class="hero-location">${lastCoords.name} · ${dateLabel}</p>
              <p class="hero-date-tag">${heroTag}</p>
            </div>
            <button class="hero-arrow" id="nextDayBtn" ${canNext ? '' : 'disabled'} aria-label="Next day">›</button>
          </div>
          <p class="hero-temp">${fmtTemp(m.repTemp)}</p>
          <p class="hero-condition" style="color:${colors.accent}">${m.desc.text}</p>
          <div class="hero-meta"><span>High ${fmtTemp(m.hi)}</span><span>Low ${fmtTemp(m.lo)}</span></div>
        </div>

        <p class="section-label">Compare days <span class="sub">scroll to see more →</span></p>
        ${compareHtml}

        ${buildOutlookBlockHtml(dateStr, m)}

        ${renderTrendPanel()}

        <div class="panel"><p class="panel-title">Conditions</p>${weatherCondHtml}</div>

        <p class="coverage-note">Weather covers roughly the past week through the next two. Sea temp and wave height cover a shorter window since ocean models forecast less far ahead — both are a placeholder home here until there's a dedicated Tides &amp; Swell tab.</p>
      </div>

      <div id="windContent" ${activeTab !== 'wind' ? 'hidden' : ''}>
        <div class="panel"><p class="panel-title">Wind</p>${windCondHtml}</div>
      </div>

      <div id="sunMoonContent" ${activeTab !== 'solunar' ? 'hidden' : ''}>
        <div class="panel"><p class="panel-title">Sun &amp; moon</p>${sunMoonHtml}</div>
        ${renderSunMoonPanel()}
        <div class="panel"><p class="panel-title">Solunar periods</p>${solunarHtml}</div>
      </div>
    `;

    document.getElementById('prevDayBtn').addEventListener('click', () => shiftDate(-1));
    document.getElementById('nextDayBtn').addEventListener('click', () => shiftDate(1));

    // Each toggle rebuilds only its own panel (see wireTrendToggle/wireSunMoonToggle/
    // wireOutlookToggle) rather than calling renderForDate again — switching the sun/moon
    // chart's zoom, for instance, has no reason to also rebuild the compare table and the
    // (unrelated) temperature chart.
    wireTrendToggle();
    wireSunMoonToggle();
    wireOutlookToggle();
    scrollSunMoonToFocus(!!smoothScroll);
    scrollTrendToFocus(!!smoothScroll);

    document.querySelectorAll('.compare-col').forEach(col => {
      col.addEventListener('click', () => selectDate(col.dataset.date, true));
    });

    // Keep the selected compare column fully in view, with a small peek of the previous column
    // (rather than centered) so it's clear on first load that the table scrolls in both directions.
    const selCol = document.querySelector('.compare-col.selected');
    scrollNearStart(document.getElementById('compareScroll'), selCol, 24, false);
  }

